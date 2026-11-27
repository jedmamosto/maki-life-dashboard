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

  it("[AC-025][AC-029] Reaching dailyMealGoal cancels pending check-ins and Undo re-arms unfired check-ins", async () => {
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

    // Check-in at 20:00 PHT with 0/3 meals -> Helper + Owner fire (2 pushes)
    harness.clock.setIso(getSlotScheduledAt("2026-11-20", 20, 0).toISOString());
    expect((await callCron({ tick: 1 })).status).toBe(200);
    expect(harness.push.sent).toHaveLength(2);

    // Log 3 meals at 20:05 PHT -> cancels +60m Owner Escalation
    harness.clock.setIso(getSlotScheduledAt("2026-11-20", 20, 5).toISOString());
    let thirdLogId = "";
    for (let i = 1; i <= 3; i++) {
      const feedRes = await postMealFeed(
        await harness.authedRequest("/api/meals/feed", {
          method: "POST",
          body: JSON.stringify({ caregiverId: "ate" }),
        }),
      );
      const feedBody = await feedRes.json();
      thirdLogId = feedBody.record.id;
    }

    // Tick at 21:05 -> nothing fires while goal (3/3) is met
    harness.clock.setIso(getSlotScheduledAt("2026-11-20", 21, 5).toISOString());
    await callCron({ tick: 2 });
    expect(harness.push.sent).toHaveLength(2);

    // Undo 3rd meal at 21:06 -> re-arms unfired OWNER_ESCALATION without refiring REMINDER
    harness.clock.setIso(getSlotScheduledAt("2026-11-20", 21, 6).toISOString());
    await postMealUndo(
      await harness.authedRequest("/api/meals/undo", {
        method: "POST",
        body: JSON.stringify({ logId: thirdLogId }),
      }),
    );
    await callCron({ tick: 3 });
    expect(harness.push.sent).toHaveLength(3); // OWNER_ESCALATION fired (not REMINDER)
    expect(harness.push.sent[2].payload.notification.title).toContain("meals short");
  });
});
