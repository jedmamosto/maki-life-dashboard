export type CaregiverRole = "helper" | "family" | "owner";

export type AvatarColorKey = "helper" | "mom" | "dad" | "sibling" | "owner";

export interface Caregiver {
  id: string;
  slug: string;
  displayName: string;
  role: CaregiverRole;
  avatarInitials: string;
  avatarColor: AvatarColorKey;
  isActive: boolean;
}

export type FeedingPeriod = "AM" | "PM";

export type TaskVisualState = "UPCOMING" | "DUE_NOW" | "OVERDUE" | "DONE";

export type SupplyKey = "CAT_FOOD" | "CAT_LITTER";

export type SupplyLevel = "FULL" | "HALF" | "LOW" | "EMPTY";

export type CareEventType = "LITTER_CLEAN" | "OUT_OF_ROOM" | "PLAY_SESSION";

export type PushPlatform = "ios_pwa" | "android_pwa" | "desktop";

export type EscalationStage =
  | "NONE"
  | "T0_HELPER"
  | "T20_HELPER"
  | "T45_FAMILY_OWNER"
  | "T120_OWNER";

export type SurvivabilityStatus = "SAFE" | "ATTENTION" | "OVERDUE";

export interface FeedingLogRecord {
  id: string;
  slotKey: string;
  serviceDate: string;
  period: FeedingPeriod;
  dueAtIso: string;
  completedById: string;
  completedAtIso: string;
  undoneAtIso: string | null;
}

export interface CareEventRecord {
  id: string;
  eventType: CareEventType;
  caregiverId: string;
  occurredAtIso: string;
  isoWeekKey: string;
  idempotencyKey: string;
}

export interface SupplyRecord {
  supplyKey: SupplyKey;
  level: SupplyLevel;
  updatedById: string;
  updatedAtIso: string;
  lastAlertedLevel: "LOW" | "EMPTY" | null;
}

export interface PushSubscriptionRecord {
  id: string;
  caregiverId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  platform: PushPlatform;
  supportsDeclarative: boolean;
  lastSeenAtIso: string;
  lastSuccessAtIso: string | null;
  revokedAtIso: string | null;
}

export type DispatchChannel = "web_push" | "email";

export type DispatchStatus = "sent" | "skipped_done" | "failed";

export interface NotificationDispatchRecord {
  dispatchKey: string;
  channel: DispatchChannel;
  targetScope: string;
  status: DispatchStatus;
  metaJson: Record<string, unknown> | null;
  createdAtIso: string;
}

export interface HouseholdSettingsRecord {
  id: string;
  householdTimezone: string;
  amMealHour: number;
  amMealMinute: number;
  pmMealHour: number;
  pmMealMinute: number;
  litterIntervalHours: number;
  weeklyPlayGoal: number;
  ownerEmail: string;
  ownerPinHash: string | null;
  activeTokenHash: string | null;
  updatedAtIso: string;
}

export interface FeedingSlotView {
  slotKey: string;
  serviceDate: string;
  period: FeedingPeriod;
  label: string;
  scheduledTimeLabel: string;
  dueAtIso: string;
  state: TaskVisualState;
  canLogEarly: boolean;
  minutesOverdue: number;
  completedBy: Caregiver | null;
  completedAtIso: string | null;
  completedTimeLabel: string | null;
  canUndo: boolean;
  showFoodStockPiggyback: boolean;
}

export interface LitterStatusView {
  state: TaskVisualState;
  lastCleanedAtIso: string | null;
  lastCleanedBy: Caregiver | null;
  lastCleanedLabel: string;
  nextDueAtIso: string | null;
  nextDueLabel: string;
  hoursSinceClean: number | null;
  hoursOverdue: number;
  totalCleansCount: number;
  showLitterStockPiggyback: boolean;
}

export interface SupplyView {
  key: SupplyKey;
  label: string;
  level: SupplyLevel;
  updatedBy: Caregiver | null;
  updatedAtIso: string | null;
  updatedLabel: string;
}

export interface WeeklyPlayView {
  isoWeekKey: string;
  count: number;
  target: number;
  isGoalMet: boolean;
  progressPercent: number;
  recentEvents: Array<{
    id: string;
    caregiver: Caregiver;
    occurredAtIso: string;
    label: string;
  }>;
}

export interface SurvivabilitySummary {
  status: SurvivabilityStatus;
  score: number;
  completedCoreCount: number;
  totalCoreCount: number;
  headline: string;
  subtext: string;
}

export interface PushHealthDevice {
  caregiverId: string;
  caregiverName: string;
  role: CaregiverRole;
  avatarInitials: string;
  avatarColor: AvatarColorKey;
  activeCount: number;
  goneCount: number;
  lastSeenAtIso: string | null;
  platform: PushPlatform | null;
}

export interface PushHealthSummary {
  activeHelperDevices: number;
  activeFamilyDevices: number;
  activeOwnerDevices: number;
  goneSubscriptionCount: number;
  devices: PushHealthDevice[];
}

export interface HouseholdSettingsView {
  householdTimezone: string;
  amMealTime: string;
  pmMealTime: string;
  litterIntervalHours: number;
  weeklyPlayGoal: number;
  ownerEmail: string;
  hasPinConfigured: boolean;
}

