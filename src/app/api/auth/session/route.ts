import { NextResponse } from "next/server";
import { z } from "zod";
import {
  HOUSEHOLD_COOKIE_NAME,
  createHouseholdSessionCookieValue,
  getHouseholdCookieOptions,
  verifyHouseholdToken,
} from "@/lib/auth";
import { UI_COPY } from "@/lib/copy";
import { getEffectiveNow } from "@/lib/dashboard-service";
import { parseJsonBody, problemResponse } from "@/app/api/_shared";

const SessionSchema = z.object({
  token: z.string().min(1, "Household token is required."),
});

export async function POST(request: Request): Promise<NextResponse> {
  const parsed = await parseJsonBody(request, SessionSchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  const valid = await verifyHouseholdToken(parsed.data.token);
  if (!valid) {
    return problemResponse(401, "Unauthorized", UI_COPY.accessGate.body);
  }

  const cookieValue = await createHouseholdSessionCookieValue(
    parsed.data.token,
    getEffectiveNow(),
  );
  const opts = getHouseholdCookieOptions();
  const response = NextResponse.json(
    { ok: true },
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

export async function DELETE(): Promise<NextResponse> {
  const response = NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
  response.cookies.set({
    name: HOUSEHOLD_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
