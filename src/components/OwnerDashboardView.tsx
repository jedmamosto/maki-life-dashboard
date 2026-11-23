"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  BellOff,
  BellRing,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Footprints,
  Loader2,
  Minus,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  X,
} from "lucide-react";
import type {
  DashboardSnapshot,
  DayComplianceCell,
  EscalationStage,
  OwnerHistoryResponse,
  PushHealthDevice,
  PushPlatform,
} from "@/lib/types";
import { UI_COPY, buildMessengerNudgeText } from "@/lib/copy";
import { buildCareBoardPath, canAccessNavTab } from "@/lib/role-access";
import { AppHeader } from "./AppHeader";
import { CaregiverBadge } from "./CaregiverBadge";
import { OwnerLoadingSkeleton } from "./ViewSkeletons";
import {
  CareApiError,
  apiFetch,
  copyTextSafely,
  ensureHouseholdSession,
  findValidCaregiver,
  useClientOrigin,
  useIsHydrated,
  useStoredCaregiverSlug,
  writeStoredCaregiverSlug,
} from "./care-client";

interface OwnerDashboardViewProps {
  token: string;
  initialSnapshot: DashboardSnapshot;
  initialHistory: OwnerHistoryResponse;
  initialWhoSlug?: string | null;
}

const ESCALATION_STEPS: Array<{
  stage: Exclude<EscalationStage, "NONE">;
  timeTag: string;
  label: string;
}> = [
  { stage: "T0_HELPER", timeTag: "T+0m", label: "Helper Alert" },
  { stage: "T20_HELPER", timeTag: "T+20m", label: "Helper Check" },
  { stage: "T45_FAMILY_OWNER", timeTag: "T+45m", label: "Family + Owner" },
  { stage: "T120_OWNER", timeTag: "T+120m", label: "Owner Urgent" },
];

const STAGE_ORDER: Record<EscalationStage, number> = {
  NONE: 0,
  T0_HELPER: 1,
  T20_HELPER: 2,
  T45_FAMILY_OWNER: 3,
  T120_OWNER: 4,
};

function formatManilaClockAt(date: Date): {
  dateLabel: string;
  timeLabel: string;
} {
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
  const timeLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
  return { dateLabel, timeLabel };
}

function formatLocalClockAt(date: Date): {
  dateLabel: string;
  timeLabel: string;
  tzLabel: string;
} {
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
  const timeLabel = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
  const tzParts = new Intl.DateTimeFormat("en-US", {
    timeZoneName: "short",
  }).formatToParts(date);
  const tzLabel =
    tzParts.find((part) => part.type === "timeZoneName")?.value ?? "Local";
  return { dateLabel, timeLabel, tzLabel };
}

function formatPlatformLabel(platform: PushPlatform | null): string {
  switch (platform) {
    case "ios_pwa":
      return "iPhone Home Screen";
    case "android_pwa":
      return "Android Chrome";
    case "desktop":
      return "Desktop Browser";
    default:
      return "No Device Yet";
  }
}

function renderMatrixBadge(
  status:
    | DayComplianceCell["amStatus"]
    | DayComplianceCell["pmStatus"]
    | DayComplianceCell["litterStatus"]
) {
  switch (status) {
    case "ON_TIME":
    case "DONE":
      return {
        cls: "border-[var(--sage-border)] bg-[var(--sage-bg)] text-[var(--sage-strong)]",
        icon: <Check className="h-3.5 w-3.5" aria-hidden="true" />,
        label: status === "DONE" ? "Done" : "On time",
      };
    case "LATE":
      return {
        cls: "border-[var(--amber-border)] bg-[var(--amber-bg)] text-[var(--amber-strong)]",
        icon: <Clock className="h-3.5 w-3.5" aria-hidden="true" />,
        label: "Late",
      };
    case "MISSED":
      return {
        cls: "border-[var(--coral-border)] bg-[var(--coral-bg)] text-[var(--coral-strong)]",
        icon: <X className="h-3.5 w-3.5" aria-hidden="true" />,
        label: "Missed",
      };
    case "UPCOMING":
    case "NOT_DUE":
    default:
      return {
        cls: "border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-[var(--ink-tertiary)]",
        icon: <Minus className="h-3.5 w-3.5" aria-hidden="true" />,
        label: status === "NOT_DUE" ? "Not due" : "Upcoming",
      };
  }
}

