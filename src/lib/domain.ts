import { UI_COPY, buildMessengerNudgeText } from "./copy";
import {
  formatManilaDateLabel,
  formatManilaIso,
  formatManilaRelativeLabel,
  formatManilaShortDate,
  formatManilaTimeLabel,
  formatManilaWeekday,
  getManilaDateKey,
  getManilaDateKeysBack,
  getManilaIsoWeekKey,
  getManilaWeekdayFromDateKey,
  getSlotScheduledAt,
} from "./timezone";
import type {
  AvatarColorKey,
  CareEventRecord,
  CareRepository,
  Caregiver,
  CaregiverRole,
  DailyMealsView,
  DashboardSnapshot,
  DayComplianceCell,
  EscalationStage,
  FeedingLogRecord,
  HouseholdSettingsRecord,
  HouseholdSettingsView,
  LitterStatusView,
  MealLogEntryView,
  OwnerHistoryResponse,
  PushHealthDevice,
  PushHealthSummary,
  PushSubscriptionRecord,
  SupplyKey,
  SupplyRecord,
  SupplyView,
  SurvivabilityStatus,
  SurvivabilitySummary,
  TaskVisualState,
  TodayTimelineItem,
  WeeklyPlayView,
} from "./types";

export const AVATAR_COLOR_HEX: Record<AvatarColorKey, string> = {
  helper: "#1E6B5C",
  mom: "#6D3B7D",
  dad: "#2B5B84",
  sibling: "#9A3412",
  owner: "#B3480F",
};

