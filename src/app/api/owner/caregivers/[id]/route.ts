import { NextResponse } from "next/server";
import { getCareRepository } from "@/db";
import { isOwnerPinCookieValid } from "@/lib/auth";
import {
  getAppBaseUrl,
  getDashboardSnapshot,
  getEffectiveNow,
} from "@/lib/dashboard-service";
import { UI_COPY } from "@/lib/copy";
import { problemResponse, requireHouseholdAuth } from "@/app/api/_shared";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const unauthorized = await requireHouseholdAuth(request);
  if (unauthorized) {
    return unauthorized;
  }

  const now = getEffectiveNow();
  const pinValid = await isOwnerPinCookieValid(request, now);
  if (!pinValid) {
    return problemResponse(
      403,
      "Forbidden",
      "Owner 4-digit PIN is required to change settings.",
    );
  }

  const { id } = await context.params;
  const cleanId = decodeURIComponent(id).trim();
  if (!cleanId) {
    return problemResponse(400, "Bad Request", "Missing person id.");
  }

  const repo = getCareRepository();
  const result = await repo.deleteCaregiverIfUnused(cleanId);

  if (!result.deleted) {
    switch (result.reason) {
      case "not_found":
        return problemResponse(404, "Not Found", "Person not found.");
      case "last_owner":
        return problemResponse(
          400,
          "Bad Request",
          UI_COPY.ownerSettings.lastOwnerError,
        );
      case "has_history":
        return problemResponse(
          409,
          "Conflict",
          UI_COPY.ownerSettings.hasHistoryError,
        );
    }
  }

  const snapshot = await getDashboardSnapshot(now, getAppBaseUrl(request.url));
  return NextResponse.json(
    { ok: true, deleted: true, snapshot },
    { headers: { "Cache-Control": "no-store" } },
  );
}
