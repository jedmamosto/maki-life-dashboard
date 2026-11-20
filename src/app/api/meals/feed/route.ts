import { NextResponse } from "next/server";
import { z } from "zod";
import { getCareRepository } from "@/db";
import { UI_COPY } from "@/lib/copy";
import {
  getAppBaseUrl,
  getDashboardSnapshot,
  getEffectiveNow,
} from "@/lib/dashboard-service";
import {
  makeSlotKey,
  parseSlotKey,
  resolveCaregiver,
} from "@/lib/domain";
import { markMealTiersSkipped } from "@/lib/notifications";
import {
  formatManilaTimeLabel,
  getManilaDateKey,
  getSlotScheduledAt,
  isWithinEarlyFeedWindow,
} from "@/lib/timezone";
import { parseJsonBody, problemResponse, requireHouseholdAuth } from "@/app/api/_shared";

const FeedMealSchema = z
  .object({
    period: z.enum(["AM", "PM"]).optional(),
    slotKey: z.string().min(1).optional(),
    serviceDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    caregiverId: z.string().min(1).optional(),
    actorId: z.string().min(1).optional(),
  })
  .refine((data) => Boolean(data.period || data.slotKey), {
    message: "Either period or slotKey is required.",
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
      "Invalid Service Date",
      "You can only log meals for today.",
    );
  }

  const actorKey = parsed.data.caregiverId ?? parsed.data.actorId ?? "";
  const caregiver = await resolveCaregiver(repo, actorKey);
  if (!caregiver || !caregiver.isActive) {
    return problemResponse(
      400,
      "Unknown Caregiver",
      "Caregiver could not be found.",
    );
  }

  const settings = await repo.getSettings();
  const hour = period === "AM" ? settings.amMealHour : settings.pmMealHour;
  const minute =
    period === "AM" ? settings.amMealMinute : settings.pmMealMinute;
  const scheduledAt = getSlotScheduledAt(serviceDate, hour, minute);

  if (!isWithinEarlyFeedWindow(now, scheduledAt, 90)) {
    return problemResponse(
      422,
      "Too Early",
      UI_COPY.meals.earlyWindowError(formatManilaTimeLabel(scheduledAt)),
    );
  }

  const slotKey = makeSlotKey(serviceDate, period);
  const result = await repo.logFeedingAtomic({
    slotKey,
    serviceDate,
    period,
    dueAtIso: scheduledAt.toISOString(),
    completedById: caregiver.id,
    completedAtIso: now.toISOString(),
  });

  if (!result.alreadyFed) {
    await markMealTiersSkipped(repo, slotKey, now.toISOString());
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