export const DEFAULT_CAREGIVERS: readonly Caregiver[] = [
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

export const DEFAULT_SETTINGS: Omit<HouseholdSettingsRecord, "updatedAtIso"> = {
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
  ownerEmail: "",
  ownerPinHash: null,
  activeTokenHash: null,
};

export const MEAL_CHECKIN_STAGES = [
  "REMINDER",
  "OWNER_ESCALATION",
  "OWNER_EMAIL",
] as const;

export type MealCheckinStage = (typeof MEAL_CHECKIN_STAGES)[number];

export const MEAL_ESCALATION_DELAY_MINUTES = 60;

export function mealCheckinDispatchKey(
  dateKey: string,
  stage: MealCheckinStage,
): string {
  return `meal-checkin:${dateKey}:${stage}`;
}

export function mealCheckinSkipKey(
  dateKey: string,
  stage: MealCheckinStage,
): string {
  return `meal-checkin-skip:${dateKey}:${stage}`;
}

export function makeMealLogSlotKey(
  serviceDate: string,
  idempotencyKey: string,
): string {
  return `${serviceDate}:LOG:${idempotencyKey}`;
}

export async function resolveCaregiver(
  repo: CareRepository,
  idOrSlug: string,
): Promise<Caregiver | null> {
  const byId = await repo.getCaregiverById(idOrSlug);
  if (byId) {
    return byId;
  }
  return repo.getCaregiverBySlug(idOrSlug);
}

export function computeDailyMealsView(input: {
  serviceDate: string;
  todayDateKey: string;
  now: Date;
  settings: HouseholdSettingsRecord;
  activeLogs: FeedingLogRecord[];
  caregiversById: Map<string, Caregiver>;
}): DailyMealsView {
  const target = Math.max(1, input.settings.dailyMealGoal);
  const sorted = [...input.activeLogs]
    .filter((log) => log.undoneAtIso === null)
    .sort(
      (a, b) =>
        new Date(a.completedAtIso).getTime() -
        new Date(b.completedAtIso).getTime(),
    );

  const count = sorted.length;
  const isGoalMet = count >= target;
  const progressPercent = Math.min(100, Math.round((count / target) * 100));
  const reminderAt = getSlotScheduledAt(
    input.serviceDate,
    input.settings.mealReminderHour,
    input.settings.mealReminderMinute,
  );
  const diffMinutes = Math.floor(
    (input.now.getTime() - reminderAt.getTime()) / 60_000,
  );

  let state: TaskVisualState = "UPCOMING";
  if (isGoalMet) {
    state = "DONE";
  } else if (diffMinutes >= MEAL_ESCALATION_DELAY_MINUTES) {
    state = "OVERDUE";
  } else if (diffMinutes >= 0) {
    state = "DUE_NOW";
  }

  const entries: MealLogEntryView[] = sorted.map((log) => ({
    id: log.id,
    completedBy: input.caregiversById.get(log.completedById) ?? null,
    completedAtIso: log.completedAtIso,
    completedTimeLabel: formatManilaTimeLabel(new Date(log.completedAtIso)),
    canUndo: log.serviceDate === input.todayDateKey,
  }));

  const isSunday = getManilaWeekdayFromDateKey(input.serviceDate) === 0;

  return {
    serviceDate: input.serviceDate,
    count,
    target,
    isGoalMet,
    progressPercent,
    state,
    entries,
    showFoodStockPiggyback: isSunday && isGoalMet,
  };
}

export function computeLitterStatusView(input: {
  now: Date;
  settings: HouseholdSettingsRecord;
  litterEvents: CareEventRecord[];
  caregiversById: Map<string, Caregiver>;
}): LitterStatusView {
  const sorted = [...input.litterEvents].sort(
    (a, b) =>
      new Date(b.occurredAtIso).getTime() - new Date(a.occurredAtIso).getTime(),
  );
  const totalCleansCount = sorted.length;
  const showLitterStockPiggyback =
    totalCleansCount > 0 && totalCleansCount % 3 === 0;
  const latest = sorted[0] ?? null;

  if (!latest) {
    return {
      state: "DUE_NOW",
      lastCleanedAtIso: null,
      lastCleanedBy: null,
      lastCleanedLabel: UI_COPY.litter.neverLogged,
      nextDueAtIso: null,
      nextDueLabel: UI_COPY.litter.states.DUE_NOW,
      hoursSinceClean: null,
      hoursOverdue: 0,
      totalCleansCount: 0,
      showLitterStockPiggyback: false,
    };
  }

  const lastDate = new Date(latest.occurredAtIso);
  const exactHours = Math.max(
    0,
    (input.now.getTime() - lastDate.getTime()) / 3_600_000,
  );
  const hoursSinceClean = Math.floor(exactHours);
  const intervalHours = input.settings.litterIntervalHours;
  const nextDueDate = new Date(lastDate.getTime() + intervalHours * 3_600_000);

  let state: TaskVisualState = "UPCOMING";
  let hoursOverdue = 0;

  if (exactHours >= intervalHours + 24) {
    state = "OVERDUE";
    hoursOverdue = Math.floor(exactHours - intervalHours);
  } else if (exactHours >= intervalHours) {
    state = "DUE_NOW";
  } else if (exactHours < 24) {
    state = "DONE";
  }

  return {
    state,
    lastCleanedAtIso: latest.occurredAtIso,
    lastCleanedBy: input.caregiversById.get(latest.caregiverId) ?? null,
    lastCleanedLabel: formatManilaRelativeLabel(lastDate, input.now),
    nextDueAtIso: nextDueDate.toISOString(),
    nextDueLabel: formatManilaRelativeLabel(nextDueDate, input.now),
    hoursSinceClean,
    hoursOverdue,
    totalCleansCount,
    showLitterStockPiggyback,
  };
}

export function computeSupplyView(input: {
  supply: SupplyRecord | undefined;
  key: SupplyKey;
  now: Date;
  caregiversById: Map<string, Caregiver>;
}): SupplyView {
  const label = UI_COPY.supplies.itemName(input.key);
  if (!input.supply) {
    return {
      key: input.key,
      label,
      level: "FULL",
      updatedBy: null,
      updatedAtIso: null,
      updatedLabel: UI_COPY.supplies.levels.FULL,
    };
  }
  const updatedDate = new Date(input.supply.updatedAtIso);
  return {
    key: input.key,
    label,
    level: input.supply.level,
    updatedBy: input.caregiversById.get(input.supply.updatedById) ?? null,
    updatedAtIso: input.supply.updatedAtIso,
    updatedLabel: formatManilaRelativeLabel(updatedDate, input.now),
  };
}

export function computeWeeklyPlayView(input: {
  now: Date;
  settings: HouseholdSettingsRecord;
  weekEvents: CareEventRecord[];
  caregiversById: Map<string, Caregiver>;
}): WeeklyPlayView {
  const isoWeekKey = getManilaIsoWeekKey(input.now);
  const playEvents = input.weekEvents
    .filter(
      (e) =>
        e.isoWeekKey === isoWeekKey &&
        (e.eventType === "OUT_OF_ROOM" || e.eventType === "PLAY_SESSION"),
    )
    .sort(
      (a, b) =>
        new Date(b.occurredAtIso).getTime() - new Date(a.occurredAtIso).getTime(),
    );

  const count = playEvents.length;
  const target = Math.max(1, input.settings.weeklyPlayGoal);
  const isGoalMet = count >= target;
  const progressPercent = Math.min(100, Math.round((count / target) * 100));
  const fallbackCaregiver = [...input.caregiversById.values()][0];

  const recentEvents = playEvents.slice(0, 5).map((ev) => {
    const actor = input.caregiversById.get(ev.caregiverId) ?? fallbackCaregiver;
    return {
      id: ev.id,
      caregiver: actor,
      occurredAtIso: ev.occurredAtIso,
      label: formatManilaRelativeLabel(new Date(ev.occurredAtIso), input.now),
    };
  });

  return {
    isoWeekKey,
    count,
    target,
    isGoalMet,
    progressPercent,
    recentEvents,
  };
}

export function computeSurvivability(input: {
  meals: DailyMealsView;
  litter: LitterStatusView;
  supplies: { food: SupplyView; litter: SupplyView };
}): SurvivabilitySummary {
  let score = 100;
  let completedCoreCount = Math.min(input.meals.count, input.meals.target);
  const totalCoreCount = input.meals.target + 3;

  if (input.meals.state === "DUE_NOW") {
    score -= 15;
  } else if (input.meals.state === "OVERDUE") {
    score -= 35;
  }

  if (input.litter.state === "DONE" || input.litter.state === "UPCOMING") {
    completedCoreCount += 1;
  } else if (input.litter.state === "DUE_NOW") {
    score -= 15;
  } else if (input.litter.state === "OVERDUE") {
    score -= 30;
  }

  const applySupply = (supply: SupplyView): void => {
    if (supply.level === "FULL" || supply.level === "HALF") {
      completedCoreCount += 1;
    } else if (supply.level === "LOW") {
      score -= 10;
    } else if (supply.level === "EMPTY") {
      score -= 25;
    }
  };
  applySupply(input.supplies.food);
  applySupply(input.supplies.litter);

  score = Math.max(0, Math.min(100, score));

  const hasOverdue =
    input.meals.state === "OVERDUE" ||
    input.litter.state === "OVERDUE" ||
    input.supplies.food.level === "EMPTY" ||
    input.supplies.litter.level === "EMPTY";

  const hasAttention =
    input.meals.state === "DUE_NOW" ||
    input.litter.state === "DUE_NOW" ||
    input.supplies.food.level === "LOW" ||
    input.supplies.litter.level === "LOW";

  let status: SurvivabilityStatus = "SAFE";
  let headline: string = UI_COPY.survivability.safeTitle;
  let subtext: string = UI_COPY.survivability.allSetToday;

  if (hasOverdue) {
    status = "OVERDUE";
    headline = UI_COPY.survivability.overdueTitle;
    subtext = "Core care is late. Check meals, litter, or supplies now.";
  } else if (hasAttention) {
    status = "ATTENTION";
    headline = UI_COPY.survivability.dueTitle;
    subtext = "A meal check-in, litter clean, or low supply needs care today.";
  } else if (!input.meals.isGoalMet) {
    subtext = `${UI_COPY.survivability.mealsProgressPrefix} ${input.meals.count} of ${input.meals.target}`;
  }

  return {
    status,
    score,
    completedCoreCount,
    totalCoreCount,
    headline,
    subtext,
  };
}

export function computeEscalationStage(input: {
  now: Date;
  todayDateKey: string;
  settings: HouseholdSettingsRecord;
  todayFeedings: FeedingLogRecord[];
}): EscalationStage {
  const activeCount = input.todayFeedings.filter(
    (log) => log.undoneAtIso === null,
  ).length;
  const target = Math.max(1, input.settings.dailyMealGoal);
  if (activeCount >= target) {
    return "NONE";
  }

  const reminderAt = getSlotScheduledAt(
    input.todayDateKey,
    input.settings.mealReminderHour,
    input.settings.mealReminderMinute,
  );
  const diffMs = input.now.getTime() - reminderAt.getTime();
  if (diffMs < 0) {
    return "NONE";
  }
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin >= MEAL_ESCALATION_DELAY_MINUTES) {
    return "OWNER_ESCALATED";
  }
  return "REMINDER_SENT";
}

