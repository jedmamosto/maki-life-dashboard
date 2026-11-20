import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as postCronTick } from "@/app/api/cron/tick/route";
import { POST as postMealFeed } from "@/app/api/meals/feed/route";
import { POST as postMealUndo } from "@/app/api/meals/undo/route";
import { POST as postPushSubscribe } from "@/app/api/push/subscribe/route";
import { POST as postPushTest } from "@/app/api/push/test/route";
import { getSlotScheduledAt } from "@/lib/timezone";
import { createTestHarness, type TestHarness } from "../fakes/test-harness";

describe("API integration: cron/tick security, escalations, and push health", () => {
  let harness: TestHarness;

  beforeEach(() => {
    harness = createTestHarness("2026-11-20T01:00:00.000Z"); // 09:00 AM PHT
  });

  afterEach(() => {
    harness.teardown();
  });

  async function callCron(bodyObj: Record<string, unknown>, signatureOverride?: string) {
    const body = JSON.stringify(bodyObj);
    const sig = signatureOverride ?? harness.qstash.sign(body);
    const req = new Request("http://localhost:3000/api/cron/tick", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(sig ? { "upstash-signature": sig } : {}),
      },
      body,
    });
    return postCronTick(req);
  }

  it("[AC-022] returns 401 on missing, invalid, or body-tampered QStash signature", async () => {
    const noSig = await postCronTick(
      new Request("http://localhost:3000/api/cron/tick", {
        method: "POST",
        body: "{}",
      }),
    );
    expect(noSig.status).toBe(401);

    const badSig = await callCron({ source: "qstash" }, "invalid-signature");
    expect(badSig.status).toBe(401);

    const sigForOriginal = harness.qstash.sign(JSON.stringify({ source: "qstash" }));
    const tampered = await callCron({ source: "evil" }, sigForOriginal);
    expect(tampered.status).toBe(401);
  });

  it("[AC-025][AC-029] Mark Fed cancels pending tiers and Undo re-arms unfired tiers", async () => {
    // Subscribe helper, family, owner via real API
    for (const [caregiverId, platform] of [
      ["ate", "android_pwa"],
      ["mom", "ios_pwa"],
      ["jed", "desktop"],
    ] as const) {
      const subRes = await postPushSubscribe(
        await harness.authedRequest("/api/push/subscribe", {
          method: "POST",
          body: JSON.stringify({
            caregiverId,
            endpoint: `https://push.example/${caregiverId}`,
            keys: { p256dh: `p-${caregiverId}`, auth: `a-${caregiverId}` },
            platform,
            supportsDeclarative: platform === "ios_pwa",
          }),
        }),
      );
      expect(subRes.status).toBe(201);
    }

    // Seed recent litter clean
    await harness.repo.logCareEvent({
      id: "lc-recent",
      eventType: "LITTER_CLEAN",
      caregiverId: "ate",
      occurredAtIso: harness.clock.nowIso(),
      isoWeekKey: "2026-W47",
      idempotencyKey: "lc-recent",
    });

    // Test ping works
    const testPingRes = await postPushTest(
      await harness.authedRequest("/api/push/test", {
        method: "POST",
        body: JSON.stringify({ caregiverId: "ate" }),
      }),
    );
    expect(testPingRes.status).toBe(200);
    expect(harness.push.sent).toHaveLength(1);
    harness.push.reset();

    // T+0 -> Helper fires
    harness.clock.setIso(getSlotScheduledAt("2026-11-20", 10, 0).toISOString());
    expect((await callCron({ tick: 1 })).status).toBe(200);
    expect(harness.push.sent).toHaveLength(1);

    // Mark Fed at 10:05 AM -> cancels T20/T45/T120
    harness.clock.setIso(getSlotScheduledAt("2026-11-20", 10, 5).toISOString());
    await postMealFeed(
      await harness.authedRequest("/api/meals/feed", {
        method: "POST",
        body: JSON.stringify({ period: "AM", caregiverId: "ate" }),
      }),
    );

    // Tick at 10:25 -> nothing fires while fed
    harness.clock.setIso(getSlotScheduledAt("2026-11-20", 10, 25).toISOString());
    await callCron({ tick: 2 });
    expect(harness.push.sent).toHaveLength(1);

    // Undo at 10:26 -> re-arms unfired T20/T45/T120 without refiring already-sent T0
    harness.clock.setIso(getSlotScheduledAt("2026-11-20", 10, 26).toISOString());
    await postMealUndo(
      await harness.authedRequest("/api/meals/undo", {
        method: "POST",
        body: JSON.stringify({ slotKey: "2026-11-20:AM" }),
      }),
    );
    await callCron({ tick: 3 });
    expect(harness.push.sent).toHaveLength(2); // T20 fired (not T0!)
    expect(harness.push.sent[1].payload.notification.title).toContain("Did Maki eat");
  });
});
