import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCareRepository } from "@/db";
import {
  getAppBaseUrl,
  getDashboardSnapshot,
  getEffectiveNow,
} from "@/lib/dashboard-service";
import { resolveCaregiver } from "@/lib/domain";
import { getManilaIsoWeekKey } from "@/lib/timezone";
import { parseJsonBody, problemResponse, requireHouseholdAuth } from "../_shared";

const PlaySchema = z
  .object({
    caregiverId: z.string().min(1).optional(),
    actorId: z.string().min(1).optional(),
    eventType: z.enum(["OUT_OF_ROOM", "PLAY_SESSION"]).optional(),
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

  const parsed = await parseJsonBody(request, PlaySchema);
  if (!parsed.ok) {
    return parsed.response;
  }

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

  const now = getEffectiveNow();
  const result = await repo.logCareEvent({
    id: crypto.randomUUID(),
    eventType: parsed.data.eventType ?? "OUT_OF_ROOM",
    caregiverId: caregiver.id,
    occurredAtIso: now.toISOString(),
    isoWeekKey: getManilaIsoWeekKey(now),
    idempotencyKey: parsed.data.idempotencyKey ?? crypto.randomUUID(),
  });

  const snapshot = await getDashboardSnapshot(now, getAppBaseUrl(request.url));
  return NextResponse.json(
    {
      created: result.created,
      record: result.record,
      snapshot,
    },
    {
      status: result.created ? 201 : 200,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
