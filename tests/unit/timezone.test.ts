import { describe, expect, it } from "vitest";
import {
  addManilaDays,
  clampToQuietHours,
  formatManilaTimeLabel,
  getManilaDateKey,
  getManilaDateKeysBack,
  getManilaIsoWeekKey,
  getSlotScheduledAt,
  isWithinEarlyFeedWindow,
} from "@/lib/timezone";

describe("timezone helpers (Asia/Manila UTC+08:00 lock)", () => {
  it("[AC-006] computes Manila calendar date keys across UTC midnight boundaries", () => {
    expect(process.env.TZ).toBe("UTC");
    // 2026-11-20T15:59:59Z -> 2026-11-20 23:59:59 PHT
    expect(getManilaDateKey(new Date("2026-11-20T15:59:59.000Z"))).toBe("2026-11-20");
    // 2026-11-20T16:00:00Z -> 2026-11-21 00:00:00 PHT
    expect(getManilaDateKey(new Date("2026-11-20T16:00:00.000Z"))).toBe("2026-11-21");
  });

  it("[AC-007] calculates ISO week keys accurately across ISO year boundaries", () => {
    // 2027-01-01 in Manila is Friday of ISO week 2026-W53
    expect(getManilaIsoWeekKey(new Date("2026-12-31T16:00:00.000Z"))).toBe("2026-W53");
    expect(getManilaIsoWeekKey(new Date("2027-01-01T04:00:00.000Z"))).toBe("2026-W53");
    // 2027-01-03 Sunday in Manila -> still 2026-W53
    expect(getManilaIsoWeekKey(new Date("2027-01-03T15:59:00.000Z"))).toBe("2026-W53");
    // 2027-01-04 Monday 00:00 PHT -> 2027-W01
    expect(getManilaIsoWeekKey(new Date("2027-01-03T16:00:00.000Z"))).toBe("2027-W01");
  });

  it("[AC-008] enforces inclusive T-90m early feed window", () => {
    const amScheduled = getSlotScheduledAt("2026-11-20", 10, 0);
    // 10:00 AM PHT = 02:00 UTC
    expect(amScheduled.toISOString()).toBe("2026-11-20T02:00:00.000Z");

    // 08:29:59 PHT (90m 1s early) -> false
    const tooEarly = new Date("2026-11-20T00:29:59.000Z");
    expect(isWithinEarlyFeedWindow(tooEarly, amScheduled)).toBe(false);

    // 08:30:00 PHT (exact T-90m) -> true (inclusive)
    const exactBoundary = new Date("2026-11-20T00:30:00.000Z");
    expect(isWithinEarlyFeedWindow(exactBoundary, amScheduled)).toBe(true);

    // 10:05:00 PHT -> true
    const afterDue = new Date("2026-11-20T02:05:00.000Z");
    expect(isWithinEarlyFeedWindow(afterDue, amScheduled)).toBe(true);
  });

  it("[AC-009] clamps timestamps to House Quiet Hours [09:00, 20:00] PHT", () => {
    // 05:00 PHT -> same day 09:00 PHT (01:00 UTC)
    const preNine = getSlotScheduledAt("2026-11-20", 5, 0);
    expect(clampToQuietHours(preNine).toISOString()).toBe("2026-11-20T01:00:00.000Z");

    // 08:59 PHT -> same day 09:00 PHT
    const justBeforeNine = getSlotScheduledAt("2026-11-20", 8, 59);
    expect(clampToQuietHours(justBeforeNine).toISOString()).toBe("2026-11-20T01:00:00.000Z");

    // 09:00 PHT -> unchanged
    const exactNine = getSlotScheduledAt("2026-11-20", 9, 0);
    expect(clampToQuietHours(exactNine).toISOString()).toBe("2026-11-20T01:00:00.000Z");

    // 14:30 PHT -> unchanged
    const midday = getSlotScheduledAt("2026-11-20", 14, 30);
    expect(clampToQuietHours(midday).toISOString()).toBe("2026-11-20T06:30:00.000Z");

    // 20:00 PHT -> next day 09:00 PHT
    const exactTwenty = getSlotScheduledAt("2026-11-20", 20, 0);
    expect(clampToQuietHours(exactTwenty).toISOString()).toBe("2026-11-21T01:00:00.000Z");

    // 23:15 PHT -> next day 09:00 PHT
    const lateNight = getSlotScheduledAt("2026-11-20", 23, 15);
    expect(clampToQuietHours(lateNight).toISOString()).toBe("2026-11-21T01:00:00.000Z");
  });

  it("generates ascending Manila date keys and formats Manila time labels", () => {
    expect(addManilaDays("2026-11-20", -13)).toBe("2026-11-07");
    const keys = getManilaDateKeysBack(new Date("2026-11-20T10:00:00.000Z"), 14);
    expect(keys).toHaveLength(14);
    expect(keys[0]).toBe("2026-11-07");
    expect(keys[13]).toBe("2026-11-20");
    expect(formatManilaTimeLabel(getSlotScheduledAt("2026-11-20", 19, 5))).toBe("7:05 PM");
  });
});
