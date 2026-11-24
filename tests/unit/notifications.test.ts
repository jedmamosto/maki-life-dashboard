import { beforeEach, describe, expect, it } from "vitest";
import { MemoryCareRepository } from "@/db/file-repository";
import {
  runCronEscalations,
  sendPushToRoles,
  setEmailTransportForTests,
  setPushTransportForTests,
} from "@/lib/notifications";
import { getSlotScheduledAt } from "@/lib/timezone";
import { FakeEmailTransport } from "../fakes/email-transport";
import { FakePushTransport } from "../fakes/push-transport";

describe("notification & escalation pipeline", () => {
  let repo: MemoryCareRepository;
  let push: FakePushTransport;
  let email: FakeEmailTransport;

  beforeEach(async () => {
    repo = new MemoryCareRepository();
    push = new FakePushTransport();
    email = new FakeEmailTransport();
    setPushTransportForTests(push);
    setEmailTransportForTests(email);

    await repo.upsertPushSubscription({
      caregiverId: "ate",
      endpoint: "https://push.example/ate",
      p256dh: "p256dh-ate",
      auth: "auth-ate",
      platform: "android_pwa",
      supportsDeclarative: false,
      lastSeenAtIso: "2026-11-20T00:00:00.000Z",
      lastSuccessAtIso: null,
    });
    await repo.upsertPushSubscription({
      caregiverId: "mom",
      endpoint: "https://push.example/mom",
      p256dh: "p256dh-mom",
      auth: "auth-mom",
      platform: "ios_pwa",
      supportsDeclarative: true,
      lastSeenAtIso: "2026-11-20T00:00:00.000Z",
      lastSuccessAtIso: null,
    });
    await repo.upsertPushSubscription({
      caregiverId: "jed",
      endpoint: "https://push.example/jed",
      p256dh: "p256dh-jed",
      auth: "auth-jed",
      platform: "desktop",
      supportsDeclarative: false,
      lastSeenAtIso: "2026-11-20T00:00:00.000Z",
      lastSuccessAtIso: null,
    });
  });

  it("[AC-023] escalates meal in 4 deduped tiers with RFC 8030 payload and T+120m email", async () => {
    // Seed a recent litter clean so litter alerts do not interfere
    await repo.logCareEvent({
      id: "clean-0",
      eventType: "LITTER_CLEAN",
      caregiverId: "ate",
      occurredAtIso: getSlotScheduledAt("2026-11-20", 8, 0).toISOString(),
      isoWeekKey: "2026-W47",
      idempotencyKey: "clean-0",
    });

    // T+0 (10:00 AM PHT) -> Helper only
    await runCronEscalations({
      repo,
      now: getSlotScheduledAt("2026-11-20", 10, 0),
      baseUrl: "http://localhost:3000",
    });
    expect(push.sent.map((s) => s.endpoint)).toEqual(["https://push.example/ate"]);
    expect(push.sent[0].payload.web_push).toBe(8030);
    expect(push.sent[0].options).toEqual({ urgency: "high", TTL: 1800 });

    // Re-running at T+5m sends 0 duplicates
    await runCronEscalations({
      repo,
      now: getSlotScheduledAt("2026-11-20", 10, 5),
      baseUrl: "http://localhost:3000",
    });
    expect(push.sent).toHaveLength(1);

    // T+20m -> Helper self-check
    await runCronEscalations({
      repo,
      now: getSlotScheduledAt("2026-11-20", 10, 20),
      baseUrl: "http://localhost:3000",
    });
    expect(push.sent).toHaveLength(2);
    expect(push.sent[1].endpoint).toBe("https://push.example/ate");

    // T+45m -> Family + Owner
    await runCronEscalations({
      repo,
      now: getSlotScheduledAt("2026-11-20", 10, 45),
      baseUrl: "http://localhost:3000",
    });
    expect(push.sent).toHaveLength(4);
    expect(push.sent.slice(2).map((s) => s.endpoint).sort()).toEqual([
      "https://push.example/jed",
      "https://push.example/mom",
    ]);

    // T+120m -> Owner urgent push + Resend email
    await runCronEscalations({
      repo,
      now: getSlotScheduledAt("2026-11-20", 12, 0),
      baseUrl: "http://localhost:3000",
    });
    expect(push.sent).toHaveLength(5);
    expect(push.sent[4].endpoint).toBe("https://push.example/jed");
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0].to).toBe("owner@example.com");
  });

  it("[AC-024] suppresses all 4 meal escalation tiers when meal was fed early", async () => {
    await repo.logCareEvent({
      id: "clean-0",
      eventType: "LITTER_CLEAN",
      caregiverId: "ate",
      occurredAtIso: getSlotScheduledAt("2026-11-20", 8, 0).toISOString(),
      isoWeekKey: "2026-W47",
      idempotencyKey: "clean-0",
    });

    await repo.logFeedingAtomic({
      slotKey: "2026-11-20:AM",
      serviceDate: "2026-11-20",
      period: "AM",
      dueAtIso: getSlotScheduledAt("2026-11-20", 10, 0).toISOString(),
      completedById: "ate",
      completedAtIso: getSlotScheduledAt("2026-11-20", 8, 45).toISOString(),
    });

    await runCronEscalations({
      repo,
      now: getSlotScheduledAt("2026-11-20", 12, 30),
      baseUrl: "http://localhost:3000",
    });
    expect(push.sent).toHaveLength(0);
    expect(email.sent).toHaveLength(0);
  });

  it("[AC-026] clamps Day+2 litter Helper alert to [09:00, 20:00] PHT and fires Day+3 Owner alert immediately", async () => {
    // Clean at Nov 18 05:00 AM -> Day+2 due at Nov 20 05:00 AM -> clamped to Nov 20 09:00 AM
    await repo.logCareEvent({
      id: "clean-early",
      eventType: "LITTER_CLEAN",
      caregiverId: "ate",
      occurredAtIso: getSlotScheduledAt("2026-11-18", 5, 0).toISOString(),
      isoWeekKey: "2026-W47",
      idempotencyKey: "clean-early",
    });
    // Mark AM meal fed so only litter triggers
    await repo.logFeedingAtomic({
      slotKey: "2026-11-20:AM",
      serviceDate: "2026-11-20",
      period: "AM",
      dueAtIso: getSlotScheduledAt("2026-11-20", 10, 0).toISOString(),
      completedById: "ate",
      completedAtIso: getSlotScheduledAt("2026-11-20", 8, 30).toISOString(),
    });

    // At 06:00 AM PHT (49h after clean, before 09:00 AM quiet hours) -> 0 alerts
    await runCronEscalations({
      repo,
      now: getSlotScheduledAt("2026-11-20", 6, 0),
      baseUrl: "http://localhost:3000",
    });
    expect(push.sent).toHaveLength(0);

    // At 09:00 AM PHT -> Helper gets Day+2 litter alert
    await runCronEscalations({
      repo,
      now: getSlotScheduledAt("2026-11-20", 9, 0),
      baseUrl: "http://localhost:3000",
    });
    expect(push.sent).toHaveLength(1);
    expect(push.sent[0].endpoint).toBe("https://push.example/ate");

    // At Nov 21 05:05 AM PHT (72h+ -> Day+3) -> Owner escalation fires immediately (outside quiet hours)
    await repo.logFeedingAtomic({
      slotKey: "2026-11-21:AM",
      serviceDate: "2026-11-21",
      period: "AM",
      dueAtIso: getSlotScheduledAt("2026-11-21", 10, 0).toISOString(),
      completedById: "ate",
      completedAtIso: getSlotScheduledAt("2026-11-21", 9, 0).toISOString(),
    });
    await runCronEscalations({
      repo,
      now: getSlotScheduledAt("2026-11-21", 5, 5),
      baseUrl: "http://localhost:3000",
    });
    expect(push.sent).toHaveLength(2);
    expect(push.sent[1].endpoint).toBe("https://push.example/jed");

    // Re-running Day+3 is deduped (no duplicate Owner push)
    await runCronEscalations({
      repo,
      now: getSlotScheduledAt("2026-11-21", 5, 10),
      baseUrl: "http://localhost:3000",
    });
    expect(push.sent).toHaveLength(2);

    // Late-night Day+2 (22:00 PHT) clamps to next-day 09:00 PHT
    push.reset();
    await repo.logCareEvent({
      id: "clean-night",
      eventType: "LITTER_CLEAN",
      caregiverId: "ate",
      occurredAtIso: getSlotScheduledAt("2026-11-21", 22, 0).toISOString(),
      isoWeekKey: "2026-W47",
      idempotencyKey: "clean-night",
    });
    await repo.logFeedingAtomic({
      slotKey: "2026-11-23:AM",
      serviceDate: "2026-11-23",
      period: "AM",
      dueAtIso: getSlotScheduledAt("2026-11-23", 10, 0).toISOString(),
      completedById: "ate",
      completedAtIso: getSlotScheduledAt("2026-11-23", 9, 0).toISOString(),
    });
    await repo.logFeedingAtomic({
      slotKey: "2026-11-23:MID",
      serviceDate: "2026-11-23",
      period: "MID",
      dueAtIso: getSlotScheduledAt("2026-11-23", 14, 0).toISOString(),
      completedById: "ate",
      completedAtIso: getSlotScheduledAt("2026-11-23", 14, 0).toISOString(),
    });
    await repo.logFeedingAtomic({
      slotKey: "2026-11-23:PM",
      serviceDate: "2026-11-23",
      period: "PM",
      dueAtIso: getSlotScheduledAt("2026-11-23", 19, 0).toISOString(),
      completedById: "ate",
      completedAtIso: getSlotScheduledAt("2026-11-23", 18, 0).toISOString(),
    });

    // At Nov 23 22:30 PHT (48.5h, >= 20:00) -> suppressed until Nov 24 09:00 PHT
    await runCronEscalations({
      repo,
      now: getSlotScheduledAt("2026-11-23", 22, 30),
      baseUrl: "http://localhost:3000",
    });
    expect(push.sent).toHaveLength(0);

    await runCronEscalations({
      repo,
      now: getSlotScheduledAt("2026-11-24", 9, 0),
      baseUrl: "http://localhost:3000",
    });
    expect(push.sent).toHaveLength(1);
    expect(push.sent[0].endpoint).toBe("https://push.example/ate");
  });

  it("[AC-027] sends max 2 Family-only weekly play nudges (Wed 17:00 <2, Sat 11:00 <3)", async () => {
    // Seed recent clean & meals so only play nudges fire
    await repo.logCareEvent({
      id: "c1",
      eventType: "LITTER_CLEAN",
      caregiverId: "ate",
      occurredAtIso: getSlotScheduledAt("2026-11-18", 12, 0).toISOString(),
      isoWeekKey: "2026-W47",
      idempotencyKey: "c1",
    });
    // Wednesday 2026-11-18 17:05 PHT, 1 play logged (< 2) -> Family nudge fires
    await repo.logCareEvent({
      id: "p1",
      eventType: "OUT_OF_ROOM",
      caregiverId: "mom",
      occurredAtIso: getSlotScheduledAt("2026-11-17", 15, 0).toISOString(),
      isoWeekKey: "2026-W47",
      idempotencyKey: "p1",
    });
    await repo.logFeedingAtomic({
      slotKey: "2026-11-18:AM",
      serviceDate: "2026-11-18",
      period: "AM",
      dueAtIso: getSlotScheduledAt("2026-11-18", 10, 0).toISOString(),
      completedById: "ate",
      completedAtIso: getSlotScheduledAt("2026-11-18", 10, 0).toISOString(),
    });
    await repo.logFeedingAtomic({
      slotKey: "2026-11-18:MID",
      serviceDate: "2026-11-18",
      period: "MID",
      dueAtIso: getSlotScheduledAt("2026-11-18", 14, 0).toISOString(),
      completedById: "ate",
      completedAtIso: getSlotScheduledAt("2026-11-18", 14, 0).toISOString(),
    });

    await runCronEscalations({
      repo,
      now: getSlotScheduledAt("2026-11-18", 17, 5),
      baseUrl: "http://localhost:3000",
    });
    expect(push.sent).toHaveLength(1);
    expect(push.sent[0].endpoint).toBe("https://push.example/mom"); // Family ONLY

    // Log 2nd play on Thu, then Sat 2026-11-21 11:05 PHT (count=2 < 3) -> 2nd Family nudge fires
    await repo.logCareEvent({
      id: "p2",
      eventType: "OUT_OF_ROOM",
      caregiverId: "dad",
      occurredAtIso: getSlotScheduledAt("2026-11-19", 15, 0).toISOString(),
      isoWeekKey: "2026-W47",
      idempotencyKey: "p2",
    });
    await repo.logCareEvent({
      id: "c2",
      eventType: "LITTER_CLEAN",
      caregiverId: "ate",
      occurredAtIso: getSlotScheduledAt("2026-11-20", 12, 0).toISOString(),
      isoWeekKey: "2026-W47",
      idempotencyKey: "c2",
    });
    await repo.logFeedingAtomic({
      slotKey: "2026-11-21:AM",
      serviceDate: "2026-11-21",
      period: "AM",
      dueAtIso: getSlotScheduledAt("2026-11-21", 10, 0).toISOString(),
      completedById: "ate",
      completedAtIso: getSlotScheduledAt("2026-11-21", 10, 0).toISOString(),
    });

    await runCronEscalations({
      repo,
      now: getSlotScheduledAt("2026-11-21", 11, 5),
      baseUrl: "http://localhost:3000",
    });
    expect(push.sent).toHaveLength(2);
    expect(push.sent[1].endpoint).toBe("https://push.example/mom");
  });

  it("[AC-028] revokes subscription on 404/410 and triggers deduplicated Owner Push Health alert; keeps active on 503", async () => {
    push.setEndpointStatus("https://push.example/ate", 503);
    await sendPushToRoles({
      repo,
      roles: ["helper"],
      title: "Test",
      body: "Transient failure",
      navigate: "http://localhost:3000",
      now: new Date("2026-11-20T02:00:00.000Z"),
    });
    let activeHelpers = await repo.listActivePushSubscriptions(["helper"]);
    expect(activeHelpers).toHaveLength(1);

    push.setEndpointStatus("https://push.example/ate", 410);
    await sendPushToRoles({
      repo,
      roles: ["helper"],
      title: "Test",
      body: "Gone endpoint",
      navigate: "http://localhost:3000",
      now: new Date("2026-11-20T02:01:00.000Z"),
    });
    activeHelpers = await repo.listActivePushSubscriptions(["helper"]);
    expect(activeHelpers).toHaveLength(0);

    // Owner received Push Health alert
    const ownerAlerts = push.sent.filter((s) => s.endpoint === "https://push.example/jed");
    expect(ownerAlerts).toHaveLength(1);
    expect(ownerAlerts[0].payload.notification.title).toContain("Helper");
  });

  it("escalates MID (2:00 PM) meal independently when AM is already fed", async () => {
    await repo.logCareEvent({
      id: "clean-mid",
      eventType: "LITTER_CLEAN",
      caregiverId: "ate",
      occurredAtIso: getSlotScheduledAt("2026-11-20", 8, 0).toISOString(),
      isoWeekKey: "2026-W47",
      idempotencyKey: "clean-mid",
    });
    await repo.logFeedingAtomic({
      slotKey: "2026-11-20:AM",
      serviceDate: "2026-11-20",
      period: "AM",
      dueAtIso: getSlotScheduledAt("2026-11-20", 10, 0).toISOString(),
      completedById: "ate",
      completedAtIso: getSlotScheduledAt("2026-11-20", 10, 0).toISOString(),
    });

    await runCronEscalations({
      repo,
      now: getSlotScheduledAt("2026-11-20", 14, 0),
      baseUrl: "http://localhost:3000",
    });
    expect(push.sent).toHaveLength(1);
    expect(push.sent[0].endpoint).toBe("https://push.example/ate");
    expect(push.sent[0].payload.notification.title).toContain("2:00 PM");
  });
});
