"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { MakiCatIcon } from "./MakiCatIcon";
import {
  AlertCircle,
  Bell,
  BellRing,
  Check,
  CheckCircle2,
  Copy,
  Loader2,
  Smartphone,
} from "lucide-react";
import type {
  Caregiver,
  DashboardSnapshot,
  PushPlatform,
} from "@/lib/types";
import { UI_COPY } from "@/lib/copy";
import { buildHouseholdManifestUrl } from "@/lib/pwa-manifest";
import { buildCareBoardPath, canAccessNavTab } from "@/lib/role-access";
import { AppHeader } from "./AppHeader";
import { CaregiverBadge } from "./CaregiverBadge";
import { SimplePageSkeleton } from "./ViewSkeletons";
import {
  CareApiError,
  apiFetch,
  copyTextSafely,
  detectClientPlatform,
  ensureHouseholdSession,
  findValidCaregiver,
  isStandaloneDisplayMode,
  urlBase64ToUint8Array,
  useClientOrigin,
  useIsHydrated,
  useStoredCaregiverSlug,
  writeStoredCaregiverSlug,
} from "./care-client";

const subscribeNoop = () => () => {};

interface PhoneSetupWizardProps {
  token: string;
  initialSnapshot: DashboardSnapshot;
  initialWhoSlug: string | null;
  vapidPublicKey: string;
}

