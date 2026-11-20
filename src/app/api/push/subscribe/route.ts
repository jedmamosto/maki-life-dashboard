import { NextResponse } from "next/server";
import { z } from "zod";
import { getCareRepository } from "@/db";
import {
  getAppBaseUrl,
  getDashboardSnapshot,
  getEffectiveNow,
} from "@/lib/dashboard-service";
import { resolveCaregiver } from "@/lib/domain";
import { parseJsonBody, problemResponse, requireHouseholdAuth } from "@/app/api/_shared";

const SubscribeSchema = z
  .object({
    caregiverId: z.string().min(1).optional(),
    actorId: z.string().min(1).optional(),
    endpoint: z.url(),
    p256dh: z.string().min(1).optional(),
    auth: z.string().min(1).optional(),
    keys: z
      .object({
        p256dh: z.string().min(1),
        auth: z.string().min(1),
      })
      .optional(),
    platform: z
      .enum(["ios_pwa", "android_pwa", "desktop"])
      .default("desktop"),
    supportsDeclarative: z.boolean().default(false),
  })
  .refine((data) => Boolean(data.caregiverId || data.actorId), {
    message: "Either caregiverId or actorId is required.",
  })
  .refine(
    (data) =>
      Boolean(
        (data.p256dh && data.auth) ||
          (data.keys?.p256dh && data.keys?.auth),
      ),
    {
      message: "Push subscription keys (p256dh, auth) are required.",
    },
  );

export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = await requireHouseholdAuth(request);
  if (unauthorized) {
    return unauthorized;
  }

  const parsed = await parseJsonBody(request, SubscribeSchema);
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
  const p256dh = parsed.data.p256dh ?? parsed.data.keys?.p256dh ?? "";
  const auth = parsed.data.auth ?? parsed.data.keys?.auth ?? "";

  const subscription = await repo.upsertPushSubscription({
    caregiverId: caregiver.id,
    endpoint: parsed.data.endpoint,
    p256dh,
    auth,
    platform: parsed.data.platform,
    supportsDeclarative: parsed.data.supportsDeclarative,
    lastSeenAtIso: now.toISOString(),
    lastSuccessAtIso: null,
  });

  if (caregiver.role === "helper") {
    await repo.clearDispatchesWithPrefix("push-health:helper-zero");
  }

  const snapshot = await getDashboardSnapshot(now, getAppBaseUrl(request.url));
  return NextResponse.json(
    {
      ok: true,
      subscription,
      snapshot,
    },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