export function buildPushHealthSummary(
  caregivers: Caregiver[],
  subscriptions: PushSubscriptionRecord[],
): PushHealthSummary {
  let activeHelperDevices = 0;
  let activeFamilyDevices = 0;
  let activeOwnerDevices = 0;
  let goneSubscriptionCount = 0;

  const roleByCaregiverId = new Map<string, CaregiverRole>(
    caregivers.map((c) => [c.id, c.role]),
  );

  for (const sub of subscriptions) {
    if (sub.revokedAtIso !== null) {
      goneSubscriptionCount += 1;
      continue;
    }
    const role = roleByCaregiverId.get(sub.caregiverId);
    if (role === "helper") activeHelperDevices += 1;
    else if (role === "family") activeFamilyDevices += 1;
    else if (role === "owner") activeOwnerDevices += 1;
  }

  const devices: PushHealthDevice[] = caregivers.map((cg) => {
    const cgSubs = subscriptions.filter((s) => s.caregiverId === cg.id);
    const activeSubs = cgSubs.filter((s) => s.revokedAtIso === null);
    const goneSubs = cgSubs.filter((s) => s.revokedAtIso !== null);
    const latest = [...activeSubs, ...goneSubs].sort(
      (a, b) =>
        new Date(b.lastSeenAtIso).getTime() -
        new Date(a.lastSeenAtIso).getTime(),
    )[0];

    return {
      caregiverId: cg.id,
      caregiverName: cg.displayName,
      role: cg.role,
      avatarInitials: cg.avatarInitials,
      avatarColor: cg.avatarColor,
      activeCount: activeSubs.length,
      goneCount: goneSubs.length,
      lastSeenAtIso: latest ? latest.lastSeenAtIso : null,
      platform: latest ? latest.platform : null,
    };
  });

  return {
    activeHelperDevices,
    activeFamilyDevices,
    activeOwnerDevices,
    goneSubscriptionCount,
    devices,
  };
}

