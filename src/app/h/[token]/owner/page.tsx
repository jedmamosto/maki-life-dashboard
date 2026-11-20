import { Suspense } from "react";
import { connection } from "next/server";
import { verifyHouseholdToken } from "@/lib/auth";
import { getDashboardSnapshot, getOwnerHistory } from "@/lib/dashboard-service";
import { AccessGate } from "@/components/AccessGate";
import { OwnerDashboardView } from "@/components/OwnerDashboardView";
import { OwnerLoadingSkeleton } from "@/components/ViewSkeletons";
import { getRequestBaseUrl } from "@/components/server-origin";

interface OwnerPageProps {
  params: Promise<{ token: string }>;
}

export default function OwnerPage({ params }: OwnerPageProps) {
  return (
    <Suspense fallback={<OwnerLoadingSkeleton />}>
      <OwnerLoader params={params} />
    </Suspense>
  );
}

async function OwnerLoader({ params }: OwnerPageProps) {
  await connection();
  const { token } = await params;
  const isValid = await verifyHouseholdToken(token);

  if (!isValid) {
    return <AccessGate />;
  }

  const baseUrl = await getRequestBaseUrl();
  const [snapshot, history] = await Promise.all([
    getDashboardSnapshot(undefined, baseUrl),
    getOwnerHistory(),
  ]);

  return (
    <OwnerDashboardView
      token={token}
      initialSnapshot={snapshot}
      initialHistory={history}
    />
  );
}
