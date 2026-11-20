import { NextResponse, type NextRequest } from "next/server";
import {
  HOUSEHOLD_COOKIE_NAME,
  createHouseholdSessionCookieValue,
  getHouseholdCookieOptions,
  verifyHouseholdToken,
} from "./lib/auth";
import { getEffectiveNow } from "./lib/dashboard-service";

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const match = /^\/h\/([^/]+)(?:\/.*)?$/.exec(pathname);

  if (!match) {
    return NextResponse.next();
  }

  let token = "";
  let valid = false;
  try {
    token = decodeURIComponent(match[1]);
    valid = await verifyHouseholdToken(token);
  } catch {
    valid = false;
  }
  const response = NextResponse.next();

  if (valid) {
    const cookieVal = await createHouseholdSessionCookieValue(
      token,
      getEffectiveNow(),
    );
    const opts = getHouseholdCookieOptions();
    response.cookies.set({
      name: opts.name,
      value: cookieVal,
      httpOnly: opts.httpOnly,
      sameSite: opts.sameSite,
      secure: opts.secure,
      path: opts.path,
      maxAge: opts.maxAge,
    });
  } else if (request.cookies.has(HOUSEHOLD_COOKIE_NAME)) {
    response.cookies.delete(HOUSEHOLD_COOKIE_NAME);
  }

  return response;
}

export const config = {
  matcher: ["/h/:path*"],
};