export function buildSettingsView(
  settings: HouseholdSettingsRecord,
): HouseholdSettingsView {
  return {
    householdTimezone: settings.householdTimezone,
    dailyMealGoal: settings.dailyMealGoal,
    mealReminderTime: `${String(settings.mealReminderHour).padStart(2, "0")}:${String(settings.mealReminderMinute).padStart(2, "0")}`,
    lastCronTickAtIso: settings.lastCronTickAtIso,
    litterIntervalHours: settings.litterIntervalHours,
    weeklyPlayGoal: settings.weeklyPlayGoal,
    ownerEmail: settings.ownerEmail,
    hasPinConfigured: settings.ownerPinHash !== null,
  };
}

function summarizePendingTask(input: {
  meals: DailyMealsView;
  litter: LitterStatusView;
  supplies: { food: SupplyView; litter: SupplyView };
}): string {
  if (!input.meals.isGoalMet) {
    return `Meals today are ${input.meals.count} of ${input.meals.target}`;
  }
  if (input.litter.state === "OVERDUE" || input.litter.state === "DUE_NOW") {
    return "Litter box needs cleaning";
  }
  if (input.supplies.food.level === "EMPTY" || input.supplies.food.level === "LOW") {
    return `Cat food is ${input.supplies.food.level.toLowerCase()}`;
  }
  if (
    input.supplies.litter.level === "EMPTY" ||
    input.supplies.litter.level === "LOW"
  ) {
    return `Cat litter is ${input.supplies.litter.level.toLowerCase()}`;
  }
  return "Meals and litter are on track today";
}

