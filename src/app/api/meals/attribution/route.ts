import { NextResponse } from "next/server";
import { z } from "zod";
import { getCareRepository } from "@/db";
import {
  getAppBaseUrl,
  getDashboardSnapshot,
  getEffectiveNow,
} from "@/lib/dashboard-service";
import { parseSlotKey, resolveCaregiver } from "@/lib/domain";
import { parseJsonBody, problemResponse, requireHouseholdAuth } from "@/app/api/_shared";

const AttributionSchema = z
  .object({
    slotKey: z.string().min(1),
    caregiverId: z.string().min(1).optional(),
    actorId: z.string().min(1).optional(),
  })
  .refine((data) => Boolean(data.caregiverId || data.actorId), {
    message: "Either caregiverId or actorId is required.",
  });

export async function PATCH(request: Request): Promise<NextResponse> {
  const unauthorized = await requireHouseholdAuth(request);
  if (unauthorized) {
    return unauthorized;
  }

  const parsed = await parseJsonBody(request, AttributionSchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  const slot = parseSlotKey(parsed.data.slotKey);
  if (!slot) {
    return problemResponse(400, "Invalid Slot Key", "Invalid meal slot key.");
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

  const updated = await repo.updateFeedingAttribution(
    parsed.data.slotKey,
    caregiver.id,
  );
  if (!updated) {
    return problemResponse(
      404,
      "Not Found",
      "No active meal log found for this slot.",
    );
  }

  const snapshot = await getDashboardSnapshot(
    getEffectiveNow(),
    getAppBaseUrl(request.url),
  );
  return NextResponse.json(
    {
      ok: true,
      record: updated,
      completedBy: caregiver,
      snapshot,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
