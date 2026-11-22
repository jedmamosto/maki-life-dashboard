import { NextResponse, type NextRequest } from "next/server";
import { verifyHouseholdToken } from "@/lib/auth";
import { buildHouseholdManifest } from "@/lib/pwa-manifest";

interface RouteContext {
  params: Promise<{ token: string }>;
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { token } = await context.params;
  const isValid = await verifyHouseholdToken(token);

  if (!isValid) {
    return new NextResponse(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const who = request.nextUrl.searchParams.get("who");
  const manifest = buildHouseholdManifest(token, who);

  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}
