import { NextResponse } from "next/server";
import { getCareRepository } from "@/db";
import {
  OWNER_PIN_COOKIE_NAME,
  checkAndRecordPinAttempt,
  createOwnerPinCookieValue,
  getOwnerPinCookieOptions,
  getPinRateLimitScope,
  isOwnerPinCookieValid,
  isPinLockedOut,
  verifyOwnerPinAgainstSettings,
} from "@/lib/auth";
import { UI_COPY } from "@/lib/copy";
import { getEffectiveNow } from "@/lib/dashboard-service";
import { problemResponse, requireHouseholdAuth } from "@/app/api/_shared";

export async function GET(request: Request): Promise<NextResponse> {
  const unauthorized = await requireHouseholdAuth(request);
  if (unauthorized) {
    return unauthorized;
  }

  const now = getEffectiveNow();
  const settings = await getCareRepository().getSettings();
  const unlocked = await isOwnerPinCookieValid(request, now);

  return NextResponse.json(
    {
      unlocked,
      hasPinConfigured: settings.ownerPinHash !== null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = await requireHouseholdAuth(request);
  if (unauthorized) {
    return unauthorized;
  }

  const now = getEffectiveNow();
  const nowMs = now.getTime();
  const scope = getPinRateLimitScope(request);

  if (isPinLockedOut(scope, nowMs)) {
    return problemResponse(429, "Too Many Requests", UI_COPY.ownerSettings.pinLocked);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return problemResponse(400, "Malformed PIN", UI_COPY.ownerSettings.pinMalformed);
  }

  const pin =
    body && typeof body === "object" && "pin" in body
      ? (body as { pin: unknown }).pin
      : null;

  if (typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
    return problemResponse(400, "Malformed PIN", UI_COPY.ownerSettings.pinMalformed);
  }

  const settings = await getCareRepository().getSettings();
  const valid = verifyOwnerPinAgainstSettings(pin, settings);
  const attempt = checkAndRecordPinAttempt(scope, valid, nowMs);

  if (attempt.locked) {
    return problemResponse(429, "Too Many Requests", UI_COPY.ownerSettings.pinLocked);
  }

  if (!valid) {
    return problemResponse(401, "Wrong PIN", UI_COPY.ownerSettings.pinWrong);
  }

  const cookieValue = createOwnerPinCookieValue(settings, now);
  const opts = getOwnerPinCookieOptions();
  const response = NextResponse.json(
    { unlocked: true },
    { headers: { "Cache-Control": "no-store" } },
  );
  response.cookies.set({
    name: opts.name,
    value: cookieValue,
    httpOnly: opts.httpOnly,
    sameSite: opts.sameSite,
    secure: opts.secure,
    path: opts.path,
    maxAge: opts.maxAge,
  });
  return response;
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const unauthorized = await requireHouseholdAuth(request);
  if (unauthorized) {
    return unauthorized;
  }

  const response = NextResponse.json(
    { unlocked: false },
    { headers: { "Cache-Control": "no-store" } },
  );
  response.cookies.set({
    name: OWNER_PIN_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
