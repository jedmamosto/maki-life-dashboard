import { NextResponse } from "next/server";
import { getCareRepository } from "@/db";
import { getEffectiveNow } from "@/lib/dashboard-service";

export async function GET(): Promise<NextResponse> {
  try {
    const settings = await getCareRepository().getSettings();
    return NextResponse.json(
      {
        ok: true,
        status: "healthy",
        timezone: settings.householdTimezone,
        timestamp: getEffectiveNow().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        ok: false,
        status: "unhealthy",
        error: "Service unavailable",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
