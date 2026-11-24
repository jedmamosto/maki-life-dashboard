import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCareRepository } from "@/db";
import {
  createHouseholdSessionCookieValue,
  createOwnerPinCookieValue,
  getHouseholdCookieOptions,
  getOwnerPinCookieOptions,
  hashPin,
  isOwnerPinCookieValid,
  sha256Hex,
} from "@/lib/auth";
import {
  getAppBaseUrl,
  getDashboardSnapshot,
  getEffectiveNow,
} from "@/lib/dashboard-service";
import { buildSettingsView } from "@/lib/domain";
import { UI_COPY } from "@/lib/copy";
import type { HouseholdSettingsRecord } from "@/lib/types";
import { parseJsonBody, problemResponse, requireHouseholdAuth } from "@/app/api/_shared";

const TimeStringSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Time must be HH:MM (24-hour).");

const CaregiverUpdateSchema = z.object({
  id: z.string().trim().min(1).max(40),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers, or dashes.")
    .min(1)
    .max(32),
  displayName: z.string().trim().min(1).max(32),
  role: z.enum(["helper", "family", "owner"]),
  avatarInitials: z.string().trim().min(1).max(4),
  avatarColor: z.enum(["helper", "mom", "dad", "sibling", "owner"]),
  isActive: z.boolean(),
});

const UpdateSettingsSchema = z.object({
  amMealHour: z.number().int().min(0).max(23).optional(),
  amMealMinute: z.number().int().min(0).max(59).optional(),
  midMealHour: z.number().int().min(0).max(23).optional(),
  midMealMinute: z.number().int().min(0).max(59).optional(),
  pmMealHour: z.number().int().min(0).max(23).optional(),
  pmMealMinute: z.number().int().min(0).max(59).optional(),
  amMealTime: TimeStringSchema.optional(),
  midMealTime: TimeStringSchema.optional(),
  pmMealTime: TimeStringSchema.optional(),
  litterIntervalHours: z.number().int().min(12).max(168).optional(),
  weeklyPlayGoal: z.number().int().min(1).max(14).optional(),
  ownerEmail: z.union([z.literal(""), z.email()]).optional(),
  newPin: z
    .string()
    .regex(/^\d{4}$/, "Enter exactly 4 numbers.")
    .optional(),
  rotateHouseholdToken: z.boolean().optional(),
  rotateToken: z.boolean().optional(),
  caregivers: z.array(CaregiverUpdateSchema).optional(),
});

function parseTimeString(value: string): { hour: number; minute: number } {
  const [h, m] = value.split(":");
  return { hour: Number(h), minute: Number(m) };
}

export async function PATCH(request: Request): Promise<NextResponse> {
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

  const parsed = await parseJsonBody(request, UpdateSettingsSchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  const repo = getCareRepository();
  const data = parsed.data;

  if (data.caregivers) {
    const existing = await repo.listCaregivers();
    const mergedById = new Map(existing.map((c) => [c.id, c]));
    const normalizedUpdates = data.caregivers.map((cg) => ({
      ...cg,
      avatarInitials: cg.avatarInitials.toUpperCase(),
    }));
    for (const cg of normalizedUpdates) {
      mergedById.set(cg.id, cg);
    }

    const resultingRoster = Array.from(mergedById.values());
    const seenSlugs = new Set<string>();
    for (const cg of resultingRoster) {
      const normalizedSlug = cg.slug.toLowerCase();
      if (seenSlugs.has(normalizedSlug)) {
        return problemResponse(
          400,
          "Bad Request",
          UI_COPY.ownerSettings.duplicateSlugError,
        );
      }
      seenSlugs.add(normalizedSlug);
    }

    const activeOwners = resultingRoster.filter(
      (c) => c.role === "owner" && c.isActive,
    );
    if (activeOwners.length === 0) {
      return problemResponse(
        400,
        "Bad Request",
        UI_COPY.ownerSettings.lastOwnerError,
      );
    }

    for (const cg of normalizedUpdates) {
      await repo.upsertCaregiver(cg);
    }
  }

  const patch: Partial<Omit<HouseholdSettingsRecord, "id">> = {
    updatedAtIso: now.toISOString(),
  };

  if (data.amMealTime) {
    const t = parseTimeString(data.amMealTime);
    patch.amMealHour = t.hour;
    patch.amMealMinute = t.minute;
  } else {
    if (data.amMealHour !== undefined) patch.amMealHour = data.amMealHour;
    if (data.amMealMinute !== undefined) patch.amMealMinute = data.amMealMinute;
  }

  if (data.midMealTime) {
    const t = parseTimeString(data.midMealTime);
    patch.midMealHour = t.hour;
    patch.midMealMinute = t.minute;
  } else {
    if (data.midMealHour !== undefined) patch.midMealHour = data.midMealHour;
    if (data.midMealMinute !== undefined) patch.midMealMinute = data.midMealMinute;
  }

  if (data.pmMealTime) {
    const t = parseTimeString(data.pmMealTime);
    patch.pmMealHour = t.hour;
    patch.pmMealMinute = t.minute;
  } else {
    if (data.pmMealHour !== undefined) patch.pmMealHour = data.pmMealHour;
    if (data.pmMealMinute !== undefined) patch.pmMealMinute = data.pmMealMinute;
  }

  if (data.litterIntervalHours !== undefined) {
    patch.litterIntervalHours = data.litterIntervalHours;
  }
  if (data.weeklyPlayGoal !== undefined) {
    patch.weeklyPlayGoal = data.weeklyPlayGoal;
  }
  if (data.ownerEmail !== undefined) {
    patch.ownerEmail = data.ownerEmail;
  }
  if (data.newPin !== undefined) {
    patch.ownerPinHash = hashPin(data.newPin);
  }

  let newHouseholdToken: string | undefined;
  if (data.rotateHouseholdToken || data.rotateToken) {
    newHouseholdToken = crypto.randomBytes(24).toString("base64url");
    patch.activeTokenHash = sha256Hex(newHouseholdToken);
  }

  const updated = await repo.updateSettings(patch);
  const snapshot = await getDashboardSnapshot(now, getAppBaseUrl(request.url));

  const response = NextResponse.json(
    {
      ok: true,
      settings: buildSettingsView(updated),
      snapshot,
      ...(newHouseholdToken
        ? {
            newHouseholdToken,
            newToken: newHouseholdToken,
            rotatedToken: newHouseholdToken,
          }
        : {}),
    },
    { headers: { "Cache-Control": "no-store" } },
  );

  if (newHouseholdToken) {
    const sessionVal = await createHouseholdSessionCookieValue(
      newHouseholdToken,
      now,
    );
    const hOpts = getHouseholdCookieOptions();
    response.cookies.set({
      name: hOpts.name,
      value: sessionVal,
      httpOnly: hOpts.httpOnly,
      sameSite: hOpts.sameSite,
      secure: hOpts.secure,
      path: hOpts.path,
      maxAge: hOpts.maxAge,
    });
  }

  if (data.newPin !== undefined) {
    const pinVal = createOwnerPinCookieValue(updated, now);
    const pOpts = getOwnerPinCookieOptions();
    response.cookies.set({
      name: pOpts.name,
      value: pinVal,
      httpOnly: pOpts.httpOnly,
      sameSite: pOpts.sameSite,
      secure: pOpts.secure,
      path: pOpts.path,
      maxAge: pOpts.maxAge,
    });
  }

  return response;
}
