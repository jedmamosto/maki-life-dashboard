import { NextResponse } from "next/server";
import { z } from "zod";
import { getCareRepository } from "@/db";
import { UI_COPY } from "@/lib/copy";
import {
  getAppBaseUrl,
  getDashboardSnapshot,
  getEffectiveNow,
} from "@/lib/dashboard-service";
import { makeSlotKey, parseSlotKey } from "@/lib/domain";
import { rearmMealTiers } from "@/lib/notifications";
import { getManilaDateKey } from "@/lib/timezone";
import { parseJsonBody, problemResponse, requireHouseholdAuth } from "@/app/api/_shared";

const UndoMealSchema = z
  .object({
    slotKey: z.string().min(1).optional(),
    period: z.enum(["AM", "PM"]).optional(),
    serviceDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .refine((data) => Boolean(data.slotKey || data.period), {
    message: "Either slotKey or period is required.",
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

  let serviceDate = parsed.data.serviceDate ?? todayDateKey;
  let period = parsed.data.period;

  if (parsed.data.slotKey) {
    const slot = parseSlotKey(parsed.data.slotKey);
    if (!slot) {
      return problemResponse(400, "Invalid Slot Key", "Invalid meal slot key.");
    }
    serviceDate = slot.serviceDate;
    period = slot.period;
  }

  if (!period) {
    return problemResponse(400, "Invalid Period", "Meal period is required.");
  }

  if (serviceDate !== todayDateKey) {
    return problemResponse(
      422,
      "Prior Day Undo Disallowed",
      UI_COPY.meals.priorDayUndoError,
    );
  }

  const repo = getCareRepository();
  const slotKey = makeSlotKey(serviceDate, period);
  const undone = await repo.undoFeedingBySlot(slotKey, now.toISOString());
  if (!undone) {
    return problemResponse(
      404,
      "Not Found",
      "No active meal log found for this slot.",
    );
  }

  await rearmMealTiers(repo, slotKey);
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
