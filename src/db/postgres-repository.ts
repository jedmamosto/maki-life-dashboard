import crypto from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { and, desc, eq, gte, isNull, like, lte, sql } from "drizzle-orm";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import type {
  AvatarColorKey,
  CareEventRecord,
  CareEventType,
  CareRepository,
  Caregiver,
  CaregiverRole,
  DeleteCaregiverResult,
  DispatchChannel,
  DispatchStatus,
  FeedMealResult,
  FeedingLogRecord,
  FeedingPeriod,
  HouseholdSettingsRecord,
  NotificationDispatchRecord,
  PushPlatform,
  PushSubscriptionRecord,
  SupplyKey,
  SupplyLevel,
  SupplyRecord,
  UpdateSupplyResult,
} from "@/lib/types";
import {
  SEEDED_CAREGIVERS,
  computeNextSupplyAlertState,
  createInitialCareStore,
} from "./file-repository";
import * as schema from "./schema";

type CareDb = NeonHttpDatabase<typeof schema>;

function normalizeAvatarColor(raw: string): AvatarColorKey {
  if (
    raw === "helper" ||
    raw === "mom" ||
    raw === "dad" ||
    raw === "sibling" ||
    raw === "owner"
  ) {
    return raw;
  }
  const map: Record<string, AvatarColorKey> = {
    "#1E6B5C": "helper",
    "#6D3B7D": "mom",
    "#2B5B84": "dad",
    "#4338CA": "owner",
    "#B3480F": "owner",
  };
  return map[raw.toUpperCase()] ?? "helper";
}

function mapCaregiverRow(row: typeof schema.caregivers.$inferSelect): Caregiver {
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.displayName,
    role: row.role as CaregiverRole,
    avatarInitials: row.avatarInitials,
    avatarColor: normalizeAvatarColor(row.avatarColor),
    isActive: row.isActive,
  };
}

function mapFeedingRow(
  row: typeof schema.feedingLogs.$inferSelect,
): FeedingLogRecord {
  return {
    id: row.id,
    slotKey: row.slotKey,
    serviceDate: row.serviceDate,
    period: row.period as FeedingPeriod,
    dueAtIso: row.dueAtIso,
    completedById: row.completedById,
    completedAtIso: row.completedAt.toISOString(),
    undoneAtIso: row.undoneAt ? row.undoneAt.toISOString() : null,
  };
}

function mapCareEventRow(
  row: typeof schema.careEvents.$inferSelect,
): CareEventRecord {
  return {
    id: row.id,
    eventType: row.eventType as CareEventType,
    caregiverId: row.caregiverId,
    occurredAtIso: row.occurredAt.toISOString(),
    isoWeekKey: row.isoWeekKey,
    idempotencyKey: row.idempotencyKey,
  };
}

function mapSupplyRow(
  row: typeof schema.supplies.$inferSelect,
): SupplyRecord {
  return {
    supplyKey: row.supplyKey as SupplyKey,
    level: row.level as SupplyLevel,
    updatedById: row.updatedById,
    updatedAtIso: row.updatedAt.toISOString(),
    lastAlertedLevel:
      row.lastAlertedLevel === "LOW" || row.lastAlertedLevel === "EMPTY"
        ? row.lastAlertedLevel
        : null,
  };
}

function mapPushSubscriptionRow(
  row: typeof schema.pushSubscriptions.$inferSelect,
): PushSubscriptionRecord {
  return {
    id: row.id,
    caregiverId: row.caregiverId,
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    auth: row.auth,
    platform: row.platform as PushPlatform,
    supportsDeclarative: row.supportsDeclarative,
    lastSeenAtIso: row.lastSeenAt.toISOString(),
    lastSuccessAtIso: row.lastSuccessAt
      ? row.lastSuccessAt.toISOString()
      : null,
    revokedAtIso: row.revokedAt ? row.revokedAt.toISOString() : null,
  };
}

function mapSettingsRow(
  row: typeof schema.householdSettings.$inferSelect,
): HouseholdSettingsRecord {
  return {
    id: row.id,
    householdTimezone: row.householdTimezone,
    amMealHour: row.amMealHour,
    amMealMinute: row.amMealMinute,
    midMealHour: row.midMealHour,
    midMealMinute: row.midMealMinute,
    pmMealHour: row.pmMealHour,
    pmMealMinute: row.pmMealMinute,
    litterIntervalHours: row.litterIntervalHours,
    weeklyPlayGoal: row.weeklyPlayGoal,
    ownerEmail: row.ownerEmail,
    ownerPinHash: row.ownerPinHash,
    activeTokenHash: row.activeTokenHash,
    updatedAtIso: row.updatedAt.toISOString(),
  };
}

