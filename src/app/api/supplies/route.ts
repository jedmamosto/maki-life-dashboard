import { NextResponse } from "next/server";
import { z } from "zod";
import { getCareRepository } from "@/db";
import { buildHouseholdPushNavigate, getServerHouseholdPath } from "@/lib/auth";
import { PUSH_TEMPLATES, UI_COPY } from "@/lib/copy";
import {
  getAppBaseUrl,
  getDashboardSnapshot,
  getEffectiveNow,
} from "@/lib/dashboard-service";
import { resolveCaregiver } from "@/lib/domain";
import { sendPushToRoles } from "@/lib/notifications";
import { parseJsonBody, problemResponse, requireHouseholdAuth } from "../_shared";

const UpdateSupplySchema = z
  .object({
    supplyKey: z.enum(["CAT_FOOD", "CAT_LITTER"]),
    level: z.enum(["FULL", "HALF", "LOW", "EMPTY"]),
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

  const parsed = await parseJsonBody(request, UpdateSupplySchema);
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
  const result = await repo.upsertSupplyAtomic({
    supplyKey: parsed.data.supplyKey,
    level: parsed.data.level,
    updatedById: caregiver.id,
    updatedAtIso: now.toISOString(),
  });

  const baseUrl = getAppBaseUrl(request.url);
  if (result.shouldAlertLevel !== null) {
    const settings = await repo.getSettings();
    const householdPath = getServerHouseholdPath(settings);
    const itemLabel = UI_COPY.supplies.itemName(parsed.data.supplyKey);
    const tmpl = PUSH_TEMPLATES.supplyOwnerAlert(
      itemLabel,
      result.shouldAlertLevel,
    );
    await sendPushToRoles({
      repo,
      roles: ["owner"],
      title: tmpl.title,
      body: tmpl.body,
      navigate: buildHouseholdPushNavigate(baseUrl, householdPath, "/owner"),
      urgency: "high",
      TTL: 1800,
      now,
    });
  }

  const snapshot = await getDashboardSnapshot(now, baseUrl);
  return NextResponse.json(
    {
      record: result.record,
      alertedLevel: result.shouldAlertLevel,
      snapshot,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
