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

  it("[AC-010][AC-011][AC-012][AC-015] enforces early feed window, returns 201/200 on concurrent feed, and supports attribution change", async () => {
    // 08:00 AM PHT is 120 min before 10:00 AM -> 422
    const earlyReq = await harness.authedRequest("/api/meals/feed", {
      method: "POST",
      body: JSON.stringify({ period: "AM", caregiverId: "ate" }),
    });
    const earlyRes = await postMealFeed(earlyReq);
    expect(earlyRes.status).toBe(422);

    // Move clock to exact T-90m (08:30 AM PHT) -> concurrent feed
    harness.clock.setIso(getSlotScheduledAt("2026-11-20", 8, 30).toISOString());
    const [req1, req2] = await Promise.all([
      harness.authedRequest("/api/meals/feed", {
        method: "POST",
        body: JSON.stringify({ period: "AM", caregiverId: "ate" }),
      }),
      harness.authedRequest("/api/meals/feed", {
        method: "POST",
        body: JSON.stringify({ period: "AM", caregiverId: "mom" }),
      }),
    ]);

    const [res1, res2] = await Promise.all([postMealFeed(req1), postMealFeed(req2)]);
    const statuses = [res1.status, res2.status].sort((a, b) => a - b);
    expect(statuses).toEqual([200, 201]);

    const payloads = await Promise.all([res1.json(), res2.json()]);
    const winnerPayload = payloads.find((p) => p.alreadyFed === false);
    const loserPayload = payloads.find((p) => p.alreadyFed === true);
    expect(winnerPayload).toBeDefined();
    expect(loserPayload).toBeDefined();
    expect(loserPayload.record.id).toBe(winnerPayload.record.id);

    // Attribution change updates completedBy without creating duplicate log
    const attrReq = await harness.authedRequest("/api/meals/attribution", {
      method: "PATCH",
      body: JSON.stringify({ slotKey: "2026-11-20:AM", caregiverId: "dad" }),
    });
    const attrRes = await patchMealAttribution(attrReq);
    expect(attrRes.status).toBe(200);
    const attrData = await attrRes.json();
    expect(attrData.completedBy.slug).toBe("dad");
    expect(attrData.snapshot.meals.am.completedBy.slug).toBe("dad");
  });

  it("[AC-013][AC-014] allows same-day meal Undo and rejects prior-day Undo with 422", async () => {
    harness.clock.setIso(getSlotScheduledAt("2026-11-20", 10, 5).toISOString());
    const feedReq = await harness.authedRequest("/api/meals/feed", {
      method: "POST",
      body: JSON.stringify({ period: "AM", caregiverId: "ate" }),
    });
    expect((await postMealFeed(feedReq)).status).toBe(201);

    const undoReq = await harness.authedRequest("/api/meals/undo", {
      method: "POST",
      body: JSON.stringify({ slotKey: "2026-11-20:AM" }),
    });
    const undoRes = await postMealUndo(undoReq);
    expect(undoRes.status).toBe(200);
    const undoData = await undoRes.json();
    expect(undoData.snapshot.meals.am.state).toBe("DUE_NOW");

    // Re-feed succeeds with 201
    const refeedReq = await harness.authedRequest("/api/meals/feed", {
      method: "POST",
      body: JSON.stringify({ period: "AM", caregiverId: "mom" }),
    });
    expect((await postMealFeed(refeedReq)).status).toBe(201);

    // Advance to next Manila day -> prior-day undo MUST return 422
    harness.clock.setIso(getSlotScheduledAt("2026-11-21", 8, 0).toISOString());
    const priorUndoReq = await harness.authedRequest("/api/meals/undo", {
      method: "POST",
      body: JSON.stringify({ slotKey: "2026-11-20:AM" }),
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

  it("supports MID (2:00 PM) feed, undo, and default midMealTime in dashboard settings", async () => {
    harness.clock.setIso(getSlotScheduledAt("2026-11-20", 14, 5).toISOString());
    const feedRes = await postMealFeed(
      await harness.authedRequest("/api/meals/feed", {
        method: "POST",
        body: JSON.stringify({ period: "MID", caregiverId: "ate" }),
      }),
    );
    expect(feedRes.status).toBe(201);
    const feedData = await feedRes.json();
    expect(feedData.snapshot.settings.midMealTime).toBe("14:00");
    expect(feedData.snapshot.meals.mid.state).toBe("DONE");
    expect(feedData.snapshot.meals.mid.completedBy.slug).toBe("ate");

    const undoRes = await postMealUndo(
      await harness.authedRequest("/api/meals/undo", {
        method: "POST",
        body: JSON.stringify({ period: "MID" }),
      }),
    );
    expect(undoRes.status).toBe(200);
    const undoData = await undoRes.json();
    expect(undoData.snapshot.meals.mid.state).toBe("DUE_NOW");
  });
});
