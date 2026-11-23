import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCareRepository } from "@/db";
import { isOwnerPinCookieValid, verifyHouseholdToken } from "@/lib/auth";
import { buildHouseholdManifestUrl } from "@/lib/pwa-manifest";
import {
  buildCareBoardPath,
  canAccessNavTab,
  findActiveCaregiverBySlug,
} from "@/lib/role-access";
import { getDashboardSnapshot } from "@/lib/dashboard-service";
import { AccessGate } from "@/components/AccessGate";
import { OwnerSettingsShell } from "@/components/OwnerSettingsShell";
import { SimplePageSkeleton } from "@/components/ViewSkeletons";
import { getRequestBaseUrl } from "@/components/server-origin";

interface SettingsPageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  params,
  searchParams,
}: SettingsPageProps): Promise<Metadata> {
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

export default function SettingsPage({
  params,
  searchParams,
}: SettingsPageProps) {
  return (
    <Suspense fallback={<SimplePageSkeleton />}>
      <SettingsLoader params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function SettingsLoader({ params, searchParams }: SettingsPageProps) {
  await connection();
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const isValid = await verifyHouseholdToken(token);

  if (!isValid) {
    return <AccessGate />;
  }

  const whoSlug = typeof sp.who === "string" ? sp.who : null;
  const baseUrl = await getRequestBaseUrl();
  const unlocked = await isOwnerPinCookieValid();
  const snapshot = unlocked
    ? await getDashboardSnapshot(undefined, baseUrl)
    : null;

  let initialOwnerCaregiver = null;
  if (whoSlug) {
    const caregivers = snapshot
      ? snapshot.caregivers
      : await getCareRepository().listCaregivers();
    const whoCaregiver = findActiveCaregiverBySlug(caregivers, whoSlug);
    if (whoCaregiver && !canAccessNavTab(whoCaregiver.role, "settings")) {
      redirect(buildCareBoardPath(token, whoCaregiver.slug));
    }
    initialOwnerCaregiver = whoCaregiver;
  }

  return (
    <OwnerSettingsShell
      token={token}
      initialUnlocked={unlocked}
      initialSnapshot={snapshot}
      initialWhoSlug={whoSlug}
      initialOwnerCaregiver={initialOwnerCaregiver}
    />
  );
}
