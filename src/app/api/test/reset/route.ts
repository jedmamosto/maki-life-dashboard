import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCareRepository } from "@/db";
import { MemoryCareRepository } from "@/db/file-repository";
import { resetPinRateLimiter } from "@/lib/auth";
import { getEffectiveNow, setMockNowIso } from "@/lib/dashboard-service";
import { makeSlotKey } from "@/lib/domain";
import {
  addManilaDays,
  getManilaDateKey,
  getManilaIsoWeekKey,
  getSlotScheduledAt,
} from "@/lib/timezone";
import { parseJsonBody, problemResponse } from "@/app/api/_shared";

const TestResetSchema = z.object({
  action: z
    .enum(["reset", "seedHistory", "setClock", "seedPushSub"])
    .optional(),
  nowIso: z.string().nullable().optional(),
  clockIso: z.string().nullable().optional(),
  days: z.number().int().min(1).max(30).optional(),
  subscription: z
    .object({
      caregiverId: z.string().min(1),
      endpoint: z.url(),
      p256dh: z.string().min(1).default("test-p256dh"),
      auth: z.string().min(1).default("test-auth"),
      platform: z
        .enum(["ios_pwa", "android_pwa", "desktop"])
        .default("desktop"),
      supportsDeclarative: z.boolean().default(false),
      revoked: z.boolean().optional(),
    })
    .optional(),
});

function isTestHarnessEnabled(): boolean {
  return (
    process.env.ENABLE_TEST_HARNESS === "true" &&
    process.env.NODE_ENV !== "production"
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!isTestHarnessEnabled()) {
    return problemResponse(404, "Not Found", "Not found.");
  }

  const parsed = await parseJsonBody(request, TestResetSchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  const repo = getCareRepository();
  const data = parsed.data;
  const action = data.action ?? "reset";

  if (action === "reset") {
    if (repo instanceof MemoryCareRepository) {
      await repo.resetStore();
    }
    resetPinRateLimiter();
    setMockNowIso(data.nowIso ?? data.clockIso ?? null);
  } else if (action === "setClock") {
    setMockNowIso(data.nowIso ?? data.clockIso ?? null);
  } else if (action === "seedHistory") {
    const now = getEffectiveNow();
    const settings = await repo.getSettings();
    const daysCount = data.days ?? 7;
    const todayKey = getManilaDateKey(now);

    for (let offset = daysCount; offset >= 1; offset -= 1) {
      const dateKey = addManilaDays(todayKey, -offset);
      const amDue = getSlotScheduledAt(
        dateKey,
        settings.amMealHour,
        settings.amMealMinute,
      );
      const pmDue = getSlotScheduledAt(
        dateKey,
        settings.pmMealHour,
        settings.pmMealMinute,
      );
      await repo.logFeedingAtomic({
        slotKey: makeSlotKey(dateKey, "AM"),
        serviceDate: dateKey,
        period: "AM",
        dueAtIso: amDue.toISOString(),
        completedById: "ate",
        completedAtIso: new Date(amDue.getTime() + 5 * 60_000).toISOString(),
      });
      await repo.logFeedingAtomic({
        slotKey: makeSlotKey(dateKey, "PM"),
        serviceDate: dateKey,
        period: "PM",
        dueAtIso: pmDue.toISOString(),
        completedById: offset % 2 === 0 ? "mom" : "ate",
        completedAtIso: new Date(pmDue.getTime() + 10 * 60_000).toISOString(),
      });
      if (offset % 2 === 1) {
        const cleanAt = getSlotScheduledAt(dateKey, 15, 0);
        await repo.logCareEvent({
          id: crypto.randomUUID(),
          eventType: "LITTER_CLEAN",
          caregiverId: "ate",
          occurredAtIso: cleanAt.toISOString(),
          isoWeekKey: getManilaIsoWeekKey(cleanAt),
          idempotencyKey: `seed-litter-${dateKey}`,
        });
      }
      if (offset <= 3) {
        const playAt = getSlotScheduledAt(dateKey, 16, 30);
        await repo.logCareEvent({
          id: crypto.randomUUID(),
          eventType: "OUT_OF_ROOM",
          caregiverId: "mom",
          occurredAtIso: playAt.toISOString(),
          isoWeekKey: getManilaIsoWeekKey(playAt),
          idempotencyKey: `seed-play-${dateKey}`,
        });
      }
    }
  } else if (action === "seedPushSub" && data.subscription) {
    const now = getEffectiveNow();
    await repo.upsertPushSubscription({
      caregiverId: data.subscription.caregiverId,
      endpoint: data.subscription.endpoint,
      p256dh: data.subscription.p256dh,
      auth: data.subscription.auth,
      platform: data.subscription.platform,
      supportsDeclarative: data.subscription.supportsDeclarative,
      lastSeenAtIso: now.toISOString(),
      lastSuccessAtIso: now.toISOString(),
    });
    if (data.subscription.revoked) {
      await repo.markPushSubscriptionRevoked(
        data.subscription.endpoint,
        now.toISOString(),
      );
    }
  }

  return NextResponse.json(
    {
      ok: true,
      action,
      nowIso: getEffectiveNow().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
