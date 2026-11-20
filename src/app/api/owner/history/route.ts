import { NextResponse } from "next/server";
import { getEffectiveNow, getOwnerHistory } from "@/lib/dashboard-service";
import { requireHouseholdAuth } from "@/app/api/_shared";

export async function GET(request: Request): Promise<NextResponse> {
  const unauthorized = await requireHouseholdAuth(request);
  if (unauthorized) {
    return unauthorized;
  }

  const history = await getOwnerHistory(getEffectiveNow());
  return NextResponse.json(history, {
    headers: { "Cache-Control": "no-store" },
  });
}
