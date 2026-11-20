import { Suspense } from "react";
import { connection } from "next/server";
import { verifyHouseholdToken } from "@/lib/auth";
import { getDashboardSnapshot } from "@/lib/dashboard-service";
import { AccessGate } from "@/components/AccessGate";
import { CareQuestBoard } from "@/components/CareQuestBoard";
import { BoardLoadingSkeleton } from "@/components/ViewSkeletons";
import { getRequestBaseUrl } from "@/components/server-origin";

interface HouseholdPageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default function HouseholdBoardPage({
  params,
  searchParams,
}: HouseholdPageProps) {
  return (
    <Suspense fallback={<BoardLoadingSkeleton />}>
      <HouseholdBoardLoader params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function HouseholdBoardLoader({
  params,
  searchParams,
}: HouseholdPageProps) {
  await connection();
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const isValid = await verifyHouseholdToken(token);

  if (!isValid) {
    return <AccessGate />;
  }

  const rawWho = sp.who;
  const whoSlug = typeof rawWho === "string" ? rawWho : null;
  const baseUrl = await getRequestBaseUrl();
  const snapshot = await getDashboardSnapshot(undefined, baseUrl);

  return (
    <CareQuestBoard
      token={token}
      initialSnapshot={snapshot}
      initialWhoSlug={whoSlug}
    />
  );
}