export function PhoneSetupWizard({
  token,
  initialSnapshot,
  initialWhoSlug,
  vapidPublicKey,
}: PhoneSetupWizardProps) {
  const router = useRouter();
  const activeCaregivers = initialSnapshot.caregivers.filter((c) => c.isActive);
  const origin = useClientOrigin();
  const isHydrated = useIsHydrated();
  const storedSlug = useStoredCaregiverSlug(token);

  const detectedPlatform = useSyncExternalStore<PushPlatform>(
    subscribeNoop,
    detectClientPlatform,
    () => "desktop"
  );
  const isStandalone = useSyncExternalStore(
    subscribeNoop,
    isStandaloneDisplayMode,
    () => false
  );

  const [pickedCaregiverId, setPickedCaregiverId] = useState<string | null>(
    () => {
      const fromQuery = findValidCaregiver(activeCaregivers, initialWhoSlug);
      return fromQuery ? fromQuery.id : null;
    }
  );

  const [manualGuidePlatform, setManualGuidePlatform] = useState<
    "ios" | "android" | null
  >(null);
  const guidePlatform =
    manualGuidePlatform ??
    (detectedPlatform === "android_pwa" ? "android" : "ios");

  const [linkCopied, setLinkCopied] = useState(false);
  const [showLinkFallback, setShowLinkFallback] = useState(false);
  const [alertsActive, setAlertsActive] = useState(false);
  const [currentEndpoint, setCurrentEndpoint] = useState<string | null>(null);
  const [subscribing, setSubscribing] = useState(false);
  const [testingPing, setTestingPing] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [testSuccess, setTestSuccess] = useState<string | null>(null);

  const viewerCaregiver =
    findValidCaregiver(activeCaregivers, initialWhoSlug) ??
    findValidCaregiver(activeCaregivers, storedSlug);
  const isRestricted =
    isHydrated &&
    viewerCaregiver !== null &&
    !canAccessNavTab(viewerCaregiver.role, "setup");

  const selectedMember: Caregiver | undefined =
    findValidCaregiver(activeCaregivers, pickedCaregiverId) ??
    findValidCaregiver(activeCaregivers, initialWhoSlug) ??
    findValidCaregiver(activeCaregivers, storedSlug) ??
    activeCaregivers.find((c) => c.role === "helper") ??
    activeCaregivers[0];

  useEffect(() => {
    if (isRestricted && viewerCaregiver) {
      router.replace(buildCareBoardPath(token, viewerCaregiver.slug));
      return;
    }

    void ensureHouseholdSession(token).catch(() => {
      // Handled when API request runs
    });

    if (initialWhoSlug) {
      const fromQuery = findValidCaregiver(
        initialSnapshot.caregivers,
        initialWhoSlug
      );
      if (fromQuery && canAccessNavTab(fromQuery.role, "setup")) {
        writeStoredCaregiverSlug(token, fromQuery.slug);
      }
    }

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker
        .getRegistration("/")
        .then(async (reg) => {
          const sub = await reg?.pushManager?.getSubscription();
          if (sub) {
            setAlertsActive(true);
            setCurrentEndpoint(sub.endpoint);
          }
        })
        .catch(() => {
          // Ignore serviceWorker query error on unsupported browsers
        });
    }
  }, [
    token,
    initialWhoSlug,
    initialSnapshot.caregivers,
    isRestricted,
    viewerCaregiver,
    router,
  ]);

  useEffect(() => {
    const manifestLink = document.querySelector<HTMLLinkElement>(
      'link[rel="manifest"]'
    );
    if (manifestLink) {
      manifestLink.href = buildHouseholdManifestUrl(
        token,
        selectedMember?.slug ?? null
      );
    }
  }, [token, selectedMember?.slug]);

  const personalPath = selectedMember
    ? `/h/${encodeURIComponent(token)}?who=${encodeURIComponent(selectedMember.slug)}`
    : `/h/${encodeURIComponent(token)}`;
  const personalUrl = origin ? `${origin}${personalPath}` : personalPath;

  const handleSelectPerson = (person: Caregiver) => {
    setPickedCaregiverId(person.id);
    setLinkCopied(false);
    setTestSuccess(null);
  };

  const handleCopyPersonalLink = async () => {
    const ok = await copyTextSafely(personalUrl);
    if (ok) {
      setShowLinkFallback(false);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 3000);
    } else {
      setShowLinkFallback(true);
    }
  };

  const handleEnableAlerts = async () => {
    if (!selectedMember || subscribing) {
      return;
    }

    setSubscribing(true);
    setPushError(null);
    setTestSuccess(null);

    try {
      if (navigator.storage?.persist) {
        await navigator.storage.persist().catch(() => false);
      }

      if (
        typeof window === "undefined" ||
        !("Notification" in window) ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window)
      ) {
        setPushError(
          "This browser cannot run phone alerts. Open Maki Care from the Home Screen icon in Safari or Chrome."
        );
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushError(UI_COPY.setupView.alertsBlockedText);
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
      });
      await navigator.serviceWorker.ready;

      if (!vapidPublicKey.trim()) {
        setPushError(
          "Push alerts key is not set on this server yet. Ask Jed to check server settings."
        );
        return;
      }

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey.trim()),
        });
      }

      const json = subscription.toJSON();
      const p256dh = json.keys?.p256dh;
      const auth = json.keys?.auth;
      if (!subscription.endpoint || !p256dh || !auth) {
        setPushError(
          "Could not read push keys from this phone. Try closing and reopening the app."
        );
        return;
      }

      const supportsDeclarative =
        "pushManager" in window || "PushManager" in window;

      await apiFetch<{ ok?: boolean }>(token, "/api/push/subscribe", {
        method: "POST",
        body: JSON.stringify({
          caregiverId: selectedMember.id,
          endpoint: subscription.endpoint,
          keys: { p256dh, auth },
          platform: detectedPlatform,
          supportsDeclarative,
        }),
      });

      setCurrentEndpoint(subscription.endpoint);
      setAlertsActive(true);
    } catch (err) {
      setPushError(
        err instanceof CareApiError
          ? err.message
          : "Could not turn on alerts on this phone. Check internet and try again."
      );
    } finally {
      setSubscribing(false);
    }
  };

  const handleSendTestPing = async () => {
    if (!selectedMember || testingPing) {
      return;
    }

    setTestingPing(true);
    setPushError(null);
    setTestSuccess(null);

    try {
      await apiFetch<{ ok?: boolean }>(token, "/api/push/test", {
        method: "POST",
        body: JSON.stringify({
          caregiverId: selectedMember.id,
          endpoint: currentEndpoint ?? undefined,
        }),
      });
      setTestSuccess(UI_COPY.setupView.testPassedText);
    } catch (err) {
      setPushError(
        err instanceof CareApiError
          ? err.message
          : UI_COPY.syncStates.offlineBody
      );
    } finally {
      setTestingPing(false);
    }
  };

  if (isRestricted) {
    return <SimplePageSkeleton />;
  }

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] pb-12">
      <AppHeader
        token={token}
        activeTab="setup"
        manilaDateLabel={initialSnapshot.manilaDateLabel}
        manilaTimeLabel={initialSnapshot.manilaTimeLabel}
        activeCaregiver={viewerCaregiver}
        maxWidthClass="max-w-2xl"
      />

      <main className="mx-auto max-w-2xl space-y-5 px-4 pt-5">
        <header className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-[20px] border border-[var(--brand-border)] bg-[var(--brand-bg)] sunlit-card p-4">
          <div className="shrink-0 rounded-[14px] border border-[var(--border-hairline)] bg-white p-1 sunlit-polaroid -rotate-1">
            <Image
              src="/maki/maki-suitcase.jpg"
              alt="Maki sitting inside an open purple suitcase"
              width={224}
              height={192}
              preload={true}
              className="h-24 w-full sm:w-28 rounded-[10px] object-cover object-[50%_38%]"
            />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-extrabold tracking-[-0.02em] text-[var(--ink-primary)]">
              {UI_COPY.setupView.title}
            </h1>
            <p className="mt-1 text-sm sm:text-base text-[var(--ink-secondary)]">
              {UI_COPY.setupView.subtitle}
            </p>
          </div>
        </header>

        {/* Member Selector */}
        <section
          aria-label={UI_COPY.setupView.personLabel}
          className="rounded-[var(--radius-card)] border border-[var(--border-hairline)] bg-[var(--bg-card)] p-4"
        >
          <p className="text-xs font-semibold text-[var(--ink-secondary)]">
            {UI_COPY.setupView.personLabel}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {activeCaregivers.map((person) => {
              const isSelected = person.id === selectedMember?.id;
              return (
                <button
                  key={person.id}
                  type="button"
                  onClick={() => handleSelectPerson(person)}
                  aria-pressed={isSelected}
                  data-testid={`setup-member-${person.slug}`}
                  className={`inline-flex min-h-[44px] items-center gap-2 rounded-full border pl-1.5 pr-3.5 text-sm font-bold kitchen-transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)] ${
                    isSelected
                      ? "border-[var(--sage-text)] bg-[var(--sage-bg)] text-[var(--sage-strong)]"
                      : "border-[var(--border-control)] bg-[var(--bg-canvas)] text-[var(--ink-primary)] hover:bg-[var(--bg-subtle)]"
                  }`}
                >
                  <CaregiverBadge
                    initials={person.avatarInitials}
                    colorKey={person.avatarColor}
                    size="sm"
                  />
                  <span>{person.displayName}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Step 1: Open Personal Link */}
        <section
          aria-label={UI_COPY.setupView.step1Title}
          className="rounded-[16px] border border-[var(--border-hairline)] bg-[var(--bg-card)] p-4 sm:p-5 space-y-3"
        >
          <h2 className="font-display text-lg font-bold text-[var(--ink-primary)]">
            {UI_COPY.setupView.step1Title}
          </h2>
          <p className="text-sm text-[var(--ink-secondary)]">
            {UI_COPY.setupView.step1Body(
              selectedMember?.displayName ?? "Caregiver"
            )}
          </p>

          <input
            type="text"
            readOnly
            value={personalUrl}
            aria-label={UI_COPY.setupView.step1Title}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded-[12px] border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2.5 text-xs sm:text-sm font-medium text-[var(--ink-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)]"
          />

          {showLinkFallback ? (
            <p className="text-xs font-semibold text-[var(--amber-strong)]">
              {UI_COPY.ownerView.clipboardFallbackNote}
            </p>
          ) : null}

          <button
            type="button"
            onClick={() => void handleCopyPersonalLink()}
            data-testid="copy-personal-link-cta"
            className={`inline-flex min-h-[56px] w-full items-center justify-center gap-2 rounded-[12px] px-4 font-display text-base font-bold kitchen-transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
              linkCopied
                ? "bg-[var(--sage-text)] text-white focus-visible:ring-[var(--ring-focus)]"
                : "border border-[var(--border-control)] bg-[var(--bg-subtle)] text-[var(--ink-primary)] hover:bg-[var(--border-hairline)] focus-visible:ring-[var(--ring-focus)]"
            }`}
          >
            {linkCopied ? (
              <>
                <Check className="h-5 w-5" aria-hidden="true" />
                <span>{UI_COPY.setupView.copiedLinkCta}</span>
              </>
            ) : (
              <>
                <Copy className="h-5 w-5" aria-hidden="true" />
                <span>{UI_COPY.setupView.copyLinkCta}</span>
              </>
            )}
          </button>
        </section>

        {/* Step 2: Add to Home Screen */}
        <section
          aria-label={UI_COPY.setupView.step2Title}
          className="rounded-[16px] border border-[var(--border-hairline)] bg-[var(--bg-card)] p-4 sm:p-5 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[var(--brand-border)] bg-[var(--brand-bg)]"
              >
                <MakiCatIcon className="h-6 w-6" />
              </span>
              <h2 className="font-display text-lg font-bold text-[var(--ink-primary)]">
                {UI_COPY.setupView.step2Title}
              </h2>
            </div>
            <div className="flex gap-1 rounded-[12px] border border-[var(--border-hairline)] bg-[var(--bg-track)] p-1">
              <button
                type="button"
                onClick={() => setManualGuidePlatform("ios")}
                aria-pressed={guidePlatform === "ios"}
                className={`min-h-[44px] rounded-[8px] border px-3 text-xs font-bold kitchen-transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)] ${
                  guidePlatform === "ios"
                    ? "border-[var(--sage-border)] bg-[var(--bg-card)] text-[var(--sage-strong)] shadow-[var(--shadow-pill)]"
                    : "border-transparent text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
                }`}
              >
                iPhone / Safari
              </button>
              <button
                type="button"
                onClick={() => setManualGuidePlatform("android")}
                aria-pressed={guidePlatform === "android"}
                className={`min-h-[44px] rounded-[8px] border px-3 text-xs font-bold kitchen-transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)] ${
                  guidePlatform === "android"
                    ? "border-[var(--sage-border)] bg-[var(--bg-card)] text-[var(--sage-strong)] shadow-[var(--shadow-pill)]"
                    : "border-transparent text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
                }`}
              >
                Android / Chrome
              </button>
            </div>
          </div>

          <ol className="space-y-2 text-sm text-[var(--ink-primary)] list-decimal list-inside">
            {guidePlatform === "ios" ? (
              <>
                <li>{UI_COPY.setupView.iosStepA}</li>
                <li>{UI_COPY.setupView.iosStepB}</li>
                <li>{UI_COPY.setupView.iosStepC}</li>
              </>
            ) : (
              <>
                <li>{UI_COPY.setupView.androidStepA}</li>
                <li>{UI_COPY.setupView.androidStepB}</li>
                <li>{UI_COPY.setupView.androidStepC}</li>
              </>
            )}
          </ol>

          <div
            data-testid="standalone-status-badge"
            className={`flex items-center gap-2 rounded-[12px] border px-3.5 py-2.5 text-sm font-semibold ${
              isStandalone
                ? "border-[var(--sage-border)] bg-[var(--sage-bg)] text-[var(--sage-strong)]"
                : "border-[var(--amber-border)] bg-[var(--amber-bg)] text-[var(--amber-strong)]"
            }`}
          >
            {isStandalone ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <Smartphone className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <span>
              {isStandalone
                ? UI_COPY.setupView.standaloneReady
                : UI_COPY.setupView.standaloneWaiting}
            </span>
          </div>
        </section>

        {/* Step 3: Turn On Phone Alerts */}
        <section
          aria-label={UI_COPY.setupView.step3Title}
          className="rounded-[16px] border border-[var(--border-hairline)] bg-[var(--bg-card)] p-4 sm:p-5 space-y-3"
        >
          <h2 className="font-display text-lg font-bold text-[var(--ink-primary)]">
            {UI_COPY.setupView.step3Title}
          </h2>
          <p className="text-sm text-[var(--ink-secondary)]">
            {UI_COPY.setupView.step3Body}
          </p>

          {alertsActive ? (
            <div className="flex items-center gap-2 rounded-[12px] border border-[var(--sage-border)] bg-[var(--sage-bg)] px-3.5 py-2.5 text-sm font-semibold text-[var(--sage-strong)]">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{UI_COPY.setupView.alertsActiveText}</span>
            </div>
          ) : null}

          {pushError ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-[12px] border border-[var(--coral-border)] bg-[var(--coral-bg)] p-3 text-sm font-medium text-[var(--coral-strong)]"
            >
              <AlertCircle
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              <span>{pushError}</span>
            </div>
          ) : null}

          <button
            type="button"
            disabled={subscribing}
            onClick={() => void handleEnableAlerts()}
            data-testid="allow-alerts-cta"
            className="inline-flex min-h-[56px] w-full items-center justify-center gap-2 rounded-[12px] bg-[var(--brand-primary)] px-4 font-display text-base font-bold text-[var(--brand-on-primary)] hover:bg-[var(--brand-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)] focus-visible:ring-offset-2 disabled:opacity-65 kitchen-transition"
          >
            {subscribing ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            ) : (
              <Bell className="h-5 w-5" aria-hidden="true" />
            )}
            <span>{UI_COPY.setupView.allowAlertsCta}</span>
          </button>
        </section>

        {/* Step 4: Send a Test Ping */}
        <section
          aria-label={UI_COPY.setupView.step4Title}
          className="rounded-[16px] border border-[var(--border-hairline)] bg-[var(--bg-card)] p-4 sm:p-5 space-y-3"
        >
          <h2 className="font-display text-lg font-bold text-[var(--ink-primary)]">
            {UI_COPY.setupView.step4Title}
          </h2>
          <p className="text-sm text-[var(--ink-secondary)]">
            {UI_COPY.setupView.step4Body}
          </p>

          {testSuccess ? (
            <div
              role="status"
              className="flex items-center gap-2 rounded-[12px] border border-[var(--sage-border)] bg-[var(--sage-bg)] px-3.5 py-2.5 text-sm font-semibold text-[var(--sage-strong)]"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{testSuccess}</span>
            </div>
          ) : null}

          <button
            type="button"
            disabled={testingPing}
            onClick={() => void handleSendTestPing()}
            data-testid="send-test-ping-cta"
            className="inline-flex min-h-[56px] w-full items-center justify-center gap-2 rounded-[12px] border border-[var(--border-control)] bg-[var(--bg-subtle)] px-4 font-display text-base font-bold text-[var(--ink-primary)] hover:bg-[var(--border-hairline)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)] disabled:opacity-65 kitchen-transition"
          >
            {testingPing ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            ) : (
              <BellRing className="h-5 w-5" aria-hidden="true" />
            )}
            <span>{UI_COPY.setupView.sendTestCta}</span>
          </button>
        </section>
      </main>
    </div>
  );
}