export class PostgresCareRepository implements CareRepository {
  private dbInstance: CareDb | null = null;
  private seededPromise: Promise<void> | null = null;

  private getDb(): CareDb {
    if (!this.dbInstance) {
      const url = process.env.DATABASE_URL;
      if (!url) {
        throw new Error("DATABASE_URL is required for PostgresCareRepository");
      }
      const sqlClient = neon(url);
      this.dbInstance = drizzle(sqlClient, { schema });
    }
    return this.dbInstance;
  }

  private async ensureSeeded(): Promise<CareDb> {
    const db = this.getDb();
    if (!this.seededPromise) {
      this.seededPromise = (async () => {
        await db.execute(
          sql`ALTER TABLE household_settings ADD COLUMN IF NOT EXISTS mid_meal_hour integer NOT NULL DEFAULT 14`,
        );
        await db.execute(
          sql`ALTER TABLE household_settings ADD COLUMN IF NOT EXISTS mid_meal_minute integer NOT NULL DEFAULT 0`,
        );
        const initial = createInitialCareStore();
        for (const cg of SEEDED_CAREGIVERS) {
          await db
            .insert(schema.caregivers)
            .values({
              id: cg.id,
              slug: cg.slug,
              displayName: cg.displayName,
              role: cg.role,
              avatarInitials: cg.avatarInitials,
              avatarColor: cg.avatarColor,
              isActive: cg.isActive,
            })
            .onConflictDoNothing();
        }
        await db
          .insert(schema.householdSettings)
          .values({
            id: initial.settings.id,
            householdTimezone: initial.settings.householdTimezone,
            amMealHour: initial.settings.amMealHour,
            amMealMinute: initial.settings.amMealMinute,
            midMealHour: initial.settings.midMealHour,
            midMealMinute: initial.settings.midMealMinute,
            pmMealHour: initial.settings.pmMealHour,
            pmMealMinute: initial.settings.pmMealMinute,
            litterIntervalHours: initial.settings.litterIntervalHours,
            weeklyPlayGoal: initial.settings.weeklyPlayGoal,
            ownerEmail: initial.settings.ownerEmail,
            ownerPinHash: initial.settings.ownerPinHash,
            activeTokenHash: initial.settings.activeTokenHash,
            updatedAt: new Date(initial.settings.updatedAtIso),
          })
          .onConflictDoNothing();
        for (const supply of initial.supplies) {
          await db
            .insert(schema.supplies)
            .values({
              supplyKey: supply.supplyKey,
              level: supply.level,
              updatedById: supply.updatedById,
              updatedAt: new Date(supply.updatedAtIso),
              lastAlertedLevel: supply.lastAlertedLevel,
            })
            .onConflictDoNothing();
        }
      })().catch((err) => {
        this.seededPromise = null;
        throw err;
      });
    }
    await this.seededPromise;
    return db;
  }

  public async listCaregivers(): Promise<Caregiver[]> {
    const db = await this.ensureSeeded();
    const rows = await db.select().from(schema.caregivers);
    return rows.map(mapCaregiverRow);
  }

  public async getCaregiverById(id: string): Promise<Caregiver | null> {
    const db = await this.ensureSeeded();
    const rows = await db
      .select()
      .from(schema.caregivers)
      .where(eq(schema.caregivers.id, id))
      .limit(1);
    return rows[0] ? mapCaregiverRow(rows[0]) : null;
  }

  public async getCaregiverBySlug(slug: string): Promise<Caregiver | null> {
    const db = await this.ensureSeeded();
    const rows = await db
      .select()
      .from(schema.caregivers)
      .where(eq(schema.caregivers.slug, slug))
      .limit(1);
    return rows[0] ? mapCaregiverRow(rows[0]) : null;
  }