export interface DashboardSnapshot {
  manilaNowIso: string;
  manilaDateKey: string;
  manilaDateLabel: string;
  manilaTimeLabel: string;
  isoWeekKey: string;
  survivability: SurvivabilitySummary;
  meals: {
    am: FeedingSlotView;
    pm: FeedingSlotView;
  };
  litter: LitterStatusView;
  supplies: {
    food: SupplyView;
    litter: SupplyView;
  };
  weeklyPlay: WeeklyPlayView;
  caregivers: Caregiver[];
  escalationStage: EscalationStage;
  pushHealth: PushHealthSummary;
  settings: HouseholdSettingsView;
  messengerNudgeText: string;
}

export interface DayComplianceCell {
  dateKey: string;
  shortLabel: string;
  weekdayLabel: string;
  amStatus: "ON_TIME" | "LATE" | "MISSED" | "UPCOMING";
  pmStatus: "ON_TIME" | "LATE" | "MISSED" | "UPCOMING";
  litterStatus: "DONE" | "LATE" | "MISSED" | "NOT_DUE";
  playCount: number;
  details: {
    amFedBy: string | null;
    amFedAt: string | null;
    pmFedBy: string | null;
    pmFedAt: string | null;
    litterBy: string | null;
    litterAt: string | null;
    playBy: string[];
  };
}

export interface TodayTimelineItem {
  id: string;
  timeLabel: string;
  title: string;
  actor: Caregiver | null;
  badge: string;
  tone: "sage" | "amber" | "coral" | "indigo" | "neutral";
}

export interface OwnerHistoryResponse {
  days: DayComplianceCell[];
  onTimePercent: number;
  coreStreakDays: number;
  pushHealth: PushHealthSummary;
  todayTimeline: TodayTimelineItem[];
}

export interface FeedMealResult {
  alreadyFed: boolean;
  record: FeedingLogRecord;
  completedBy: Caregiver;
}

export interface UpdateSupplyResult {
  record: SupplyRecord;
  shouldAlertLevel: "LOW" | "EMPTY" | null;
}

export type DeleteCaregiverResult =
  | { deleted: true }
  | { deleted: false; reason: "not_found" | "has_history" | "last_owner" };

export interface CareRepository {
  listCaregivers(): Promise<Caregiver[]>;
  getCaregiverById(id: string): Promise<Caregiver | null>;
  getCaregiverBySlug(slug: string): Promise<Caregiver | null>;
  upsertCaregiver(input: Caregiver): Promise<Caregiver>;
  deleteCaregiverIfUnused(id: string): Promise<DeleteCaregiverResult>;

  getSettings(): Promise<HouseholdSettingsRecord>;
  updateSettings(
    patch: Partial<Omit<HouseholdSettingsRecord, "id">>,
  ): Promise<HouseholdSettingsRecord>;

  getActiveFeedingBySlot(slotKey: string): Promise<FeedingLogRecord | null>;
  listFeedingsInRange(
    startDateKey: string,
    endDateKey: string,
  ): Promise<FeedingLogRecord[]>;
  logFeedingAtomic(input: {
    slotKey: string;
    serviceDate: string;
    period: FeedingPeriod;
    dueAtIso: string;
    completedById: string;
    completedAtIso: string;
  }): Promise<FeedMealResult>;
  undoFeedingBySlot(
    slotKey: string,
    undoneAtIso: string,
  ): Promise<FeedingLogRecord | null>;
  updateFeedingAttribution(
    slotKey: string,
    caregiverId: string,
  ): Promise<FeedingLogRecord | null>;

  logCareEvent(input: CareEventRecord): Promise<{ created: boolean; record: CareEventRecord }>;
  listCareEventsByType(
    eventType: CareEventType,
    limit?: number,
  ): Promise<CareEventRecord[]>;
  listCareEventsSince(sinceIso: string): Promise<CareEventRecord[]>;
  listCareEventsByWeek(isoWeekKey: string): Promise<CareEventRecord[]>;

  listSupplies(): Promise<SupplyRecord[]>;
  upsertSupplyAtomic(input: {
    supplyKey: SupplyKey;
    level: SupplyLevel;
    updatedById: string;
    updatedAtIso: string;
  }): Promise<UpdateSupplyResult>;

  upsertPushSubscription(
    input: Omit<PushSubscriptionRecord, "id" | "revokedAtIso">,
  ): Promise<PushSubscriptionRecord>;
  listActivePushSubscriptions(
    roles?: CaregiverRole[],
  ): Promise<PushSubscriptionRecord[]>;
  listAllPushSubscriptions(): Promise<PushSubscriptionRecord[]>;
  markPushSubscriptionRevoked(
    endpoint: string,
    revokedAtIso: string,
  ): Promise<void>;
  markPushSubscriptionSuccess(
    endpoint: string,
    successAtIso: string,
  ): Promise<void>;

  claimNotificationDispatch(
    input: Omit<NotificationDispatchRecord, "createdAtIso"> & {
      createdAtIso?: string;
    },
  ): Promise<boolean>;
  hasNotificationDispatch(dispatchKey: string): Promise<boolean>;
  clearDispatchesWithPrefix(prefix: string): Promise<void>;
}
