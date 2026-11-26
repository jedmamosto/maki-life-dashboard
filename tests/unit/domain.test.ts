import { describe, expect, it } from "vitest";
import {
  DEFAULT_CAREGIVERS,
  DEFAULT_SETTINGS,
  buildDashboardSnapshot,
  buildOwnerHistory,
  computeEscalationStage,
  computeSurvivability,
} from "@/lib/domain";
import { getSlotScheduledAt } from "@/lib/timezone";
import type {
  CareEventRecord,
  FeedingLogRecord,
  HouseholdSettingsRecord,
  SupplyRecord,
} from "@/lib/types";

function makeSettings(overrides?: Partial<HouseholdSettingsRecord>): HouseholdSettingsRecord {
  return {
    ...DEFAULT_SETTINGS,
    updatedAtIso: "2026-11-20T00:00:00.000Z",
    ...overrides,
  };
}

function makeFullSupplies(): SupplyRecord[] {
  return [
    {
      supplyKey: "CAT_FOOD",
      level: "FULL",
      updatedById: "jed",
      updatedAtIso: "2026-11-19T12:00:00.000Z",
      lastAlertedLevel: null,
    },
    {
      supplyKey: "CAT_LITTER",
      level: "FULL",
      updatedById: "jed",
      updatedAtIso: "2026-11-19T12:00:00.000Z",
      lastAlertedLevel: null,
    },
  ];
}

function makeFeedLog(
  serviceDate: string,
  hour: number,
  minute: number,
  idx: number,
  completedById = "ate",
): FeedingLogRecord {
  const iso = getSlotScheduledAt(serviceDate, hour, minute).toISOString();
  return {
    id: `feed-${serviceDate}-${idx}`,
    slotKey: `${serviceDate}:LOG:${idx}`,
    serviceDate,
    period: "COUNT",
    dueAtIso: iso,
    completedById,
    completedAtIso: iso,
    undoneAtIso: null,
  };
}

