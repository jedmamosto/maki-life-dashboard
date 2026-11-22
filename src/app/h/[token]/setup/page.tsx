import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { verifyHouseholdToken } from "@/lib/auth";
import { buildHouseholdManifestUrl } from "@/lib/pwa-manifest";
import { getDashboardSnapshot } from "@/lib/dashboard-service";
import { AccessGate } from "@/components/AccessGate";
import { PhoneSetupWizard } from "@/components/PhoneSetupWizard";
import { SimplePageSkeleton } from "@/components/ViewSkeletons";
import { getRequestBaseUrl } from "@/components/server-origin";

interface SetupPageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  params,
  searchParams,
}: SetupPageProps): Promise<Metadata> {
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

export default function SetupPage({ params, searchParams }: SetupPageProps) {
  return (
    <Suspense fallback={<SimplePageSkeleton />}>
      <SetupLoader params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function SetupLoader({ params, searchParams }: SetupPageProps) {
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
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

  return (
    <PhoneSetupWizard
      token={token}
      initialSnapshot={snapshot}
      initialWhoSlug={whoSlug}
      vapidPublicKey={vapidPublicKey}
    />
  );
}
