import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { verifyHouseholdToken } from "@/lib/auth";
import { buildHouseholdManifestUrl } from "@/lib/pwa-manifest";
import {
  buildCareBoardPath,
  canAccessNavTab,
  findActiveCaregiverBySlug,
} from "@/lib/role-access";
import { getDashboardSnapshot, getOwnerHistory } from "@/lib/dashboard-service";
import { AccessGate } from "@/components/AccessGate";
import { OwnerDashboardView } from "@/components/OwnerDashboardView";
import { OwnerLoadingSkeleton } from "@/components/ViewSkeletons";
import { getRequestBaseUrl } from "@/components/server-origin";

interface OwnerPageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  params,
  searchParams,
}: OwnerPageProps): Promise<Metadata> {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const isValid = await verifyHouseholdToken(token);
  if (!isValid) {
    return {};
  }
  const whoSlug = typeof sp.who === "string" ? sp.who : null;
  return {
    manifest: buildHouseholdManifestUrl(token, whoSlug),
  };
}

export default function OwnerPage({ params, searchParams }: OwnerPageProps) {
  return (
    <Suspense fallback={<OwnerLoadingSkeleton />}>
      <OwnerLoader params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function OwnerLoader({ params, searchParams }: OwnerPageProps) {
  await connection();
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const isValid = await verifyHouseholdToken(token);

  if (!isValid) {
    return <AccessGate />;
  }

  const whoSlug = typeof sp.who === "string" ? sp.who : null;
  const baseUrl = await getRequestBaseUrl();
  const [snapshot, history] = await Promise.all([
    getDashboardSnapshot(undefined, baseUrl),
    getOwnerHistory(),
  ]);

  const whoCaregiver = findActiveCaregiverBySlug(snapshot.caregivers, whoSlug);
  if (whoCaregiver && !canAccessNavTab(whoCaregiver.role, "owner")) {
    redirect(buildCareBoardPath(token, whoCaregiver.slug));
  }

  return (
    <OwnerDashboardView
      token={token}
      initialSnapshot={snapshot}
      initialHistory={history}
      initialWhoSlug={whoSlug}
    />
  );
}