  public async upsertCaregiver(input: Caregiver): Promise<Caregiver> {
    const db = await this.ensureSeeded();
    const rows = await db
      .insert(schema.caregivers)
      .values({
        id: input.id,
        slug: input.slug,
        displayName: input.displayName,
        role: input.role,
        avatarInitials: input.avatarInitials,
        avatarColor: input.avatarColor,
        isActive: input.isActive,
      })
      .onConflictDoUpdate({
        target: schema.caregivers.id,
        set: {
          slug: input.slug,
          displayName: input.displayName,
          role: input.role,
          avatarInitials: input.avatarInitials,
          avatarColor: input.avatarColor,
          isActive: input.isActive,
        },
      })
      .returning();
    return mapCaregiverRow(rows[0]);
  }

  public async deleteCaregiverIfUnused(
    id: string,
  ): Promise<DeleteCaregiverResult> {
    const db = await this.ensureSeeded();
    return db.transaction(async (tx) => {
      const targetRows = await tx
        .select()
        .from(schema.caregivers)
        .where(eq(schema.caregivers.id, id))
        .limit(1);
      const target = targetRows[0];
      if (!target) {
        return { deleted: false, reason: "not_found" };
      }

      if (target.role === "owner" && target.isActive) {
        const allCaregivers = await tx.select().from(schema.caregivers);
        const activeOwners = allCaregivers.filter(
          (c) => c.role === "owner" && c.isActive,
        );
        if (activeOwners.length <= 1) {
          return { deleted: false, reason: "last_owner" };
        }
      }

      const [feedingRef, eventRef, supplyRef, pushRef] = await Promise.all([
        tx
          .select({ id: schema.feedingLogs.id })
          .from(schema.feedingLogs)
          .where(eq(schema.feedingLogs.completedById, id))
          .limit(1),
        tx
          .select({ id: schema.careEvents.id })
          .from(schema.careEvents)
          .where(eq(schema.careEvents.caregiverId, id))
          .limit(1),
        tx
          .select({ supplyKey: schema.supplies.supplyKey })
          .from(schema.supplies)
          .where(eq(schema.supplies.updatedById, id))
          .limit(1),
        tx
          .select({ id: schema.pushSubscriptions.id })
          .from(schema.pushSubscriptions)
          .where(eq(schema.pushSubscriptions.caregiverId, id))
          .limit(1),
      ]);

      if (
        feedingRef.length > 0 ||
        eventRef.length > 0 ||
        supplyRef.length > 0 ||
        pushRef.length > 0
      ) {
        return { deleted: false, reason: "has_history" };
      }

      await tx.delete(schema.caregivers).where(eq(schema.caregivers.id, id));
      return { deleted: true };
    });
  }

  public async getSettings(): Promise<HouseholdSettingsRecord> {
    const db = await this.ensureSeeded();
    const rows = await db
      .select()
      .from(schema.householdSettings)
      .where(eq(schema.householdSettings.id, "default"))
      .limit(1);
    return mapSettingsRow(rows[0]);
  }

  public async updateSettings(
    patch: Partial<Omit<HouseholdSettingsRecord, "id">>,
  ): Promise<HouseholdSettingsRecord> {
    const db = await this.ensureSeeded();
    const updateValues: Partial<typeof schema.householdSettings.$inferInsert> = {};
    if (patch.householdTimezone !== undefined) {
      updateValues.householdTimezone = patch.householdTimezone;
    }
    if (patch.amMealHour !== undefined) updateValues.amMealHour = patch.amMealHour;
    if (patch.amMealMinute !== undefined)
      updateValues.amMealMinute = patch.amMealMinute;
    if (patch.midMealHour !== undefined)
      updateValues.midMealHour = patch.midMealHour;
    if (patch.midMealMinute !== undefined)
      updateValues.midMealMinute = patch.midMealMinute;
    if (patch.pmMealHour !== undefined) updateValues.pmMealHour = patch.pmMealHour;
    if (patch.pmMealMinute !== undefined)
      updateValues.pmMealMinute = patch.pmMealMinute;
    if (patch.litterIntervalHours !== undefined) {
      updateValues.litterIntervalHours = patch.litterIntervalHours;
    }
    if (patch.weeklyPlayGoal !== undefined) {
      updateValues.weeklyPlayGoal = patch.weeklyPlayGoal;
    }
    if (patch.ownerEmail !== undefined) updateValues.ownerEmail = patch.ownerEmail;
    if (patch.ownerPinHash !== undefined) {
      updateValues.ownerPinHash = patch.ownerPinHash;
    }
    if (patch.activeTokenHash !== undefined) {
      updateValues.activeTokenHash = patch.activeTokenHash;
    }
    updateValues.updatedAt = patch.updatedAtIso
      ? new Date(patch.updatedAtIso)
      : new Date();

    const rows = await db
      .update(schema.householdSettings)
      .set(updateValues)
      .where(eq(schema.householdSettings.id, "default"))
      .returning();
    return mapSettingsRow(rows[0]);
  }

