import { NextResponse } from "next/server";
import {
  getAppBaseUrl,
  getDashboardSnapshot,
  getEffectiveNow,
} from "@/lib/dashboard-service";
import { requireHouseholdAuth } from "../_shared";

export async function GET(request: Request): Promise<NextResponse> {
  const unauthorized = await requireHouseholdAuth(request);
  if (unauthorized) {
    return unauthorized;
  }

  const snapshot = await getDashboardSnapshot(
    getEffectiveNow(),
    getAppBaseUrl(request.url),
  );
  return NextResponse.json(snapshot, {
    headers: { "Cache-Control": "no-store" },
  });
}
