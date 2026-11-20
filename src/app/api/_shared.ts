import { NextResponse } from "next/server";
import { z } from "zod";
import { isHouseholdRequestAuthorized } from "@/lib/auth";
import { UI_COPY } from "@/lib/copy";
import { getEffectiveNow } from "@/lib/dashboard-service";

export function problemResponse(
  status: number,
  title: string,
  detail: string,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json(
    {
      type: `https://maki-care.local/problems/${status}`,
      title,
      status,
      detail,
      error: detail,
      ...extra,
    },
    {
      status,
      headers: {
        "Content-Type": "application/problem+json",
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function requireHouseholdAuth(
  request: Request,
): Promise<NextResponse | null> {
  const ok = await isHouseholdRequestAuthorized(request, getEffectiveNow());
  if (!ok) {
    return problemResponse(401, "Unauthorized", UI_COPY.accessGate.body);
  }
  return null;
}

export async function parseJsonBody<TSchema extends z.ZodTypeAny>(
  request: Request,
  schema: TSchema,
): Promise<
  | { ok: true; data: z.infer<TSchema> }
  | { ok: false; response: NextResponse }
> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      ok: false,
      response: problemResponse(
        400,
        "Invalid JSON",
        "Request body must be valid JSON.",
      ),
    };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return {
      ok: false,
      response: problemResponse(
        400,
        "Validation Failed",
        firstIssue?.message ?? "Invalid request payload.",
      ),
    };
  }
  return { ok: true, data: parsed.data };
}