  public async getActiveFeedingBySlot(
    slotKey: string,
  ): Promise<FeedingLogRecord | null> {
    const db = await this.ensureSeeded();
    const rows = await db
      .select()
      .from(schema.feedingLogs)
      .where(
        and(
          eq(schema.feedingLogs.slotKey, slotKey),
          isNull(schema.feedingLogs.undoneAt),
        ),
      )
      .limit(1);
    return rows[0] ? mapFeedingRow(rows[0]) : null;
  }

  public async listFeedingsInRange(
    startDateKey: string,
    endDateKey: string,
  ): Promise<FeedingLogRecord[]> {
    const db = await this.ensureSeeded();
    const rows = await db
      .select()
      .from(schema.feedingLogs)
      .where(
        and(
          isNull(schema.feedingLogs.undoneAt),
          gte(schema.feedingLogs.serviceDate, startDateKey),
          lte(schema.feedingLogs.serviceDate, endDateKey),
        ),
      );
    return rows.map(mapFeedingRow);
  }

  public async logFeedingAtomic(input: {
    slotKey: string;
    serviceDate: string;
    period: FeedingPeriod;
    dueAtIso: string;
    completedById: string;
    completedAtIso: string;
  }): Promise<FeedMealResult> {
    const db = await this.ensureSeeded();
    const inserted = await db
      .insert(schema.feedingLogs)
      .values({
        id: crypto.randomUUID(),
        slotKey: input.slotKey,
        serviceDate: input.serviceDate,
        period: input.period,
        dueAtIso: input.dueAtIso,
        completedById: input.completedById,
        completedAt: new Date(input.completedAtIso),
        undoneAt: null,
      })
      .onConflictDoNothing()
      .returning();

    if (inserted.length > 0) {
      const record = mapFeedingRow(inserted[0]);
      const completedBy =
        (await this.getCaregiverById(record.completedById)) ??
        (await this.listCaregivers())[0];
      return { alreadyFed: false, record, completedBy };
    }

    const existing = await this.getActiveFeedingBySlot(input.slotKey);
    if (!existing) {
      throw new Error(`Concurrent feeding conflict on ${input.slotKey}`);
    }
    const completedBy =
      (await this.getCaregiverById(existing.completedById)) ??
      (await this.listCaregivers())[0];
    return { alreadyFed: true, record: existing, completedBy };
  }

  public async undoFeedingBySlot(
    slotKey: string,
    undoneAtIso: string,
  ): Promise<FeedingLogRecord | null> {
    const db = await this.ensureSeeded();
    const rows = await db
      .update(schema.feedingLogs)
      .set({ undoneAt: new Date(undoneAtIso) })
      .where(
        and(
          eq(schema.feedingLogs.slotKey, slotKey),
          isNull(schema.feedingLogs.undoneAt),
        ),
      )
      .returning();
    return rows[0] ? mapFeedingRow(rows[0]) : null;
  }

  public async updateFeedingAttribution(
    slotKey: string,
    caregiverId: string,
  ): Promise<FeedingLogRecord | null> {
    const db = await this.ensureSeeded();
    const rows = await db
      .update(schema.feedingLogs)
      .set({ completedById: caregiverId })
      .where(
        and(
          eq(schema.feedingLogs.slotKey, slotKey),
          isNull(schema.feedingLogs.undoneAt),
        ),
      )
      .returning();
    return rows[0] ? mapFeedingRow(rows[0]) : null;
  }

  public async logCareEvent(
    input: CareEventRecord,
  ): Promise<{ created: boolean; record: CareEventRecord }> {
    const db = await this.ensureSeeded();
    const inserted = await db
      .insert(schema.careEvents)
      .values({
        id: input.id,
        eventType: input.eventType,
        caregiverId: input.caregiverId,
        occurredAt: new Date(input.occurredAtIso),
        isoWeekKey: input.isoWeekKey,
        idempotencyKey: input.idempotencyKey,
      })
      .onConflictDoNothing()
      .returning();

    if (inserted.length > 0) {
      return { created: true, record: mapCareEventRow(inserted[0]) };
    }
    const existing = await db
      .select()
      .from(schema.careEvents)
      .where(eq(schema.careEvents.idempotencyKey, input.idempotencyKey))
      .limit(1);
    return { created: false, record: mapCareEventRow(existing[0]) };
  }

