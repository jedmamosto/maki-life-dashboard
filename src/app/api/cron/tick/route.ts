import { NextResponse } from "next/server";
import { getCareRepository } from "@/db";
import { verifyQstashRequest } from "@/lib/auth";
import { getAppBaseUrl, getEffectiveNow } from "@/lib/dashboard-service";
import { runCronEscalations } from "@/lib/notifications";
import { problemResponse } from "@/app/api/_shared";

export async function POST(request: Request): Promise<NextResponse> {
  const rawBody = await request.text();
  const signature = request.headers.get("upstash-signature") ?? "";
  const baseUrl = getAppBaseUrl(request.url);
  const verifyUrl = process.env.QSTASH_VERIFY_URL ?? `${baseUrl}/api/cron/tick`;

  const verified = await verifyQstashRequest({
    signature,
    body: rawBody,
    url: verifyUrl,
  });

  if (!verified) {
    return problemResponse(
      401,
      "Unauthorized",
      "Invalid or missing QStash signature.",
    );
  }

  const result = await runCronEscalations({
    repo: getCareRepository(),
    now: getEffectiveNow(),
    baseUrl,
  });

  return NextResponse.json(
    {
      ok: true,
      ...result,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
