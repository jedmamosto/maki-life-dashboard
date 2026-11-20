import { Suspense } from "react";
import { connection } from "next/server";
import { isOwnerPinCookieValid, verifyHouseholdToken } from "@/lib/auth";
import { getDashboardSnapshot } from "@/lib/dashboard-service";
import { AccessGate } from "@/components/AccessGate";
import { OwnerSettingsShell } from "@/components/OwnerSettingsShell";
import { SimplePageSkeleton } from "@/components/ViewSkeletons";
import { getRequestBaseUrl } from "@/components/server-origin";

interface SettingsPageProps {
  params: Promise<{ token: string }>;
}

export default function SettingsPage({ params }: SettingsPageProps) {
  return (
    <Suspense fallback={<SimplePageSkeleton />}>
      <SettingsLoader params={params} />
    </Suspense>
  );
}

async function SettingsLoader({ params }: SettingsPageProps) {
  await connection();
  const { token } = await params;
  const isValid = await verifyHouseholdToken(token);

  if (!isValid) {
    return <AccessGate />;
  }

  const baseUrl = await getRequestBaseUrl();
  const unlocked = await isOwnerPinCookieValid();
  const snapshot = unlocked
    ? await getDashboardSnapshot(undefined, baseUrl)
    : null;

  return (
    <OwnerSettingsShell
      token={token}
      initialUnlocked={unlocked}
      initialSnapshot={snapshot}
    />
  );
}