  public async listCareEventsByType(
    eventType: CareEventType,
    limit?: number,
  ): Promise<CareEventRecord[]> {
    const db = await this.ensureSeeded();
    const baseQuery = db
      .select()
      .from(schema.careEvents)
      .where(eq(schema.careEvents.eventType, eventType))
      .orderBy(desc(schema.careEvents.occurredAt));
    const rows =
      typeof limit === "number" ? await baseQuery.limit(limit) : await baseQuery;
    return rows.map(mapCareEventRow);
  }

  public async listCareEventsSince(sinceIso: string): Promise<CareEventRecord[]> {
    const db = await this.ensureSeeded();
    const rows = await db
      .select()
      .from(schema.careEvents)
      .where(gte(schema.careEvents.occurredAt, new Date(sinceIso)));
    return rows.map(mapCareEventRow);
  }

  public async listCareEventsByWeek(
    isoWeekKey: string,
  ): Promise<CareEventRecord[]> {
    const db = await this.ensureSeeded();
    const rows = await db
      .select()
      .from(schema.careEvents)
      .where(eq(schema.careEvents.isoWeekKey, isoWeekKey))
      .orderBy(desc(schema.careEvents.occurredAt));
    return rows.map(mapCareEventRow);
  }

  public async listSupplies(): Promise<SupplyRecord[]> {
    const db = await this.ensureSeeded();
    const rows = await db.select().from(schema.supplies);
    return rows.map(mapSupplyRow);
  }

  public async upsertSupplyAtomic(input: {
    supplyKey: SupplyKey;
    level: SupplyLevel;
    updatedById: string;
    updatedAtIso: string;
  }): Promise<UpdateSupplyResult> {
    const db = await this.ensureSeeded();
    const updatedAtDate = new Date(input.updatedAtIso);

    await db
      .insert(schema.supplies)
      .values({
        supplyKey: input.supplyKey,
        level: input.level,
        updatedById: input.updatedById,
        updatedAt: updatedAtDate,
        lastAlertedLevel: null,
      })
      .onConflictDoNothing();

    const result = await db.execute<{
      supply_key: string;
      level: string;
      updated_by_id: string;
      updated_at: string | Date;
      last_alerted_level: string | null;
      prev_alerted_level: string | null;
    }>(sql`
      UPDATE supplies AS s
      SET
        level = ${input.level},
        updated_by_id = ${input.updatedById},
        updated_at = ${updatedAtDate},
        last_alerted_level = CASE
          WHEN ${input.level} IN ('FULL', 'HALF') THEN NULL
          WHEN ${input.level} = 'LOW' THEN COALESCE(prev.prev_alerted_level, 'LOW')
          WHEN ${input.level} = 'EMPTY' THEN 'EMPTY'
          ELSE prev.prev_alerted_level
        END
      FROM (
        SELECT supply_key, last_alerted_level AS prev_alerted_level
        FROM supplies
        WHERE supply_key = ${input.supplyKey}
        FOR UPDATE
      ) AS prev
      WHERE s.supply_key = prev.supply_key
      RETURNING
        s.supply_key,
        s.level,
        s.updated_by_id,
        s.updated_at,
        s.last_alerted_level,
        prev.prev_alerted_level
    `);

    const row = result.rows[0];
    if (!row) {
      throw new Error(`Failed to upsert supply: ${input.supplyKey}`);
    }

    const prevAlerted =
      row.prev_alerted_level === "LOW" || row.prev_alerted_level === "EMPTY"
        ? row.prev_alerted_level
        : null;
    const { shouldAlertLevel } = computeNextSupplyAlertState(
      prevAlerted,
      input.level,
    );

    const record: SupplyRecord = {
      supplyKey: row.supply_key as SupplyKey,
      level: row.level as SupplyLevel,
      updatedById: row.updated_by_id,
      updatedAtIso:
        row.updated_at instanceof Date
          ? row.updated_at.toISOString()
          : new Date(row.updated_at).toISOString(),
      lastAlertedLevel:
        row.last_alerted_level === "LOW" || row.last_alerted_level === "EMPTY"
          ? row.last_alerted_level
          : null,
    };

    return {
      record,
      shouldAlertLevel,
    };
  }

