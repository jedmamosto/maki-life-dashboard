import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  CareEventRecord,
  CareEventType,
  CareRepository,
  Caregiver,
  CaregiverRole,
  DeleteCaregiverResult,
  FeedMealResult,
  FeedingLogRecord,
  FeedingPeriod,
  HouseholdSettingsRecord,
  NotificationDispatchRecord,
  PushSubscriptionRecord,
  SupplyKey,
  SupplyLevel,
  SupplyRecord,
  UpdateSupplyResult,
} from "@/lib/types";

export const SEEDED_CAREGIVERS: readonly Caregiver[] = [
  {
    id: "ate",
    slug: "ate",
    displayName: "Ate",
    role: "helper",
    avatarInitials: "AT",
    avatarColor: "helper",
    isActive: true,
  },
  {
    id: "mom",
    slug: "mom",
    displayName: "Mom",
    role: "family",
    avatarInitials: "MO",
    avatarColor: "mom",
    isActive: true,
  },
  {
    id: "dad",
    slug: "dad",
    displayName: "Dad",
    role: "family",
    avatarInitials: "DA",
    avatarColor: "dad",
    isActive: true,
  },
  {
    id: "jed",
    slug: "jed",
    displayName: "Jed",
    role: "owner",
    avatarInitials: "JD",
    avatarColor: "owner",
    isActive: true,
  },
];

export interface CareStoreSnapshot {
  caregivers: Caregiver[];
  feedingLogs: FeedingLogRecord[];
  careEvents: CareEventRecord[];
  supplies: SupplyRecord[];
  pushSubscriptions: PushSubscriptionRecord[];
  notificationDispatches: NotificationDispatchRecord[];
  settings: HouseholdSettingsRecord;
}

export function createInitialCareStore(): CareStoreSnapshot {
  const nowIso = "2026-11-20T00:00:00.000Z";
  return {
    caregivers: SEEDED_CAREGIVERS.map((c) => ({ ...c })),
    feedingLogs: [],
    careEvents: [],
    supplies: [
      {
        supplyKey: "CAT_FOOD",
        level: "FULL",
        updatedById: "jed",
        updatedAtIso: nowIso,
        lastAlertedLevel: null,
      },
      {
        supplyKey: "CAT_LITTER",
        level: "FULL",
        updatedById: "jed",
        updatedAtIso: nowIso,
        lastAlertedLevel: null,
      },
    ],
    pushSubscriptions: [],
    notificationDispatches: [],
    settings: {
      id: "default",
      householdTimezone: "Asia/Manila",
      amMealHour: 10,
      amMealMinute: 0,
      midMealHour: 14,
      midMealMinute: 0,
      pmMealHour: 19,
      pmMealMinute: 0,
      dailyMealGoal: 3,
      mealReminderHour: 20,
      mealReminderMinute: 0,
      lastCronTickAtIso: null,
      litterIntervalHours: 48,
      weeklyPlayGoal: 3,
      ownerEmail: process.env.OWNER_ALERT_EMAIL ?? "",
      ownerPinHash: null,
      activeTokenHash: null,
      updatedAtIso: nowIso,
    },
  };
}

class AsyncMutex {
  private chain: Promise<void> = Promise.resolve();

