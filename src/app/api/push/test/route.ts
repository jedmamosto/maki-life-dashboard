import { NextResponse } from "next/server";
import { z } from "zod";
import { getCareRepository } from "@/db";
import { buildHouseholdPushNavigate, getServerHouseholdPath } from "@/lib/auth";
import { PUSH_TEMPLATES } from "@/lib/copy";
import { getAppBaseUrl, getEffectiveNow } from "@/lib/dashboard-service";
import { resolveCaregiver } from "@/lib/domain";
import { sendPushToSubscriptions } from "@/lib/notifications";
import { parseJsonBody, problemResponse, requireHouseholdAuth } from "@/app/api/_shared";

const TestPushSchema = z.object({
  caregiverId: z.string().min(1).optional(),
  actorId: z.string().min(1).optional(),
  endpoint: z.string().min(1).optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = await requireHouseholdAuth(request);
  if (unauthorized) {
    return unauthorized;
  }

  const parsed = await parseJsonBody(request, TestPushSchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  const repo = getCareRepository();
  const allActive = await repo.listActivePushSubscriptions();
  const actorKey = parsed.data.caregiverId ?? parsed.data.actorId;

  let targets = allActive;
  let targetName = "Household";

  if (actorKey) {
    const caregiver = await resolveCaregiver(repo, actorKey);
    if (!caregiver) {
      return problemResponse(
        400,
        "Unknown Caregiver",
        "Caregiver could not be found.",
      );
    }
    targetName = caregiver.displayName;
    targets = targets.filter((s) => s.caregiverId === caregiver.id);
  }

  if (parsed.data.endpoint) {
    targets = targets.filter((s) => s.endpoint === parsed.data.endpoint);
  }

  const settings = await repo.getSettings();
  const householdPath = getServerHouseholdPath(settings);
  const tmpl = PUSH_TEMPLATES.testPing(targetName);
  const now = getEffectiveNow();
  const result = await sendPushToSubscriptions({
    repo,
    subscriptions: targets,
    title: tmpl.title,
    body: tmpl.body,
    navigate: buildHouseholdPushNavigate(
      getAppBaseUrl(request.url),
      householdPath,
    ),
    urgency: "high",
    TTL: 1800,
    now,
  });

  return NextResponse.json(
    {
      ok: true,
      ...result,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