describe("domain engine (survivability, piggybacks, escalation stage, 14-day history)", () => {
  it("[AC-021] calculates Survivability strictly from core care; weekly play 0/3 never lowers score", () => {
    const now = getSlotScheduledAt("2026-11-20", 8, 0); // 08:00 AM PHT (before 20:00 check-in)
    const recentClean: CareEventRecord = {
      id: "lc-1",
      eventType: "LITTER_CLEAN",
      caregiverId: "ate",
      occurredAtIso: getSlotScheduledAt("2026-11-19", 18, 0).toISOString(),
      isoWeekKey: "2026-W47",
      idempotencyKey: "lc-1",
    };

    const snapNoPlay = buildDashboardSnapshot({
      now,
      baseUrl: "http://localhost:3000",
      caregivers: [...DEFAULT_CAREGIVERS],
      settings: makeSettings(),
      todayFeedings: [],
      litterEvents: [recentClean],
      supplies: makeFullSupplies(),
      weekEvents: [],
      pushSubscriptions: [],
    });

    expect(snapNoPlay.weeklyPlay.count).toBe(0);
    expect(snapNoPlay.survivability.status).toBe("SAFE");
    expect(snapNoPlay.survivability.score).toBe(100);
    expect(snapNoPlay.survivability.totalCoreCount).toBe(6);
    expect(snapNoPlay.meals.target).toBe(3);

    // Past check-in + 60m (21:05 PHT) with < 3 meals -> OVERDUE even with 3/3 weekly play
    const overdueNow = getSlotScheduledAt("2026-11-20", 21, 5);
    const threePlays: CareEventRecord[] = [1, 2, 3].map((n) => ({
      id: `p-${n}`,
      eventType: "OUT_OF_ROOM",
      caregiverId: "mom",
      occurredAtIso: getSlotScheduledAt("2026-11-19", 10 + n, 0).toISOString(),
      isoWeekKey: "2026-W47",
      idempotencyKey: `p-${n}`,
    }));

    const snapWithPlay = buildDashboardSnapshot({
      now: overdueNow,
      baseUrl: "http://localhost:3000",
      caregivers: [...DEFAULT_CAREGIVERS],
      settings: makeSettings(),
      todayFeedings: [makeFeedLog("2026-11-20", 10, 0, 1)],
      litterEvents: [recentClean],
      supplies: makeFullSupplies(),
      weekEvents: threePlays,
      pushSubscriptions: [],
    });

    expect(snapWithPlay.weeklyPlay.count).toBe(3);
    expect(snapWithPlay.weeklyPlay.isGoalMet).toBe(true);
    expect(snapWithPlay.survivability.status).toBe("OVERDUE");
    expect(snapWithPlay.survivability.score).toBeLessThan(100);

    const directNoPlay = computeSurvivability({
      meals: snapWithPlay.meals,
      litter: snapWithPlay.litter,
      supplies: snapWithPlay.supplies,
    });
    expect(directNoPlay.score).toBe(snapWithPlay.survivability.score);
  });

  it("[AC-016][AC-018] activates Sunday goal-met food piggyback and every-3rd-clean litter piggyback", () => {
    // 2026-11-22 is Sunday in Manila
    const sundayEvening = getSlotScheduledAt("2026-11-22", 19, 10);
    const sundayFeedings = [
      makeFeedLog("2026-11-22", 9, 30, 1),
      makeFeedLog("2026-11-22", 14, 0, 2),
      makeFeedLog("2026-11-22", 19, 5, 3),
    ];

    const threeLitterCleans: CareEventRecord[] = [1, 2, 3].map((n) => ({
      id: `lc-${n}`,
      eventType: "LITTER_CLEAN",
      caregiverId: "ate",
      occurredAtIso: getSlotScheduledAt(`2026-11-${17 + n}`, 12, 0).toISOString(),
      isoWeekKey: "2026-W47",
      idempotencyKey: `lc-${n}`,
    }));

    const snap = buildDashboardSnapshot({
      now: sundayEvening,
      baseUrl: "http://localhost:3000",
      caregivers: [...DEFAULT_CAREGIVERS],
      settings: makeSettings(),
      todayFeedings: sundayFeedings,
      litterEvents: threeLitterCleans,
      supplies: makeFullSupplies(),
      weekEvents: [],
      pushSubscriptions: [],
    });

    expect(snap.meals.isGoalMet).toBe(true);
    expect(snap.meals.showFoodStockPiggyback).toBe(true);
    expect(snap.litter.totalCleansCount).toBe(3);
    expect(snap.litter.showLitterStockPiggyback).toBe(true);

    // Only 2 meals on Sunday -> false; 3 meals on Friday -> false
    const sundayPartialSnap = buildDashboardSnapshot({
      now: sundayEvening,
      baseUrl: "http://localhost:3000",
      caregivers: [...DEFAULT_CAREGIVERS],
      settings: makeSettings(),
      todayFeedings: sundayFeedings.slice(0, 2),
      litterEvents: threeLitterCleans.slice(0, 2),
      supplies: makeFullSupplies(),
      weekEvents: [],
      pushSubscriptions: [],
    });
    expect(sundayPartialSnap.meals.showFoodStockPiggyback).toBe(false);
    expect(sundayPartialSnap.litter.showLitterStockPiggyback).toBe(false);

    const fridayEvening = getSlotScheduledAt("2026-11-20", 19, 10);
    const friSnap = buildDashboardSnapshot({
      now: fridayEvening,
      baseUrl: "http://localhost:3000",
      caregivers: [...DEFAULT_CAREGIVERS],
      settings: makeSettings(),
      todayFeedings: [
        makeFeedLog("2026-11-20", 9, 30, 1),
        makeFeedLog("2026-11-20", 14, 0, 2),
        makeFeedLog("2026-11-20", 19, 5, 3),
      ],
      litterEvents: threeLitterCleans.slice(0, 2),
      supplies: makeFullSupplies(),
      weekEvents: [],
      pushSubscriptions: [],
    });
    expect(friSnap.meals.showFoodStockPiggyback).toBe(false);
    expect(friSnap.litter.showLitterStockPiggyback).toBe(false);
  });

  it("computes escalationStage across check-in reminder and +60m owner escalation boundaries", () => {
    const settings = makeSettings(); // mealReminderHour=20, mealReminderMinute=0, dailyMealGoal=3
    const args = {
      todayDateKey: "2026-11-20",
      settings,
      todayFeedings: [makeFeedLog("2026-11-20", 10, 0, 1)],
    };

    expect(
      computeEscalationStage({ ...args, now: getSlotScheduledAt("2026-11-20", 19, 59) }),
    ).toBe("NONE");
    expect(
      computeEscalationStage({ ...args, now: getSlotScheduledAt("2026-11-20", 20, 0) }),
    ).toBe("REMINDER_SENT");
    expect(
      computeEscalationStage({ ...args, now: getSlotScheduledAt("2026-11-20", 21, 0) }),
    ).toBe("OWNER_ESCALATED");

    // When daily goal is met, escalationStage is NONE even at 21:30
    expect(
      computeEscalationStage({
        todayDateKey: "2026-11-20",
        settings,
        todayFeedings: [
          makeFeedLog("2026-11-20", 10, 0, 1),
          makeFeedLog("2026-11-20", 14, 0, 2),
          makeFeedLog("2026-11-20", 19, 0, 3),
        ],
        now: getSlotScheduledAt("2026-11-20", 21, 30),
      }),
    ).toBe("NONE");
  });

  it("[AC-030] builds exact 14 Manila calendar day history [today - 13d .. today] with consolidated meal counts", () => {
    const now = getSlotScheduledAt("2026-11-20", 11, 0);
    const todayLogs = [
      makeFeedLog("2026-11-20", 10, 10, 1, "ate"),
      makeFeedLog("2026-11-20", 10, 45, 2, "mom"),
    ];
    const history = buildOwnerHistory({
      now,
      caregivers: [...DEFAULT_CAREGIVERS],
      settings: makeSettings(),
      feedingLogs: todayLogs,
      careEvents: [],
      supplies: makeFullSupplies(),
      pushSubscriptions: [],
    });

    expect(history.days).toHaveLength(14);
    expect(history.days[0].dateKey).toBe("2026-11-07");
    expect(history.days[13].dateKey).toBe("2026-11-20");
    expect(history.days[13].mealCount).toBe(2);
    expect(history.days[13].mealGoal).toBe(3);
    expect(history.days[13].mealStatus).toBe("PARTIAL");
    expect(history.days[13].details.meals).toHaveLength(2);
    expect(history.todayTimeline.length).toBeGreaterThanOrEqual(2);
  });
});
