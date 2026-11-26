import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCareRepository } from "@/db";
import {
  getAppBaseUrl,
  getDashboardSnapshot,
  getEffectiveNow,
} from "@/lib/dashboard-service";
import { makeMealLogSlotKey, resolveCaregiver } from "@/lib/domain";
import { markMealCheckinSkipped } from "@/lib/notifications";
import { getManilaDateKey } from "@/lib/timezone";
import { parseJsonBody, problemResponse, requireHouseholdAuth } from "@/app/api/_shared";

const FeedMealSchema = z
  .object({
    caregiverId: z.string().min(1).optional(),
    actorId: z.string().min(1).optional(),
    idempotencyKey: z.string().min(1).optional(),
  })
  .refine((data) => Boolean(data.caregiverId || data.actorId), {
    message: "Either caregiverId or actorId is required.",
  });

export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = await requireHouseholdAuth(request);
  if (unauthorized) {
    return unauthorized;
  }

  const parsed = await parseJsonBody(request, FeedMealSchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  const now = getEffectiveNow();
  const todayDateKey = getManilaDateKey(now);
  const repo = getCareRepository();

  const actorKey = parsed.data.caregiverId ?? parsed.data.actorId ?? "";
  const caregiver = await resolveCaregiver(repo, actorKey);
  if (!caregiver || !caregiver.isActive) {
    return problemResponse(
      400,
      "Unknown Caregiver",
      "Caregiver could not be found.",
    );
  }

  const idempotencyKey = parsed.data.idempotencyKey ?? crypto.randomUUID();
  const slotKey = makeMealLogSlotKey(todayDateKey, idempotencyKey);
  const nowIso = now.toISOString();

  const result = await repo.logFeedingAtomic({
    slotKey,
    serviceDate: todayDateKey,
    period: "COUNT",
    dueAtIso: nowIso,
    completedById: caregiver.id,
    completedAtIso: nowIso,
  });

  if (!result.alreadyFed) {
    const [settings, todayFeedings] = await Promise.all([
      repo.getSettings(),
      repo.listActiveFeedingsByDate(todayDateKey),
    ]);
    if (todayFeedings.length >= Math.max(1, settings.dailyMealGoal)) {
      await markMealCheckinSkipped(repo, todayDateKey, nowIso);
    }
  }

  const snapshot = await getDashboardSnapshot(now, getAppBaseUrl(request.url));
  return NextResponse.json(
    {
      alreadyFed: result.alreadyFed,
      record: result.record,
      completedBy: result.completedBy,
      snapshot,
    },
    {
      status: result.alreadyFed ? 200 : 201,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
