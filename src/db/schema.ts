import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const caregivers = pgTable("caregivers", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull(),
  avatarInitials: text("avatar_initials").notNull(),
  avatarColor: text("avatar_color").notNull(),
  isActive: boolean("is_active").notNull().default(true),
});

export const feedingLogs = pgTable(
  "feeding_logs",
  {
    id: text("id").primaryKey(),
    slotKey: text("slot_key").notNull(),
    serviceDate: text("service_date").notNull(),
    period: text("period").notNull(),
    dueAtIso: text("due_at_iso").notNull(),
    completedById: text("completed_by_id")
      .notNull()
      .references(() => caregivers.id),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    undoneAt: timestamp("undone_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    uniqueIndex("feeding_logs_active_slot_idx")
      .on(table.slotKey)
      .where(sql`${table.undoneAt} IS NULL`),
    index("feeding_logs_service_date_idx").on(table.serviceDate),
  ],
);

export const careEvents = pgTable(
  "care_events",
  {
    id: text("id").primaryKey(),
    eventType: text("event_type").notNull(),
    caregiverId: text("caregiver_id")
      .notNull()
      .references(() => caregivers.id),
    occurredAt: timestamp("occurred_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    isoWeekKey: text("iso_week_key").notNull(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
  },
  (table) => [
    index("care_events_type_occurred_idx").on(table.eventType, table.occurredAt),
    index("care_events_iso_week_idx").on(table.isoWeekKey),
  ],
);

export const supplies = pgTable("supplies", {
  supplyKey: text("supply_key").primaryKey(),
  level: text("level").notNull(),
  updatedById: text("updated_by_id")
    .notNull()
    .references(() => caregivers.id),
  updatedAt: timestamp("updated_at", {
    withTimezone: true,
    mode: "date",
  }).notNull(),
  lastAlertedLevel: text("last_alerted_level"),
});

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: text("id").primaryKey(),
  caregiverId: text("caregiver_id")
    .notNull()
    .references(() => caregivers.id),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  platform: text("platform").notNull(),
  supportsDeclarative: boolean("supports_declarative").notNull().default(false),
  lastSeenAt: timestamp("last_seen_at", {
    withTimezone: true,
    mode: "date",
  }).notNull(),
  lastSuccessAt: timestamp("last_success_at", {
    withTimezone: true,
    mode: "date",
  }),
  revokedAt: timestamp("revoked_at", {
    withTimezone: true,
    mode: "date",
  }),
});

export const notificationDispatches = pgTable("notification_dispatches", {
  dispatchKey: text("dispatch_key").primaryKey(),
  channel: text("channel").notNull(),
  targetScope: text("target_scope").notNull(),
  status: text("status").notNull(),
  metaJson: jsonb("meta_json").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "date",
  }).notNull(),
});

export const householdSettings = pgTable("household_settings", {
  id: text("id").primaryKey(),
  householdTimezone: text("household_timezone").notNull(),
  amMealHour: integer("am_meal_hour").notNull(),
  amMealMinute: integer("am_meal_minute").notNull(),
  pmMealHour: integer("pm_meal_hour").notNull(),
  pmMealMinute: integer("pm_meal_minute").notNull(),
  litterIntervalHours: integer("litter_interval_hours").notNull(),
  weeklyPlayGoal: integer("weekly_play_goal").notNull(),
  ownerEmail: text("owner_email").notNull(),
  ownerPinHash: text("owner_pin_hash"),
  activeTokenHash: text("active_token_hash"),
  updatedAt: timestamp("updated_at", {
    withTimezone: true,
    mode: "date",
  }).notNull(),
});
