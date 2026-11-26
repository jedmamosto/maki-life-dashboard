import { NextResponse } from "next/server";
import { z } from "zod";
import { getCareRepository } from "@/db";
import { UI_COPY } from "@/lib/copy";
import {
  getAppBaseUrl,
  getDashboardSnapshot,
  getEffectiveNow,
} from "@/lib/dashboard-service";
import { rearmMealCheckin } from "@/lib/notifications";
import { getManilaDateKey } from "@/lib/timezone";
import { parseJsonBody, problemResponse, requireHouseholdAuth } from "@/app/api/_shared";

const UndoMealSchema = z.object({
  logId: z.string().min(1),
});

export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = await requireHouseholdAuth(request);
  if (unauthorized) {
    return unauthorized;
  }

  const parsed = await parseJsonBody(request, UndoMealSchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  const now = getEffectiveNow();
  const todayDateKey = getManilaDateKey(now);
  const repo = getCareRepository();

  const existing = await repo.getFeedingById(parsed.data.logId);
  if (!existing) {
    return problemResponse(
      404,
      "Not Found",
      "No active meal log found for this entry.",
    );
  }

  if (existing.serviceDate !== todayDateKey) {
    return problemResponse(
      422,
      "Prior Day Undo Disallowed",
      UI_COPY.meals.priorDayUndoError,
    );
  }

  const undone = await repo.undoFeedingById(existing.id, now.toISOString());
  if (!undone) {
    return problemResponse(
      404,
      "Not Found",
      "No active meal log found for this entry.",
    );
  }

  const [settings, remaining] = await Promise.all([
    repo.getSettings(),
    repo.listActiveFeedingsByDate(todayDateKey),
  ]);
  if (remaining.length < Math.max(1, settings.dailyMealGoal)) {
    await rearmMealCheckin(repo, todayDateKey);
  }

  const snapshot = await getDashboardSnapshot(now, getAppBaseUrl(request.url));

  return NextResponse.json(
    {
      ok: true,
      undone,
      snapshot,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
