import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as getDashboard } from "@/app/api/dashboard/route";
import { GET as getHealth } from "@/app/api/health/route";
import { POST as postLitterClean } from "@/app/api/litter/clean/route";
import { PATCH as patchMealAttribution } from "@/app/api/meals/attribution/route";
import { POST as postMealFeed } from "@/app/api/meals/feed/route";
import { POST as postMealUndo } from "@/app/api/meals/undo/route";
import { POST as postPlay } from "@/app/api/play/route";
import { PATCH as patchSupplies } from "@/app/api/supplies/route";
import { getSlotScheduledAt } from "@/lib/timezone";
import { createTestHarness, type TestHarness } from "../fakes/test-harness";

describe("API integration: care logging, concurrency, undo, supplies, play", () => {
  let harness: TestHarness;

  beforeEach(() => {
    // 2026-11-20 08:00 AM PHT = 00:00 UTC
    harness = createTestHarness("2026-11-20T00:00:00.000Z");
  });

  afterEach(() => {
    harness.teardown();
  });

  it("[AC-036] GET /api/health returns 200 healthy status", async () => {
    const res = await getHealth();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; timezone: string };
    expect(body.ok).toBe(true);
    expect(body.timezone).toBe("Asia/Manila");
  });

  it("[AC-010][AC-011][AC-012][AC-015] logs timestamped feedings anytime, deduplicates idempotencyKey retries, allows extra meals, and supports attribution change", async () => {
    // 08:00 AM PHT -> allowed anytime with zero early-feed window lock
    const req1 = await harness.authedRequest("/api/meals/feed", {
      method: "POST",
      body: JSON.stringify({ caregiverId: "ate", idempotencyKey: "meal-idem-1" }),
    });
    const res1 = await postMealFeed(req1);
    expect(res1.status).toBe(201);
    const data1 = await res1.json();
    expect(data1.alreadyFed).toBe(false);
    expect(data1.snapshot.meals.count).toBe(1);
    expect(data1.snapshot.meals.entries).toHaveLength(1);

    // Retrying with same idempotencyKey deduplicates safely (200, count stays 1)
    const retryReq = await harness.authedRequest("/api/meals/feed", {
      method: "POST",
      body: JSON.stringify({ caregiverId: "mom", idempotencyKey: "meal-idem-1" }),
    });
    const retryRes = await postMealFeed(retryReq);
    expect(retryRes.status).toBe(200);
    const retryData = await retryRes.json();
    expect(retryData.alreadyFed).toBe(true);
    expect(retryData.record.id).toBe(data1.record.id);
    expect(retryData.snapshot.meals.count).toBe(1);

    // Distinct feedings increment count (including beyond dailyMealGoal=3)
    for (let i = 2; i <= 4; i++) {
      harness.clock.advanceMinutes(15);
      const nextRes = await postMealFeed(
        await harness.authedRequest("/api/meals/feed", {
          method: "POST",
          body: JSON.stringify({ caregiverId: "mom", idempotencyKey: `meal-idem-${i}` }),
        }),
      );
      expect(nextRes.status).toBe(201);
    }
    const after4 = await (
      await getDashboard(await harness.authedRequest("/api/dashboard"))
    ).json();
    expect(after4.meals.count).toBe(4);
    expect(after4.meals.isGoalMet).toBe(true);

    // Attribution change updates completedBy for specific logId without creating duplicate log
    const attrReq = await harness.authedRequest("/api/meals/attribution", {
      method: "PATCH",
      body: JSON.stringify({ logId: data1.record.id, caregiverId: "dad" }),
    });
    const attrRes = await patchMealAttribution(attrReq);
    expect(attrRes.status).toBe(200);
    const attrData = await attrRes.json();
    expect(attrData.completedBy.slug).toBe("dad");
    expect(attrData.snapshot.meals.entries[0].completedBy.slug).toBe("dad");
    expect(attrData.snapshot.meals.count).toBe(4);
  });

  it("[AC-013][AC-014] allows same-day meal Undo by logId and rejects prior-day Undo with 422", async () => {
    harness.clock.setIso(getSlotScheduledAt("2026-11-20", 10, 5).toISOString());
    const feedRes = await postMealFeed(
      await harness.authedRequest("/api/meals/feed", {
        method: "POST",
        body: JSON.stringify({ caregiverId: "ate" }),
      }),
    );
    expect(feedRes.status).toBe(201);
    const feedBody = await feedRes.json();
    const logId = feedBody.record.id as string;

    const undoReq = await harness.authedRequest("/api/meals/undo", {
      method: "POST",
      body: JSON.stringify({ logId }),
    });
    const undoRes = await postMealUndo(undoReq);
    expect(undoRes.status).toBe(200);
    const undoData = await undoRes.json();
    expect(undoData.snapshot.meals.count).toBe(0);

    // Re-feed succeeds with 201
    const refeedRes = await postMealFeed(
      await harness.authedRequest("/api/meals/feed", {
        method: "POST",
        body: JSON.stringify({ caregiverId: "mom" }),
      }),
    );
    expect(refeedRes.status).toBe(201);
    const refeedBody = await refeedRes.json();

    // Advance to next Manila day -> prior-day undo MUST return 422
    harness.clock.setIso(getSlotScheduledAt("2026-11-21", 8, 0).toISOString());
    const priorUndoReq = await harness.authedRequest("/api/meals/undo", {
      method: "POST",
      body: JSON.stringify({ logId: refeedBody.record.id }),
    });
    const priorUndoRes = await postMealUndo(priorUndoReq);
    expect(priorUndoRes.status).toBe(422);
    expect(harness.push.sent).toHaveLength(0);
    expect(harness.email.sent).toHaveLength(0);
  });

  it("[AC-017][AC-018][AC-019][AC-020] logs litter cleans, triggers supply latch alerts, and tracks weekly play across ISO week boundary", async () => {
    await harness.repo.upsertPushSubscription({
      caregiverId: "jed",
      endpoint: "https://push.example/jed",
      p256dh: "k",
      auth: "a",
      platform: "desktop",
      supportsDeclarative: false,
      lastSeenAtIso: harness.clock.nowIso(),
      lastSuccessAtIso: null,
    });

    // 3 litter cleans -> 3rd triggers showLitterStockPiggyback
    for (let i = 1; i <= 3; i++) {
      harness.clock.advanceMinutes(10);
      const req = await harness.authedRequest("/api/litter/clean", {
        method: "POST",
        body: JSON.stringify({ caregiverId: "ate", idempotencyKey: `clean-${i}` }),
      });
      const res = await postLitterClean(req);
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.snapshot.litter.totalCleansCount).toBe(i);
      expect(body.snapshot.litter.showLitterStockPiggyback).toBe(i === 3);
    }

    // Supply transitions: FULL -> LOW (1 alert), LOW -> LOW (0), LOW -> EMPTY (1), FULL -> LOW (1)
    const patch = async (level: string) => {
      const req = await harness.authedRequest("/api/supplies", {
        method: "PATCH",
        body: JSON.stringify({ supplyKey: "CAT_FOOD", level, caregiverId: "ate" }),
      });
      return patchSupplies(req);
    };
    expect((await (await patch("LOW")).json()).alertedLevel).toBe("LOW");
    expect((await (await patch("LOW")).json()).alertedLevel).toBeNull();
    expect((await (await patch("EMPTY")).json()).alertedLevel).toBe("EMPTY");
    expect((await (await patch("EMPTY")).json()).alertedLevel).toBeNull();
    expect((await (await patch("FULL")).json()).alertedLevel).toBeNull();
    expect((await (await patch("LOW")).json()).alertedLevel).toBe("LOW");
    expect(harness.push.sent).toHaveLength(3);

    // Weekly play resets on ISO week boundary 2026-W53 -> 2027-W01
    harness.clock.setIso(getSlotScheduledAt("2027-01-01", 15, 0).toISOString()); // 2026-W53
    const p1 = await postPlay(
      await harness.authedRequest("/api/play", {
        method: "POST",
        body: JSON.stringify({ caregiverId: "mom" }),
      }),
    );
    expect((await p1.json()).snapshot.weeklyPlay.isoWeekKey).toBe("2026-W53");

    harness.clock.setIso(getSlotScheduledAt("2027-01-04", 9, 0).toISOString()); // 2027-W01
    const dashRes = await getDashboard(await harness.authedRequest("/api/dashboard"));
    const dash = await dashRes.json();
    expect(dash.weeklyPlay.isoWeekKey).toBe("2027-W01");
    expect(dash.weeklyPlay.count).toBe(0);
  });

  it("exposes default dailyMealGoal=3 and mealReminderTime=20:00 in dashboard settings", async () => {
    harness.clock.setIso(getSlotScheduledAt("2026-11-20", 14, 5).toISOString());
    const feedRes = await postMealFeed(
      await harness.authedRequest("/api/meals/feed", {
        method: "POST",
        body: JSON.stringify({ caregiverId: "ate" }),
      }),
    );
    expect(feedRes.status).toBe(201);
    const feedData = await feedRes.json();
    expect(feedData.snapshot.settings.dailyMealGoal).toBe(3);
    expect(feedData.snapshot.settings.mealReminderTime).toBe("20:00");
    expect(feedData.snapshot.meals.count).toBe(1);
    expect(feedData.snapshot.meals.entries[0].completedBy.slug).toBe("ate");

    const undoRes = await postMealUndo(
      await harness.authedRequest("/api/meals/undo", {
        method: "POST",
        body: JSON.stringify({ logId: feedData.record.id }),
      }),
    );
    expect(undoRes.status).toBe(200);
    const undoData = await undoRes.json();
    expect(undoData.snapshot.meals.count).toBe(0);
  });
});
