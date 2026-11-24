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

describe("domain engine (survivability, piggybacks, escalation stage, 14-day history)", () => {
  it("[AC-021] calculates Survivability strictly from core care; weekly play 0/3 never lowers score", () => {
    const now = getSlotScheduledAt("2026-11-20", 8, 0); // 08:00 AM PHT (before 10 AM meal)
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
      amLog: null,
      midLog: null,
      pmLog: null,
      litterEvents: [recentClean],
      supplies: makeFullSupplies(),
      weekEvents: [],
      pushSubscriptions: [],
    });

    expect(snapNoPlay.weeklyPlay.count).toBe(0);
    expect(snapNoPlay.survivability.status).toBe("SAFE");
    expect(snapNoPlay.survivability.score).toBe(100);
    expect(snapNoPlay.survivability.totalCoreCount).toBe(6);
    expect(snapNoPlay.meals.mid.scheduledTimeLabel).toBe("2:00 PM");

    // Late AM meal (10:50 AM PHT = 50m late) -> OVERDUE even with 3/3 weekly play
    const overdueNow = getSlotScheduledAt("2026-11-20", 10, 50);
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
      amLog: null,
      midLog: null,
      pmLog: null,
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

  it("[AC-016][AC-018] activates Sunday PM food piggyback and every-3rd-clean litter piggyback", () => {
    // 2026-11-22 is Sunday in Manila
    const sundayEvening = getSlotScheduledAt("2026-11-22", 19, 10);
    const pmLog: FeedingLogRecord = {
      id: "feed-sun-pm",
      slotKey: "2026-11-22:PM",
      serviceDate: "2026-11-22",
      period: "PM",
      dueAtIso: getSlotScheduledAt("2026-11-22", 19, 0).toISOString(),
      completedById: "ate",
      completedAtIso: getSlotScheduledAt("2026-11-22", 19, 5).toISOString(),
      undoneAtIso: null,
    };

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
      amLog: null,
      midLog: null,
      pmLog,
      litterEvents: threeLitterCleans,
      supplies: makeFullSupplies(),
      weekEvents: [],
      pushSubscriptions: [],
    });

    expect(snap.meals.pm.showFoodStockPiggyback).toBe(true);
    expect(snap.meals.mid.showFoodStockPiggyback).toBe(false);
    expect(snap.meals.am.showFoodStockPiggyback).toBe(false);
    expect(snap.litter.totalCleansCount).toBe(3);
    expect(snap.litter.showLitterStockPiggyback).toBe(true);

    // 2 litter cleans -> false, weekday PM -> false
    const fridayEvening = getSlotScheduledAt("2026-11-20", 19, 10);
    const friSnap = buildDashboardSnapshot({
      now: fridayEvening,
      baseUrl: "http://localhost:3000",
      caregivers: [...DEFAULT_CAREGIVERS],
      settings: makeSettings(),
      amLog: null,
      midLog: null,
      pmLog: {
        ...pmLog,
        id: "feed-fri-pm",
        slotKey: "2026-11-20:PM",
        serviceDate: "2026-11-20",
      },
      litterEvents: threeLitterCleans.slice(0, 2),
      supplies: makeFullSupplies(),
      weekEvents: [],
      pushSubscriptions: [],
    });
    expect(friSnap.meals.pm.showFoodStockPiggyback).toBe(false);
    expect(friSnap.litter.showLitterStockPiggyback).toBe(false);
  });

  it("computes escalationStage across T0, T20, T45, and T120 boundaries", () => {
    const settings = makeSettings();
    const args = {
      todayDateKey: "2026-11-20",
      settings,
      amLog: null,
      midLog: null,
      pmLog: null,
    };

    expect(
      computeEscalationStage({ ...args, now: getSlotScheduledAt("2026-11-20", 9, 59) }),
    ).toBe("NONE");
    expect(
      computeEscalationStage({ ...args, now: getSlotScheduledAt("2026-11-20", 10, 0) }),
    ).toBe("T0_HELPER");
    expect(
      computeEscalationStage({ ...args, now: getSlotScheduledAt("2026-11-20", 10, 20) }),
    ).toBe("T20_HELPER");
    expect(
      computeEscalationStage({ ...args, now: getSlotScheduledAt("2026-11-20", 10, 45) }),
    ).toBe("T45_FAMILY_OWNER");
    expect(
      computeEscalationStage({ ...args, now: getSlotScheduledAt("2026-11-20", 12, 0) }),
    ).toBe("T120_OWNER");

    // When AM is fed, MID (14:00) drives escalation
    const amFed: FeedingLogRecord = {
      id: "f-am",
      slotKey: "2026-11-20:AM",
      serviceDate: "2026-11-20",
      period: "AM",
      dueAtIso: getSlotScheduledAt("2026-11-20", 10, 0).toISOString(),
      completedById: "ate",
      completedAtIso: getSlotScheduledAt("2026-11-20", 10, 0).toISOString(),
      undoneAtIso: null,
    };
    expect(
      computeEscalationStage({
        ...args,
        amLog: amFed,
        now: getSlotScheduledAt("2026-11-20", 14, 25),
      }),
    ).toBe("T20_HELPER");
  });

  it("[AC-030] builds exact 14 Manila calendar day history [today - 13d .. today]", () => {
    const now = getSlotScheduledAt("2026-11-20", 11, 0);
    const amToday: FeedingLogRecord = {
      id: "f-today-am",
      slotKey: "2026-11-20:AM",
      serviceDate: "2026-11-20",
      period: "AM",
      dueAtIso: getSlotScheduledAt("2026-11-20", 10, 0).toISOString(),
      completedById: "ate",
      completedAtIso: getSlotScheduledAt("2026-11-20", 10, 10).toISOString(),
      undoneAtIso: null,
    };
    const history = buildOwnerHistory({
      now,
      caregivers: [...DEFAULT_CAREGIVERS],
      settings: makeSettings(),
      feedingLogs: [amToday],
      careEvents: [],
      supplies: makeFullSupplies(),
      pushSubscriptions: [],
    });

    expect(history.days).toHaveLength(14);
    expect(history.days[0].dateKey).toBe("2026-11-07");
    expect(history.days[13].dateKey).toBe("2026-11-20");
    expect(history.days[13].amStatus).toBe("ON_TIME");
    expect(history.days[13].midStatus).toBe("UPCOMING");
    expect(history.days[13].pmStatus).toBe("UPCOMING");
    expect(history.todayTimeline.length).toBeGreaterThanOrEqual(1);
  });
});