  public async runExclusive<T>(fn: () => Promise<T> | T): Promise<T> {
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const prev = this.chain;
    this.chain = next;
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

export function computeNextSupplyAlertState(
  prevAlertedLevel: "LOW" | "EMPTY" | null,
  nextLevel: SupplyLevel,
): {
  nextLastAlertedLevel: "LOW" | "EMPTY" | null;
  shouldAlertLevel: "LOW" | "EMPTY" | null;
} {
  if (nextLevel === "FULL" || nextLevel === "HALF") {
    return { nextLastAlertedLevel: null, shouldAlertLevel: null };
  }
  if (nextLevel === "LOW") {
    if (prevAlertedLevel === null) {
      return { nextLastAlertedLevel: "LOW", shouldAlertLevel: "LOW" };
    }
    return { nextLastAlertedLevel: prevAlertedLevel, shouldAlertLevel: null };
  }
  // nextLevel === "EMPTY"
  if (prevAlertedLevel !== "EMPTY") {
    return { nextLastAlertedLevel: "EMPTY", shouldAlertLevel: "EMPTY" };
  }
  return { nextLastAlertedLevel: "EMPTY", shouldAlertLevel: null };
}

export class MemoryCareRepository implements CareRepository {
  protected state: CareStoreSnapshot;
  protected readonly mutex = new AsyncMutex();

  constructor(initial?: CareStoreSnapshot) {
    const defaults = createInitialCareStore();
    if (initial) {
      const cloned = structuredClone(initial);
      this.state = {
        ...cloned,
        settings: {
          ...defaults.settings,
          ...cloned.settings,
        },
      };
    } else {
      this.state = defaults;
    }
  }

  protected async readState(): Promise<CareStoreSnapshot> {
    return this.state;
  }

  protected async writeState(nextState: CareStoreSnapshot): Promise<void> {
    this.state = nextState;
  }

  public async resetStore(overrides?: Partial<CareStoreSnapshot>): Promise<void> {
    await this.mutex.runExclusive(async () => {
      const fresh = createInitialCareStore();
      this.state = {
        ...fresh,
        ...overrides,
      };
      await this.writeState(this.state);
    });
  }

  public async listCaregivers(): Promise<Caregiver[]> {
    return this.mutex.runExclusive(async () => {
      const store = await this.readState();
      return store.caregivers.map((c) => ({ ...c }));
    });
  }

  public async getCaregiverById(id: string): Promise<Caregiver | null> {
    return this.mutex.runExclusive(async () => {
      const store = await this.readState();
      const found = store.caregivers.find((c) => c.id === id);
      return found ? { ...found } : null;
    });
  }

  public async getCaregiverBySlug(slug: string): Promise<Caregiver | null> {
    return this.mutex.runExclusive(async () => {
      const store = await this.readState();
      const found = store.caregivers.find((c) => c.slug === slug);
      return found ? { ...found } : null;
    });
  }

  public async upsertCaregiver(input: Caregiver): Promise<Caregiver> {
    return this.mutex.runExclusive(async () => {
      const store = await this.readState();
      const idx = store.caregivers.findIndex(
        (c) => c.id === input.id || c.slug === input.slug,
      );
      const copy = { ...input };
      if (idx >= 0) {
        store.caregivers[idx] = copy;
      } else {
        store.caregivers.push(copy);
      }
      await this.writeState(store);
      return { ...copy };
    });
  }

  public async deleteCaregiverIfUnused(
    id: string,
  ): Promise<DeleteCaregiverResult> {
    return this.mutex.runExclusive(async () => {
      const store = await this.readState();
      const target = store.caregivers.find((c) => c.id === id);
      if (!target) {
        return { deleted: false, reason: "not_found" };
      }

      if (target.role === "owner" && target.isActive) {
        const activeOwners = store.caregivers.filter(
          (c) => c.role === "owner" && c.isActive,
        );
        if (activeOwners.length <= 1) {
          return { deleted: false, reason: "last_owner" };
        }
      }

      const hasHistory =
        store.feedingLogs.some((row) => row.completedById === id) ||
        store.careEvents.some((row) => row.caregiverId === id) ||
        store.supplies.some((row) => row.updatedById === id) ||
        store.pushSubscriptions.some((row) => row.caregiverId === id);

      if (hasHistory) {
        return { deleted: false, reason: "has_history" };
      }

      store.caregivers = store.caregivers.filter((c) => c.id !== id);
      await this.writeState(store);
      return { deleted: true };
    });
  }

  public async getSettings(): Promise<HouseholdSettingsRecord> {
    return this.mutex.runExclusive(async () => {
      const store = await this.readState();
      return { ...store.settings };
    });
  }

  public async updateSettings(
    patch: Partial<Omit<HouseholdSettingsRecord, "id">>,
  ): Promise<HouseholdSettingsRecord> {
    return this.mutex.runExclusive(async () => {
      const store = await this.readState();
      store.settings = {
        ...store.settings,
        ...patch,
        id: "default",
      };
      await this.writeState(store);
      return { ...store.settings };
    });
  }

  public async listActiveFeedingsByDate(
    serviceDate: string,
  ): Promise<FeedingLogRecord[]> {
    return this.mutex.runExclusive(async () => {
      const store = await this.readState();
      return store.feedingLogs
        .filter(
          (row) => row.serviceDate === serviceDate && row.undoneAtIso === null,
        )
        .sort(
          (a, b) =>
            new Date(a.completedAtIso).getTime() -
            new Date(b.completedAtIso).getTime(),
        )
        .map((row) => ({ ...row }));
    });
  }

  public async getFeedingById(id: string): Promise<FeedingLogRecord | null> {
    return this.mutex.runExclusive(async () => {
      const store = await this.readState();
      const found = store.feedingLogs.find(
        (row) => row.id === id && row.undoneAtIso === null,
      );
      return found ? { ...found } : null;
    });
  }

  public async listFeedingsInRange(
    startDateKey: string,
    endDateKey: string,
  ): Promise<FeedingLogRecord[]> {
    return this.mutex.runExclusive(async () => {
      const store = await this.readState();
      return store.feedingLogs
        .filter(
          (row) =>
            row.undoneAtIso === null &&
            row.serviceDate >= startDateKey &&
            row.serviceDate <= endDateKey,
        )
        .sort(
          (a, b) =>
            new Date(a.completedAtIso).getTime() -
            new Date(b.completedAtIso).getTime(),
        )
        .map((row) => ({ ...row }));
    });
  }

  public async logFeedingAtomic(input: {
    slotKey: string;
    serviceDate: string;
    period: FeedingPeriod;
    dueAtIso: string;
    completedById: string;
    completedAtIso: string;
  }): Promise<FeedMealResult> {
    return this.mutex.runExclusive(async () => {
      const store = await this.readState();
      const existing = store.feedingLogs.find(
        (row) => row.slotKey === input.slotKey && row.undoneAtIso === null,
      );
      if (existing) {
        const completedBy =
          store.caregivers.find((c) => c.id === existing.completedById) ??
          store.caregivers[0];
        return {
          alreadyFed: true,
          record: { ...existing },
          completedBy: { ...completedBy },
        };
      }

      const actor = store.caregivers.find((c) => c.id === input.completedById);
      if (!actor) {
        throw new Error(`Unknown caregiver: ${input.completedById}`);
      }

      const record: FeedingLogRecord = {
        id: crypto.randomUUID(),
        slotKey: input.slotKey,
        serviceDate: input.serviceDate,
        period: input.period,
        dueAtIso: input.dueAtIso,
        completedById: actor.id,
        completedAtIso: input.completedAtIso,
        undoneAtIso: null,
      };
      store.feedingLogs.push(record);
      await this.writeState(store);

      return {
        alreadyFed: false,
        record: { ...record },
        completedBy: { ...actor },
      };
    });
  }

  public async undoFeedingById(
    id: string,
    undoneAtIso: string,
  ): Promise<FeedingLogRecord | null> {
    return this.mutex.runExclusive(async () => {
      const store = await this.readState();
      const idx = store.feedingLogs.findIndex(
        (row) => row.id === id && row.undoneAtIso === null,
      );
      if (idx < 0) {
        return null;
      }
      store.feedingLogs[idx] = {
        ...store.feedingLogs[idx],
        undoneAtIso,
      };
      await this.writeState(store);
      return { ...store.feedingLogs[idx] };
    });
  }

  public async updateFeedingAttributionById(
    id: string,
    caregiverId: string,
  ): Promise<FeedingLogRecord | null> {
    return this.mutex.runExclusive(async () => {
      const store = await this.readState();
      const actor = store.caregivers.find((c) => c.id === caregiverId);
      if (!actor) {
        return null;
      }
      const idx = store.feedingLogs.findIndex(
        (row) => row.id === id && row.undoneAtIso === null,
      );
      if (idx < 0) {
        return null;
      }
      store.feedingLogs[idx] = {
        ...store.feedingLogs[idx],
        completedById: actor.id,
      };
      await this.writeState(store);
      return { ...store.feedingLogs[idx] };
    });
  }

  public async logCareEvent(
    input: CareEventRecord,
  ): Promise<{ created: boolean; record: CareEventRecord }> {
    return this.mutex.runExclusive(async () => {
      const store = await this.readState();
      const existing = store.careEvents.find(
        (e) => e.idempotencyKey === input.idempotencyKey,
      );
      if (existing) {
        return { created: false, record: { ...existing } };
      }
      const copy = { ...input };
      store.careEvents.push(copy);
      await this.writeState(store);
      return { created: true, record: { ...copy } };
    });
  }

  public async listCareEventsByType(
    eventType: CareEventType,
    limit?: number,
  ): Promise<CareEventRecord[]> {
    return this.mutex.runExclusive(async () => {
      const store = await this.readState();
      const sorted = store.careEvents
        .filter((e) => e.eventType === eventType)
        .sort(
          (a, b) =>
            new Date(b.occurredAtIso).getTime() -
            new Date(a.occurredAtIso).getTime(),
        );
      const sliced = typeof limit === "number" ? sorted.slice(0, limit) : sorted;
      return sliced.map((e) => ({ ...e }));
    });
  }

  public async listCareEventsSince(sinceIso: string): Promise<CareEventRecord[]> {
    return this.mutex.runExclusive(async () => {
      const store = await this.readState();
      const sinceMs = new Date(sinceIso).getTime();
      return store.careEvents
        .filter((e) => new Date(e.occurredAtIso).getTime() >= sinceMs)
        .sort(
          (a, b) =>
            new Date(a.occurredAtIso).getTime() -
            new Date(b.occurredAtIso).getTime(),
        )
        .map((e) => ({ ...e }));
    });
  }

  public async listCareEventsByWeek(
    isoWeekKey: string,
  ): Promise<CareEventRecord[]> {
    return this.mutex.runExclusive(async () => {
      const store = await this.readState();
      return store.careEvents
        .filter((e) => e.isoWeekKey === isoWeekKey)
        .sort(
          (a, b) =>
            new Date(b.occurredAtIso).getTime() -
            new Date(a.occurredAtIso).getTime(),
        )
        .map((e) => ({ ...e }));
    });
  }

  public async listSupplies(): Promise<SupplyRecord[]> {
    return this.mutex.runExclusive(async () => {
      const store = await this.readState();
      return store.supplies.map((s) => ({ ...s }));
    });
  }

  public async upsertSupplyAtomic(input: {
    supplyKey: SupplyKey;
    level: SupplyLevel;
    updatedById: string;
    updatedAtIso: string;
  }): Promise<UpdateSupplyResult> {
    return this.mutex.runExclusive(async () => {
      const store = await this.readState();
      const idx = store.supplies.findIndex(
        (s) => s.supplyKey === input.supplyKey,
      );
      const prev = idx >= 0 ? store.supplies[idx] : undefined;
      const { nextLastAlertedLevel, shouldAlertLevel } =
        computeNextSupplyAlertState(prev?.lastAlertedLevel ?? null, input.level);

      const nextRecord: SupplyRecord = {
        supplyKey: input.supplyKey,
        level: input.level,
        updatedById: input.updatedById,
        updatedAtIso: input.updatedAtIso,
        lastAlertedLevel: nextLastAlertedLevel,
      };
      if (idx >= 0) {
        store.supplies[idx] = nextRecord;
      } else {
        store.supplies.push(nextRecord);
      }
      await this.writeState(store);
      return {
        record: { ...nextRecord },
        shouldAlertLevel,
      };
    });
  }

  public async upsertPushSubscription(
    input: Omit<PushSubscriptionRecord, "id" | "revokedAtIso">,
  ): Promise<PushSubscriptionRecord> {
    return this.mutex.runExclusive(async () => {
      const store = await this.readState();
      const idx = store.pushSubscriptions.findIndex(
        (s) => s.endpoint === input.endpoint,
      );
      if (idx >= 0) {
        const updated: PushSubscriptionRecord = {
          ...store.pushSubscriptions[idx],
          ...input,
          revokedAtIso: null,
        };
        store.pushSubscriptions[idx] = updated;
        await this.writeState(store);
        return { ...updated };
      }
      const created: PushSubscriptionRecord = {
        id: crypto.randomUUID(),
        ...input,
        revokedAtIso: null,
      };
      store.pushSubscriptions.push(created);
      await this.writeState(store);
      return { ...created };
    });
  }

  public async listActivePushSubscriptions(
    roles?: CaregiverRole[],
  ): Promise<PushSubscriptionRecord[]> {
    return this.mutex.runExclusive(async () => {
      const store = await this.readState();
      const roleSet = roles ? new Set<CaregiverRole>(roles) : null;
      const caregiverRoles = new Map<string, CaregiverRole>(
        store.caregivers.map((c) => [c.id, c.role]),
      );
      return store.pushSubscriptions
        .filter((s) => {
          if (s.revokedAtIso !== null) {
            return false;
          }
          if (!roleSet) {
            return true;
          }
          const role = caregiverRoles.get(s.caregiverId);
          return role ? roleSet.has(role) : false;
        })
        .map((s) => ({ ...s }));
    });
  }

  public async listAllPushSubscriptions(): Promise<PushSubscriptionRecord[]> {
    return this.mutex.runExclusive(async () => {
      const store = await this.readState();
      return store.pushSubscriptions.map((s) => ({ ...s }));
    });
  }

  public async markPushSubscriptionRevoked(
    endpoint: string,
    revokedAtIso: string,
  ): Promise<void> {
    await this.mutex.runExclusive(async () => {
      const store = await this.readState();
      const idx = store.pushSubscriptions.findIndex(
        (s) => s.endpoint === endpoint,
      );
      if (idx >= 0) {
        store.pushSubscriptions[idx] = {
          ...store.pushSubscriptions[idx],
          revokedAtIso,
        };
        await this.writeState(store);
      }
    });
  }

  public async markPushSubscriptionSuccess(
    endpoint: string,
    successAtIso: string,
  ): Promise<void> {
    await this.mutex.runExclusive(async () => {
      const store = await this.readState();
      const idx = store.pushSubscriptions.findIndex(
        (s) => s.endpoint === endpoint,
      );
      if (idx >= 0) {
        store.pushSubscriptions[idx] = {
          ...store.pushSubscriptions[idx],
          lastSuccessAtIso: successAtIso,
          lastSeenAtIso: successAtIso,
        };
        await this.writeState(store);
      }
    });
  }

  public async claimNotificationDispatch(
    input: Omit<NotificationDispatchRecord, "createdAtIso"> & {
      createdAtIso?: string;
    },
  ): Promise<boolean> {
    return this.mutex.runExclusive(async () => {
      const store = await this.readState();
      if (
        store.notificationDispatches.some(
          (d) => d.dispatchKey === input.dispatchKey,
        )
      ) {
        return false;
      }
      store.notificationDispatches.push({
        dispatchKey: input.dispatchKey,
        channel: input.channel,
        targetScope: input.targetScope,
        status: input.status,
        metaJson: input.metaJson,
        createdAtIso: input.createdAtIso ?? new Date().toISOString(),
      });
      await this.writeState(store);
      return true;
    });
  }

  public async hasNotificationDispatch(dispatchKey: string): Promise<boolean> {
    return this.mutex.runExclusive(async () => {
      const store = await this.readState();
      return store.notificationDispatches.some(
        (d) => d.dispatchKey === dispatchKey,
      );
    });
  }

  public async clearDispatchesWithPrefix(prefix: string): Promise<void> {
    await this.mutex.runExclusive(async () => {
      const store = await this.readState();
      store.notificationDispatches = store.notificationDispatches.filter(
        (d) => !d.dispatchKey.startsWith(prefix),
      );
      await this.writeState(store);
    });
  }
}

export class FileCareRepository extends MemoryCareRepository {
  private readonly filePath: string;
  private initialized = false;

  constructor(filePath: string = ".data/maki-care.json") {
    super(createInitialCareStore());
    this.filePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(/*turbopackIgnore: true*/ process.cwd(), filePath);
  }

  private ensureParentDir(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private atomicWriteSync(snapshot: CareStoreSnapshot): void {
    this.ensureParentDir();
    const tmpPath = `${this.filePath}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(snapshot, null, 2), "utf8");
    fs.renameSync(tmpPath, this.filePath);
  }

  protected override async readState(): Promise<CareStoreSnapshot> {
    if (!this.initialized) {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, "utf8");
        const parsed = JSON.parse(raw) as CareStoreSnapshot;
        this.state = {
          ...parsed,
          settings: {
            ...createInitialCareStore().settings,
            ...parsed.settings,
          },
        };
      } else {
        this.state = createInitialCareStore();
        this.atomicWriteSync(this.state);
      }
      this.initialized = true;
    } else if (fs.existsSync(this.filePath)) {
      const raw = fs.readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as CareStoreSnapshot;
      this.state = {
        ...parsed,
        settings: {
          ...createInitialCareStore().settings,
          ...parsed.settings,
        },
      };
    }
    return this.state;
  }

  protected override async writeState(
    nextState: CareStoreSnapshot,
  ): Promise<void> {
    this.state = nextState;
    this.initialized = true;
    this.atomicWriteSync(nextState);
  }
}