export function OwnerDashboardView({
  token,
  initialSnapshot,
  initialHistory,
  initialWhoSlug,
}: OwnerDashboardViewProps) {
  const router = useRouter();
  const origin = useClientOrigin();
  const isHydrated = useIsHydrated();
  const storedSlug = useStoredCaregiverSlug(token);
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>(initialSnapshot);
  const [history, setHistory] = useState<OwnerHistoryResponse>(initialHistory);
  const [tickOffsetMs, setTickOffsetMs] = useState(0);
  const [localClock, setLocalClock] = useState<{
    dateLabel: string;
    timeLabel: string;
    tzLabel: string;
  } | null>(null);
  const [nudgeCopied, setNudgeCopied] = useState(false);
  const [clipboardFallback, setClipboardFallback] = useState(false);
  const [mobileWindow, setMobileWindow] = useState<"last7" | "prev7">("last7");
  const [selectedDateKey, setSelectedDateKey] = useState<string>(
    () => initialHistory.days[initialHistory.days.length - 1]?.dateKey ?? ""
  );
  const [refreshing, setRefreshing] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [testingCaregiverId, setTestingCaregiverId] = useState<string | null>(
    null
  );
  const [pushTestStatus, setPushTestStatus] = useState<
    Record<string, { ok: boolean; text: string }>
  >({});

  const fallbackTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const viewerCaregiver =
    findValidCaregiver(snapshot.caregivers, initialWhoSlug) ??
    findValidCaregiver(snapshot.caregivers, storedSlug);
  const isRestricted =
    isHydrated &&
    viewerCaregiver !== null &&
    !canAccessNavTab(viewerCaregiver.role, "owner");

  useEffect(() => {
    if (isRestricted && viewerCaregiver) {
      router.replace(buildCareBoardPath(token, viewerCaregiver.slug));
      return;
    }

    if (initialWhoSlug) {
      const fromQuery = findValidCaregiver(
        initialSnapshot.caregivers,
        initialWhoSlug
      );
      if (fromQuery && canAccessNavTab(fromQuery.role, "owner")) {
        writeStoredCaregiverSlug(token, fromQuery.slug);
      }
    }

    void ensureHouseholdSession(token).catch(() => {
      // Surface if follow-up action fails
    });
  }, [
    token,
    initialWhoSlug,
    initialSnapshot.caregivers,
    isRestricted,
    viewerCaregiver,
    router,
  ]);

  useEffect(() => {
    const parsed = Date.parse(snapshot.manilaNowIso);
    const baseMs = Number.isFinite(parsed) ? parsed : Date.now();
    const mountPerfMs = performance.now();

    const syncClocks = () => {
      const elapsed = Math.max(0, performance.now() - mountPerfMs);
      const anchored = new Date(baseMs + elapsed);
      setTickOffsetMs(elapsed);
      setLocalClock(formatLocalClockAt(anchored));
    };

    const initialTimer = setTimeout(syncClocks, 0);
    const interval = setInterval(syncClocks, 15000);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [snapshot.manilaNowIso]);

  const manilaClock = (() => {
    if (tickOffsetMs === 0) {
      return {
        dateLabel: snapshot.manilaDateLabel,
        timeLabel: snapshot.manilaTimeLabel,
      };
    }
    const parsed = Date.parse(snapshot.manilaNowIso);
    if (!Number.isFinite(parsed)) {
      return {
        dateLabel: snapshot.manilaDateLabel,
        timeLabel: snapshot.manilaTimeLabel,
      };
    }
    return formatManilaClockAt(new Date(parsed + tickOffsetMs));
  })();

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setErrorBanner(null);
    try {
      const [freshSnapshot, freshHistory] = await Promise.all([
        apiFetch<DashboardSnapshot>(token, "/api/dashboard", { method: "GET" }),
        apiFetch<OwnerHistoryResponse>(token, "/api/owner/history", {
          method: "GET",
        }),
      ]);
      setSnapshot(freshSnapshot);
      setHistory(freshHistory);
    } catch (err) {
      setErrorBanner(
        err instanceof CareApiError
          ? err.message
          : UI_COPY.syncStates.offlineBody
      );
    } finally {
      setRefreshing(false);
    }
  }, [token]);

  const dashboardUrl = origin
    ? `${origin}/h/${encodeURIComponent(token)}`
    : `/h/${encodeURIComponent(token)}`;

  const nudgeText = buildMessengerNudgeText({
    taskSummary: snapshot.survivability.subtext,
    dashboardUrl,
  });

  const handleCopyNudge = async () => {
    const ok = await copyTextSafely(nudgeText);
    if (ok) {
      setClipboardFallback(false);
      setNudgeCopied(true);
      setTimeout(() => setNudgeCopied(false), 3000);
    } else {
      setClipboardFallback(true);
      setTimeout(() => {
        fallbackTextareaRef.current?.focus();
        fallbackTextareaRef.current?.select();
      }, 20);
    }
  };

  const handleSendTestAlert = async (device: PushHealthDevice) => {
    if (testingCaregiverId) {
      return;
    }
    setTestingCaregiverId(device.caregiverId);
    try {
      await apiFetch<{ ok?: boolean }>(token, "/api/push/test", {
        method: "POST",
        body: JSON.stringify({ caregiverId: device.caregiverId }),
      });
      setPushTestStatus((prev) => ({
        ...prev,
        [device.caregiverId]: {
          ok: true,
          text: UI_COPY.setupView.testPassedText,
        },
      }));
    } catch (err) {
      setPushTestStatus((prev) => ({
        ...prev,
        [device.caregiverId]: {
          ok: false,
          text:
            err instanceof CareApiError
              ? err.message
              : UI_COPY.syncStates.offlineBody,
        },
      }));
    } finally {
      setTestingCaregiverId(null);
    }
  };

  const splitIdx = Math.max(0, history.days.length - 7);

  const getColumnDisplayClass = (index: number): string => {
    if (history.days.length <= 7) {
      return "table-cell";
    }
    const inLast7 = index >= splitIdx;
    const isVisibleMobile =
      mobileWindow === "last7" ? inLast7 : !inLast7;
    return isVisibleMobile ? "table-cell" : "hidden md:table-cell";
  };

  const selectedDay =
    history.days.find((d) => d.dateKey === selectedDateKey) ??
    history.days[history.days.length - 1] ??
    null;

  const activeStageNum = STAGE_ORDER[snapshot.escalationStage];

  const survivabilityBannerStyle = (() => {
    switch (snapshot.survivability.status) {
      case "SAFE":
        return "border-[var(--sage-border)] bg-[var(--sage-bg)] text-[var(--sage-strong)]";
      case "ATTENTION":
        return "border-[var(--amber-border)] bg-[var(--amber-bg)] text-[var(--amber-strong)]";
      case "OVERDUE":
      default:
        return "border-[var(--coral-border)] bg-[var(--coral-bg)] text-[var(--coral-strong)]";
    }
  })();

  if (isRestricted) {
    return <OwnerLoadingSkeleton />;
  }

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] pb-12">
      <AppHeader
        token={token}
        activeTab="owner"
        manilaDateLabel={manilaClock.dateLabel}
        manilaTimeLabel={manilaClock.timeLabel}
        activeCaregiver={viewerCaregiver}
        maxWidthClass="max-w-4xl"
      />

      <main className="mx-auto max-w-4xl space-y-5 px-4 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-extrabold tracking-[-0.02em] text-[var(--ink-primary)]">
              {UI_COPY.ownerView.title}
            </h1>
            <p className="text-sm text-[var(--ink-secondary)]">
              {snapshot.survivability.subtext}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={refreshing}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-[12px] border border-[var(--border-control)] bg-[var(--bg-card)] px-4 text-sm font-semibold text-[var(--ink-primary)] hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sage-text)] disabled:opacity-60"
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            <span>{UI_COPY.syncStates.refreshCta}</span>
          </button>
        </div>

        {errorBanner ? (
          <div
            role="alert"
            className="rounded-[16px] border border-[var(--coral-border)] bg-[var(--coral-bg)] p-4 text-sm text-[var(--coral-strong)]"
          >
            <p className="font-bold">{UI_COPY.syncStates.offlineTitle}</p>
            <p className="mt-1 text-[var(--ink-primary)]">{errorBanner}</p>
            <button
              type="button"
              onClick={() => void handleRefresh()}
              className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-[12px] bg-[var(--coral-text)] px-4 text-sm font-bold text-white"
            >
              {UI_COPY.syncStates.tryAgainCta}
            </button>
          </div>
        ) : null}

        {/* Dual-Clock Survivability Banner + 4-Stage Escalation Strip */}
        <section
          aria-label="Dual Clock Survivability"
          className="rounded-[16px] border border-[var(--border-hairline)] bg-[var(--bg-card)] p-4 sm:p-5 space-y-4"
        >
          <div
            className={`flex flex-wrap items-center justify-between gap-3 rounded-[12px] border px-4 py-3 ${survivabilityBannerStyle}`}
          >
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="font-display text-lg font-bold">
                {snapshot.survivability.headline}
              </span>
            </div>
            <span className="rounded-full border border-current/25 bg-white px-3 py-1 text-xs font-bold tabular-nums">
              {snapshot.survivability.completedCoreCount} of{" "}
              {snapshot.survivability.totalCoreCount}{" "}
              {UI_COPY.survivability.coreLabelSuffix}
            </span>
          </div>

          <div
            data-testid="dual-clock-grid"
            className="grid grid-cols-1 sm:grid-cols-2 gap-3"
          >
            <div className="rounded-[12px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3.5">
              <div className="text-xs font-bold uppercase tracking-wide text-[var(--ink-tertiary)]">
                {UI_COPY.ownerView.houseTimeLabel}
              </div>
              <div className="mt-1 font-display text-xl font-extrabold text-[var(--ink-primary)] tabular-nums">
                {manilaClock.timeLabel}
              </div>
              <div className="text-xs font-medium text-[var(--ink-secondary)] tabular-nums">
                {manilaClock.dateLabel} • Asia/Manila
              </div>
            </div>

            <div className="rounded-[12px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3.5">
              <div className="text-xs font-bold uppercase tracking-wide text-[var(--ink-tertiary)]">
                {UI_COPY.ownerView.localTimeLabel}
              </div>
              <div className="mt-1 font-display text-xl font-extrabold text-[var(--ink-primary)] tabular-nums">
                {localClock ? localClock.timeLabel : "--:--"}
              </div>
              <div className="text-xs font-medium text-[var(--ink-secondary)] tabular-nums">
                {localClock
                  ? `${localClock.dateLabel} • ${localClock.tzLabel}`
                  : "Checking browser clock..."}
              </div>
            </div>
          </div>

          <div data-testid="escalation-progress-strip">
            <div className="flex items-center justify-between gap-2 mb-2">
              <h2 className="font-display text-sm font-bold text-[var(--ink-primary)]">
                {UI_COPY.ownerView.escalationLabel}
              </h2>
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${
                  activeStageNum === 0
                    ? "border-[var(--sage-border)] bg-[var(--sage-bg)] text-[var(--sage-strong)]"
                    : activeStageNum >= 3
                      ? "border-[var(--coral-border)] bg-[var(--coral-bg)] text-[var(--coral-strong)]"
                      : "border-[var(--amber-border)] bg-[var(--amber-bg)] text-[var(--amber-strong)]"
                }`}
              >
                {activeStageNum === 0 ? "Quiet / On Track" : "Escalation Active"}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {ESCALATION_STEPS.map((step, index) => {
                const stepNumber = index + 1;
                const isReached = activeStageNum >= stepNumber;
                const isUrgent = isReached && stepNumber >= 3;
                return (
                  <div
                    key={step.stage}
                    className={`rounded-[12px] border px-3 py-2.5 ${
                      isUrgent
                        ? "border-[var(--coral-border)] bg-[var(--coral-bg)] text-[var(--coral-strong)]"
                        : isReached
                          ? "border-[var(--amber-border)] bg-[var(--amber-bg)] text-[var(--amber-strong)]"
                          : "border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-[var(--ink-tertiary)]"
                    }`}
                  >
                    <div className="text-[11px] font-bold tabular-nums">
                      {step.timeTag}
                    </div>
                    <div className="mt-0.5 text-xs font-semibold">
                      {step.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Copy Messenger Nudge Card */}
        <section
          aria-label={UI_COPY.ownerView.nudgeCardTitle}
          data-testid="messenger-nudge-card"
          className="rounded-[16px] border border-[var(--indigo-border)] bg-[var(--indigo-bg)] p-4 sm:p-5 space-y-3"
        >
          <h2 className="font-display text-lg font-bold text-[var(--indigo-strong)]">
            {UI_COPY.ownerView.nudgeCardTitle}
          </h2>
          <p className="rounded-[12px] border border-[var(--indigo-border)] bg-white p-3 text-sm text-[var(--ink-primary)] break-words">
            {nudgeText}
          </p>

          {clipboardFallback ? (
            <div className="space-y-2">
              <textarea
                ref={fallbackTextareaRef}
                readOnly
                rows={3}
                value={nudgeText}
                data-testid="nudge-fallback-textarea"
                aria-label={UI_COPY.ownerView.nudgeCardTitle}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full rounded-[12px] border border-[var(--indigo-text)] bg-white p-3 text-sm text-[var(--ink-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--indigo-text)]"
              />
              <p className="text-xs font-semibold text-[var(--indigo-strong)]">
                {UI_COPY.ownerView.clipboardFallbackNote}
              </p>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => void handleCopyNudge()}
            data-testid="copy-messenger-nudge-cta"
            className={`inline-flex min-h-[56px] w-full items-center justify-center gap-2 rounded-[12px] px-4 font-display text-base font-bold text-white kitchen-transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
              nudgeCopied
                ? "bg-[var(--sage-text)] focus-visible:ring-[var(--sage-text)]"
                : "bg-[var(--indigo-text)] hover:bg-[var(--indigo-strong)] focus-visible:ring-[var(--indigo-text)]"
            }`}
          >
            {nudgeCopied ? (
              <>
                <Check className="h-5 w-5" aria-hidden="true" />
                <span>{UI_COPY.ownerView.copiedNudgeCta}</span>
              </>
            ) : (
              <>
                <Copy className="h-5 w-5" aria-hidden="true" />
                <span>{UI_COPY.ownerView.copyNudgeCta}</span>
              </>
            )}
          </button>
        </section>

        {/* Today's Care Timeline */}
        <section
          aria-label={UI_COPY.ownerView.timelineTitle}
          data-testid="today-care-timeline"
          className="rounded-[16px] border border-[var(--border-hairline)] bg-[var(--bg-card)] p-4 sm:p-5"
        >
          <h2 className="font-display text-lg font-bold text-[var(--ink-primary)]">
            {UI_COPY.ownerView.timelineTitle}
          </h2>
          {history.todayTimeline.length === 0 ? (
            <p className="mt-3 rounded-[12px] bg-[var(--bg-subtle)] p-3 text-sm text-[var(--ink-secondary)]">
              No care actions logged today yet.
            </p>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {history.todayTimeline.map((item) => {
                const badgeTone = (() => {
                  switch (item.tone) {
                    case "sage":
                      return "border-[var(--sage-border)] bg-[var(--sage-bg)] text-[var(--sage-strong)]";
                    case "amber":
                      return "border-[var(--amber-border)] bg-[var(--amber-bg)] text-[var(--amber-strong)]";
                    case "coral":
                      return "border-[var(--coral-border)] bg-[var(--coral-bg)] text-[var(--coral-strong)]";
                    case "indigo":
                      return "border-[var(--indigo-border)] bg-[var(--indigo-bg)] text-[var(--indigo-strong)]";
                    default:
                      return "border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-[var(--ink-secondary)]";
                  }
                })();

                return (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3.5 py-2.5"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {item.actor ? (
                        <CaregiverBadge
                          initials={item.actor.avatarInitials}
                          colorKey={item.actor.avatarColor}
                          size="sm"
                        />
                      ) : null}
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[var(--ink-primary)] truncate">
                          {item.title}
                        </div>
                        <div className="text-xs font-medium text-[var(--ink-tertiary)] tabular-nums">
                          {item.timeLabel}
                          {item.actor ? ` • ${item.actor.displayName}` : ""}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${badgeTone}`}
                    >
                      {item.badge}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* 14-Day Care History Matrix */}
        <section
          aria-label={UI_COPY.ownerView.historyTitle}
          data-testid="care-history-section"
          className="rounded-[16px] border border-[var(--border-hairline)] bg-[var(--bg-card)] p-4 sm:p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-[var(--ink-primary)]">
                {UI_COPY.ownerView.historyTitle}
              </h2>
              <div className="mt-1 flex flex-wrap gap-3 text-xs font-semibold text-[var(--ink-secondary)] tabular-nums">
                <span>On-time meals: {history.onTimePercent}%</span>
                <span>Core streak: {history.coreStreakDays} days</span>
              </div>
            </div>

            <div className="flex md:hidden items-center gap-2">
              <button
                type="button"
                onClick={() => setMobileWindow("last7")}
                aria-pressed={mobileWindow === "last7"}
                data-testid="history-toggle-last7"
                className={`min-h-[44px] rounded-[12px] border px-3 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sage-text)] ${
                  mobileWindow === "last7"
                    ? "border-[var(--sage-text)] bg-[var(--sage-bg)] text-[var(--sage-strong)]"
                    : "border-[var(--border-control)] bg-[var(--bg-canvas)] text-[var(--ink-primary)]"
                }`}
              >
                {UI_COPY.ownerView.last7Label}
              </button>
              <button
                type="button"
                onClick={() => setMobileWindow("prev7")}
                aria-pressed={mobileWindow === "prev7"}
                data-testid="history-toggle-prev7"
                className={`min-h-[44px] rounded-[12px] border px-3 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sage-text)] ${
                  mobileWindow === "prev7"
                    ? "border-[var(--sage-text)] bg-[var(--sage-bg)] text-[var(--sage-strong)]"
                    : "border-[var(--border-control)] bg-[var(--bg-canvas)] text-[var(--ink-primary)]"
                }`}
              >
                {UI_COPY.ownerView.prev7Label}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table
              data-testid="care-history-matrix"
              className="w-full table-fixed border-separate border-spacing-0.5 sm:border-spacing-1 text-center"
            >
              <thead>
                <tr>
                  <th className="w-12 sm:w-16 text-left text-[11px] sm:text-xs font-bold text-[var(--ink-tertiary)] py-1">
                    Care
                  </th>
                  {history.days.map((day, idx) => {
                    const isSelected = selectedDay?.dateKey === day.dateKey;
                    return (
                      <th
                        key={day.dateKey}
                        className={`p-0.5 ${getColumnDisplayClass(idx)}`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedDateKey(day.dateKey)}
                          aria-pressed={isSelected}
                          className={`flex min-h-[44px] w-full flex-col items-center justify-center rounded-[8px] border px-0.5 text-[10px] sm:text-[11px] font-bold tabular-nums leading-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sage-text)] ${
                            isSelected
                              ? "border-[var(--indigo-text)] bg-[var(--indigo-bg)] text-[var(--indigo-strong)]"
                              : "border-transparent bg-[var(--bg-subtle)] text-[var(--ink-secondary)] hover:border-[var(--border-control)]"
                          }`}
                        >
                          <span>{day.weekdayLabel}</span>
                          <span className="text-[9px] sm:text-[10px] font-medium">
                            {day.shortLabel}
                          </span>
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    { key: "am", label: "AM", desktopLabel: "AM Meal" },
                    { key: "pm", label: "PM", desktopLabel: "PM Meal" },
                    { key: "litter", label: "Litter", desktopLabel: "Litter" },
                    { key: "play", label: "Play", desktopLabel: "Play" },
                  ] as const
                ).map((row) => (
                  <tr key={row.key}>
                    <th
                      scope="row"
                      className="text-left text-[11px] sm:text-xs font-semibold text-[var(--ink-secondary)] pr-1"
                    >
                      <span className="sm:hidden">{row.label}</span>
                      <span className="hidden sm:inline">{row.desktopLabel}</span>
                    </th>
                    {history.days.map((day, idx) => {
                      const colClass = getColumnDisplayClass(idx);
                      if (row.key === "play") {
                        const hasPlay = day.playCount > 0;
                        return (
                          <td key={day.dateKey} className={`p-0.5 ${colClass}`}>
                            <button
                              type="button"
                              onClick={() => setSelectedDateKey(day.dateKey)}
                              data-testid={`history-cell-${day.dateKey}-play`}
                              aria-label={`${day.shortLabel} Play: ${day.playCount}`}
                              className={`inline-flex min-h-[44px] w-full items-center justify-center rounded-[8px] border text-xs font-bold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--indigo-text)] ${
                                hasPlay
                                  ? "border-[var(--indigo-border)] bg-[var(--indigo-bg)] text-[var(--indigo-strong)]"
                                  : "border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-[var(--ink-tertiary)]"
                              }`}
                            >
                              {hasPlay ? (
                                <span className="inline-flex items-center gap-0.5">
                                  <Footprints
                                    className="h-3 w-3"
                                    aria-hidden="true"
                                  />
                                  <span>{day.playCount}</span>
                                </span>
                              ) : (
                                "0"
                              )}
                            </button>
                          </td>
                        );
                      }

                      const status =
                        row.key === "am"
                          ? day.amStatus
                          : row.key === "pm"
                            ? day.pmStatus
                            : day.litterStatus;
                      const badge = renderMatrixBadge(status);

                      return (
                        <td key={day.dateKey} className={`p-0.5 ${colClass}`}>
                          <button
                            type="button"
                            onClick={() => setSelectedDateKey(day.dateKey)}
                            data-testid={`history-cell-${day.dateKey}-${row.key}`}
                            aria-label={`${day.shortLabel} ${row.desktopLabel}: ${badge.label}`}
                            className={`inline-flex min-h-[44px] w-full items-center justify-center rounded-[8px] border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sage-text)] ${badge.cls}`}
                          >
                            {badge.icon}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selectedDay ? (
            <div
              data-testid="day-detail-inspector"
              className="rounded-[12px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3.5"
            >
              <div className="font-display text-sm font-bold text-[var(--ink-primary)] tabular-nums">
                {selectedDay.weekdayLabel}, {selectedDay.shortLabel}
              </div>
              <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-[var(--ink-secondary)]">
                <div>
                  <dt className="font-bold text-[var(--ink-primary)]">
                    AM Meal
                  </dt>
                  <dd>
                    {selectedDay.details.amFedBy
                      ? `${selectedDay.details.amFedBy} at ${selectedDay.details.amFedAt}`
                      : renderMatrixBadge(selectedDay.amStatus).label}
                  </dd>
                </div>
                <div>
                  <dt className="font-bold text-[var(--ink-primary)]">
                    PM Meal
                  </dt>
                  <dd>
                    {selectedDay.details.pmFedBy
                      ? `${selectedDay.details.pmFedBy} at ${selectedDay.details.pmFedAt}`
                      : renderMatrixBadge(selectedDay.pmStatus).label}
                  </dd>
                </div>
                <div>
                  <dt className="font-bold text-[var(--ink-primary)]">
                    Litter Box
                  </dt>
                  <dd>
                    {selectedDay.details.litterBy
                      ? `${selectedDay.details.litterBy} at ${selectedDay.details.litterAt}`
                      : renderMatrixBadge(selectedDay.litterStatus).label}
                  </dd>
                </div>
                <div>
                  <dt className="font-bold text-[var(--ink-primary)]">
                    Out-of-Room Play
                  </dt>
                  <dd>
                    {selectedDay.details.playBy.length > 0
                      ? selectedDay.details.playBy.join(", ")
                      : "None logged"}
                  </dd>
                </div>
              </dl>
            </div>
          ) : null}
        </section>

        {/* Phone Alerts Health Panel */}
        <section
          aria-label={UI_COPY.ownerView.pushHealthTitle}
          data-testid="push-health-panel"
          className="rounded-[16px] border border-[var(--border-hairline)] bg-[var(--bg-card)] p-4 sm:p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-[var(--ink-primary)]">
                {UI_COPY.ownerView.pushHealthTitle}
              </h2>
              <p className="mt-0.5 text-xs font-medium text-[var(--ink-secondary)] tabular-nums">
                Helper Devices: {history.pushHealth.activeHelperDevices} •
                Family Devices: {history.pushHealth.activeFamilyDevices} •
                Owner Devices: {history.pushHealth.activeOwnerDevices}
              </p>
            </div>
            <Link
              href={`/h/${encodeURIComponent(token)}/setup${viewerCaregiver ? `?who=${encodeURIComponent(viewerCaregiver.slug)}` : ""}`}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-[12px] border border-[var(--border-control)] bg-[var(--bg-subtle)] px-3.5 text-sm font-semibold text-[var(--ink-primary)] hover:bg-[var(--border-hairline)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sage-text)]"
            >
              <Smartphone className="h-4 w-4" aria-hidden="true" />
              <span>{UI_COPY.ownerView.openSetupCta}</span>
            </Link>
          </div>

          <div className="space-y-2.5">
            {history.pushHealth.devices.map((device) => {
              const isOn = device.activeCount > 0;
              const isGone = !isOn && device.goneCount > 0;
              const testResult = pushTestStatus[device.caregiverId];

              return (
                <div
                  key={device.caregiverId}
                  className="rounded-[12px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <CaregiverBadge
                        initials={device.avatarInitials}
                        colorKey={device.avatarColor}
                        size="md"
                      />
                      <div className="min-w-0">
                        <div className="font-display text-sm font-bold text-[var(--ink-primary)] truncate">
                          {device.caregiverName}
                        </div>
                        <div className="text-xs text-[var(--ink-secondary)]">
                          {UI_COPY.avatarPicker.roles[device.role]} •{" "}
                          {formatPlatformLabel(device.platform)}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold ${
                          isOn
                            ? "border-[var(--sage-border)] bg-[var(--sage-bg)] text-[var(--sage-strong)]"
                            : isGone
                              ? "border-[var(--coral-border)] bg-[var(--coral-bg)] text-[var(--coral-strong)]"
                              : "border-[var(--amber-border)] bg-[var(--amber-bg)] text-[var(--amber-strong)]"
                        }`}
                      >
                        {isOn ? (
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : isGone ? (
                          <BellOff className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          <Bell className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        <span>
                          {isOn
                            ? UI_COPY.ownerView.alertsOnBadge
                            : isGone
                              ? UI_COPY.ownerView.alertsOffBadge
                              : UI_COPY.ownerView.notSetBadge}
                        </span>
                      </span>

                      <button
                        type="button"
                        disabled={!isOn || Boolean(testingCaregiverId)}
                        onClick={() => void handleSendTestAlert(device)}
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[12px] border border-[var(--border-control)] bg-white px-3 text-xs font-bold text-[var(--ink-primary)] hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sage-text)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {testingCaregiverId === device.caregiverId ? (
                          <Loader2
                            className="h-3.5 w-3.5 animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <BellRing className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        <span>{UI_COPY.ownerView.sendTestAlertCta}</span>
                      </button>
                    </div>
                  </div>

                  {testResult ? (
                    <p
                      role="status"
                      className={`mt-2 text-xs font-semibold ${
                        testResult.ok
                          ? "text-[var(--sage-strong)]"
                          : "text-[var(--coral-strong)]"
                      }`}
                    >
                      {testResult.text}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