export function buildDashboardSnapshot(input: {
  now: Date;
  baseUrl: string;
  caregivers: Caregiver[];
  settings: HouseholdSettingsRecord;
  todayFeedings: FeedingLogRecord[];
  litterEvents: CareEventRecord[];
  supplies: SupplyRecord[];
  weekEvents: CareEventRecord[];
  pushSubscriptions: PushSubscriptionRecord[];
}): DashboardSnapshot {
  const caregiversById = new Map<string, Caregiver>(
    input.caregivers.map((c) => [c.id, c]),
  );
  const todayDateKey = getManilaDateKey(input.now);

  const meals = computeDailyMealsView({
    serviceDate: todayDateKey,
    todayDateKey,
    now: input.now,
    settings: input.settings,
    activeLogs: input.todayFeedings,
    caregiversById,
  });

  const litter = computeLitterStatusView({
    now: input.now,
    settings: input.settings,
    litterEvents: input.litterEvents,
    caregiversById,
  });

  const foodRecord = input.supplies.find((s) => s.supplyKey === "CAT_FOOD");
  const litterSupplyRecord = input.supplies.find(
    (s) => s.supplyKey === "CAT_LITTER",
  );
  const suppliesView = {
    food: computeSupplyView({
      supply: foodRecord,
      key: "CAT_FOOD",
      now: input.now,
      caregiversById,
    }),
    litter: computeSupplyView({
      supply: litterSupplyRecord,
      key: "CAT_LITTER",
      now: input.now,
      caregiversById,
    }),
  };

  const weeklyPlay = computeWeeklyPlayView({
    now: input.now,
    settings: input.settings,
    weekEvents: input.weekEvents,
    caregiversById,
  });

  const survivability = computeSurvivability({
    meals,
    litter,
    supplies: suppliesView,
  });

  const escalationStage = computeEscalationStage({
    now: input.now,
    todayDateKey,
    settings: input.settings,
    todayFeedings: input.todayFeedings,
  });

  const pushHealth = buildPushHealthSummary(
    input.caregivers,
    input.pushSubscriptions,
  );

  const taskSummary = summarizePendingTask({
    meals,
    litter,
    supplies: suppliesView,
  });

  return {
    manilaNowIso: formatManilaIso(input.now),
    manilaDateKey: todayDateKey,
    manilaDateLabel: formatManilaDateLabel(input.now),
    manilaTimeLabel: formatManilaTimeLabel(input.now),
    isoWeekKey: weeklyPlay.isoWeekKey,
    survivability,
    meals,
    litter,
    supplies: suppliesView,
    weeklyPlay,
    caregivers: input.caregivers,
    escalationStage,
    pushHealth,
    settings: buildSettingsView(input.settings),
    messengerNudgeText: buildMessengerNudgeText({
      taskSummary,
      dashboardUrl: "",
    }),
  };
}