  public async upsertPushSubscription(
    input: Omit<PushSubscriptionRecord, "id" | "revokedAtIso">,
  ): Promise<PushSubscriptionRecord> {
    const db = await this.ensureSeeded();
    const rows = await db
      .insert(schema.pushSubscriptions)
      .values({
        id: crypto.randomUUID(),
        caregiverId: input.caregiverId,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        platform: input.platform,
        supportsDeclarative: input.supportsDeclarative,
        lastSeenAt: new Date(input.lastSeenAtIso),
        lastSuccessAt: input.lastSuccessAtIso
          ? new Date(input.lastSuccessAtIso)
          : null,
        revokedAt: null,
      })
      .onConflictDoUpdate({
        target: schema.pushSubscriptions.endpoint,
        set: {
          caregiverId: input.caregiverId,
          p256dh: input.p256dh,
          auth: input.auth,
          platform: input.platform,
          supportsDeclarative: input.supportsDeclarative,
          lastSeenAt: new Date(input.lastSeenAtIso),
          revokedAt: null,
        },
      })
      .returning();
    return mapPushSubscriptionRow(rows[0]);
  }

  public async listActivePushSubscriptions(
    roles?: CaregiverRole[],
  ): Promise<PushSubscriptionRecord[]> {
    const db = await this.ensureSeeded();
    const rows = await db
      .select()
      .from(schema.pushSubscriptions)
      .where(isNull(schema.pushSubscriptions.revokedAt));
    const mapped = rows.map(mapPushSubscriptionRow);
    if (!roles) {
      return mapped;
    }
    const roleSet = new Set<CaregiverRole>(roles);
    const caregivers = await this.listCaregivers();
    const roleMap = new Map<string, CaregiverRole>(
      caregivers.map((c) => [c.id, c.role]),
    );
    return mapped.filter((s) => {
      const role = roleMap.get(s.caregiverId);
      return role ? roleSet.has(role) : false;
    });
  }

  public async listAllPushSubscriptions(): Promise<PushSubscriptionRecord[]> {
    const db = await this.ensureSeeded();
    const rows = await db.select().from(schema.pushSubscriptions);
    return rows.map(mapPushSubscriptionRow);
  }

  public async markPushSubscriptionRevoked(
    endpoint: string,
    revokedAtIso: string,
  ): Promise<void> {
    const db = await this.ensureSeeded();
    await db
      .update(schema.pushSubscriptions)
      .set({ revokedAt: new Date(revokedAtIso) })
      .where(eq(schema.pushSubscriptions.endpoint, endpoint));
  }

  public async markPushSubscriptionSuccess(
    endpoint: string,
    successAtIso: string,
  ): Promise<void> {
    const db = await this.ensureSeeded();
    const dt = new Date(successAtIso);
    await db
      .update(schema.pushSubscriptions)
      .set({ lastSuccessAt: dt, lastSeenAt: dt })
      .where(eq(schema.pushSubscriptions.endpoint, endpoint));
  }

  public async claimNotificationDispatch(
    input: Omit<NotificationDispatchRecord, "createdAtIso"> & {
      createdAtIso?: string;
    },
  ): Promise<boolean> {
    const db = await this.ensureSeeded();
    const rows = await db
      .insert(schema.notificationDispatches)
      .values({
        dispatchKey: input.dispatchKey,
        channel: input.channel satisfies DispatchChannel,
        targetScope: input.targetScope,
        status: input.status satisfies DispatchStatus,
        metaJson: input.metaJson,
        createdAt: input.createdAtIso
          ? new Date(input.createdAtIso)
          : new Date(),
      })
      .onConflictDoNothing()
      .returning();
    return rows.length > 0;
  }

  public async hasNotificationDispatch(dispatchKey: string): Promise<boolean> {
    const db = await this.ensureSeeded();
    const rows = await db
      .select({ dispatchKey: schema.notificationDispatches.dispatchKey })
      .from(schema.notificationDispatches)
      .where(eq(schema.notificationDispatches.dispatchKey, dispatchKey))
      .limit(1);
    return rows.length > 0;
  }

  public async clearDispatchesWithPrefix(prefix: string): Promise<void> {
    const db = await this.ensureSeeded();
    const escaped = prefix.replace(/[%_\\]/g, "\\$&");
    await db
      .delete(schema.notificationDispatches)
      .where(like(schema.notificationDispatches.dispatchKey, `${escaped}%`));
  }
}