export function buildOwnerHistory(input: {
  now: Date;
  caregivers: Caregiver[];
  settings: HouseholdSettingsRecord;
  feedingLogs: FeedingLogRecord[];
  careEvents: CareEventRecord[];
  supplies: SupplyRecord[];
  pushSubscriptions: PushSubscriptionRecord[];
}): OwnerHistoryResponse {
  const caregiversById = new Map<string, Caregiver>(
    input.caregivers.map((c) => [c.id, c]),
  );
  const todayDateKey = getManilaDateKey(input.now);
  const dateKeys = getManilaDateKeysBack(input.now, 14);
  const mealGoal = Math.max(1, input.settings.dailyMealGoal);

  const feedingsByDateKey = new Map<string, FeedingLogRecord[]>();
  for (const log of input.feedingLogs) {
    if (log.undoneAtIso === null) {
      const arr = feedingsByDateKey.get(log.serviceDate) ?? [];
      arr.push(log);
      feedingsByDateKey.set(log.serviceDate, arr);
    }
  }
  for (const arr of feedingsByDateKey.values()) {
    arr.sort(
      (a, b) =>
        new Date(a.completedAtIso).getTime() -
        new Date(b.completedAtIso).getTime(),
    );
  }

  const allLitterCleans = input.careEvents
    .filter((e) => e.eventType === "LITTER_CLEAN")
    .sort(
      (a, b) =>
        new Date(a.occurredAtIso).getTime() - new Date(b.occurredAtIso).getTime(),
    );

  const eventsByDateKey = new Map<string, CareEventRecord[]>();
  for (const ev of input.careEvents) {
    const dk = getManilaDateKey(new Date(ev.occurredAtIso));
    const arr = eventsByDateKey.get(dk) ?? [];
    arr.push(ev);
    eventsByDateKey.set(dk, arr);
  }

  let goalHitDays = 0;
  let evaluatedDays = 0;
  const todayReminderAt = getSlotScheduledAt(
    todayDateKey,
    input.settings.mealReminderHour,
    input.settings.mealReminderMinute,
  );

  const days: DayComplianceCell[] = dateKeys.map((dateKey) => {
    const dayFeedings = feedingsByDateKey.get(dateKey) ?? [];
    const mealCount = dayFeedings.length;

    let mealStatus: DayComplianceCell["mealStatus"] = "UPCOMING";
    if (mealCount >= mealGoal) {
      mealStatus = "ON_TIME";
      evaluatedDays += 1;
      goalHitDays += 1;
    } else if (dateKey < todayDateKey) {
      evaluatedDays += 1;
      mealStatus = mealCount > 0 ? "PARTIAL" : "MISSED";
    } else if (mealCount > 0) {
      mealStatus = "PARTIAL";
      if (input.now.getTime() >= todayReminderAt.getTime()) {
        evaluatedDays += 1;
      }
    } else if (input.now.getTime() >= todayReminderAt.getTime()) {
      mealStatus = "MISSED";
      evaluatedDays += 1;
    }

    const dayEvents = eventsByDateKey.get(dateKey) ?? [];
    const dayCleans = dayEvents.filter((e) => e.eventType === "LITTER_CLEAN");
    const dayPlays = dayEvents.filter(
      (e) => e.eventType === "OUT_OF_ROOM" || e.eventType === "PLAY_SESSION",
    );

    const endOfDay =
      dateKey === todayDateKey
        ? input.now
        : getSlotScheduledAt(dateKey, 23, 59);
    const priorCleans = allLitterCleans.filter(
      (c) => new Date(c.occurredAtIso).getTime() <= endOfDay.getTime(),
    );

    let litterStatus: DayComplianceCell["litterStatus"] = "NOT_DUE";
    let litterBy: string | null = null;
    let litterAt: string | null = null;

    if (dayCleans.length > 0) {
      const latestDayClean = dayCleans[dayCleans.length - 1];
      const actor = caregiversById.get(latestDayClean.caregiverId);
      litterBy = actor?.displayName ?? null;
      litterAt = formatManilaTimeLabel(new Date(latestDayClean.occurredAtIso));

      const latestMs = new Date(latestDayClean.occurredAtIso).getTime();
      const prevClean = [...allLitterCleans]
        .reverse()
        .find((c) => new Date(c.occurredAtIso).getTime() < latestMs);
      const hoursGap = prevClean
        ? (latestMs - new Date(prevClean.occurredAtIso).getTime()) / 3_600_000
        : 0;
      litterStatus =
        hoursGap >= input.settings.litterIntervalHours + 24 ? "LATE" : "DONE";
    } else if (priorCleans.length > 0) {
      const latestPrior = priorCleans[priorCleans.length - 1];
      const hoursSince =
        (endOfDay.getTime() - new Date(latestPrior.occurredAtIso).getTime()) /
        3_600_000;
      if (hoursSince >= input.settings.litterIntervalHours + 24) {
        litterStatus = dateKey < todayDateKey ? "MISSED" : "LATE";
      }
    }

    return {
      dateKey,
      shortLabel: formatManilaShortDate(dateKey),
      weekdayLabel: formatManilaWeekday(dateKey),
      mealCount,
      mealGoal,
      mealStatus,
      litterStatus,
      playCount: dayPlays.length,
      details: {
        meals: dayFeedings.map((log) => ({
          fedBy: caregiversById.get(log.completedById)?.displayName ?? "Caregiver",
          fedAt: formatManilaTimeLabel(new Date(log.completedAtIso)),
        })),
        litterBy,
        litterAt,
        playBy: dayPlays.map(
          (p) => caregiversById.get(p.caregiverId)?.displayName ?? "Caregiver",
        ),
      },
    };
  });

  const mealGoalHitPercent =
    evaluatedDays === 0 ? 100 : Math.round((goalHitDays / evaluatedDays) * 100);

  let coreStreakDays = 0;
  for (let i = days.length - 1; i >= 0; i -= 1) {
    const cell = days[i];
    const isToday = cell.dateKey === todayDateKey;
    if (isToday && cell.mealStatus === "UPCOMING") {
      if (cell.litterStatus === "MISSED") {
        break;
      }
      continue;
    }
    const dayHealthy =
      cell.mealCount >= cell.mealGoal && cell.litterStatus !== "MISSED";
    if (!dayHealthy) {
      break;
    }
    coreStreakDays += 1;
  }

  const timelineItems: Array<TodayTimelineItem & { sortMs: number }> = [];

  const todayFeedings = feedingsByDateKey.get(todayDateKey) ?? [];
  todayFeedings.forEach((log, idx) => {
    const occurred = new Date(log.completedAtIso);
    const actor = caregiversById.get(log.completedById) ?? null;
    timelineItems.push({
      id: `feed-${log.id}`,
      timeLabel: formatManilaTimeLabel(occurred),
      title: `Meal #${idx + 1}`,
      actor,
      badge: "Fed",
      tone: "sage",
      sortMs: occurred.getTime(),
    });
  });

  const todayEvents = eventsByDateKey.get(todayDateKey) ?? [];
  for (const ev of todayEvents) {
    const occurred = new Date(ev.occurredAtIso);
    const actor = caregiversById.get(ev.caregiverId) ?? null;
    if (ev.eventType === "LITTER_CLEAN") {
      timelineItems.push({
        id: `ev-${ev.id}`,
        timeLabel: formatManilaTimeLabel(occurred),
        title: UI_COPY.litter.title,
        actor,
        badge: UI_COPY.litter.states.DONE,
        tone: "sage",
        sortMs: occurred.getTime(),
      });
    } else {
      timelineItems.push({
        id: `ev-${ev.id}`,
        timeLabel: formatManilaTimeLabel(occurred),
        title: UI_COPY.play.title,
        actor,
        badge: UI_COPY.play.goalDoneBadge,
        tone: "indigo",
        sortMs: occurred.getTime(),
      });
    }
  }

  for (const supply of input.supplies) {
    const updated = new Date(supply.updatedAtIso);
    if (getManilaDateKey(updated) === todayDateKey) {
      const actor = caregiversById.get(supply.updatedById) ?? null;
      const itemLabel = UI_COPY.supplies.itemName(supply.supplyKey);
      const levelLabel = UI_COPY.supplies.levels[supply.level];
      timelineItems.push({
        id: `sup-${supply.supplyKey}`,
        timeLabel: formatManilaTimeLabel(updated),
        title: `${itemLabel} updated`,
        actor,
        badge: levelLabel,
        tone:
          supply.level === "EMPTY"
            ? "coral"
            : supply.level === "LOW"
              ? "amber"
              : "neutral",
        sortMs: updated.getTime(),
      });
    }
  }

  timelineItems.sort((a, b) => b.sortMs - a.sortMs);
  const todayTimeline: TodayTimelineItem[] = timelineItems.map((item) => ({
    id: item.id,
    timeLabel: item.timeLabel,
    title: item.title,
    actor: item.actor,
    badge: item.badge,
    tone: item.tone,
  }));

  return {
    days,
    mealGoalHitPercent,
    coreStreakDays,
    pushHealth: buildPushHealthSummary(input.caregivers, input.pushSubscriptions),
    todayTimeline,
  };
}
