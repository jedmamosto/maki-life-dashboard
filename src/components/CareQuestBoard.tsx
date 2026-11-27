"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Box,
  Check,
  CheckCircle2,
  Clock,
  Footprints,
  Loader2,
  Package,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Undo2,
  Utensils,
  X,
} from "lucide-react";
import type {
  Caregiver,
  DailyMealsView,
  DashboardSnapshot,
  SupplyKey,
  SupplyLevel,
  SupplyView,
  TaskVisualState,
} from "@/lib/types";
import { UI_COPY } from "@/lib/copy";
import { AppHeader } from "./AppHeader";
import { AvatarPickerModal } from "./AvatarPickerModal";
import { AvatarSwitcherSheet } from "./AvatarSwitcherSheet";
import { CaregiverBadge } from "./CaregiverBadge";
import { MessengerWebViewBanner } from "./MessengerWebViewBanner";
import {
  CareApiError,
  apiFetch,
  ensureHouseholdSession,
  findValidCaregiver,
  generateIdempotencyKey,
  useIsHydrated,
  useStoredCaregiverSlug,
  writeStoredCaregiverSlug,
} from "./care-client";

interface CareQuestBoardProps {
  token: string;
  initialSnapshot: DashboardSnapshot;
  initialWhoSlug: string | null;
}

interface SnackbarState {
  id: number;
  message: string;
  undoLogId?: string;
}

const SUPPLY_LEVELS: SupplyLevel[] = ["FULL", "HALF", "LOW", "EMPTY"];

function getStateToneClasses(state: TaskVisualState): {
  badge: string;
  border: string;
  labelColor: string;
} {
  switch (state) {
    case "DONE":
      return {
        badge:
          "border-[var(--sage-border)] bg-[var(--sage-bg)] text-[var(--sage-strong)]",
        border: "border-[var(--sage-border)]",
        labelColor: "text-[var(--sage-strong)]",
      };
    case "DUE_NOW":
      return {
        badge:
          "border-[var(--amber-border)] bg-[var(--amber-bg)] text-[var(--amber-strong)]",
        border: "border-[var(--amber-border)]",
        labelColor: "text-[var(--amber-strong)]",
      };
    case "OVERDUE":
      return {
        badge:
          "border-[var(--coral-border)] bg-[var(--coral-bg)] text-[var(--coral-strong)]",
        border: "border-[var(--coral-border)]",
        labelColor: "text-[var(--coral-strong)]",
      };
    case "UPCOMING":
    default:
      return {
        badge:
          "border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-[var(--ink-secondary)]",
        border: "border-[var(--border-hairline)]",
        labelColor: "text-[var(--ink-secondary)]",
      };
  }
}

function StateIcon({ state }: { state: TaskVisualState }) {
  switch (state) {
    case "DONE":
      return <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />;
    case "DUE_NOW":
      return <Clock className="h-3.5 w-3.5" aria-hidden="true" />;
    case "OVERDUE":
      return <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />;
    case "UPCOMING":
    default:
      return <Clock className="h-3.5 w-3.5" aria-hidden="true" />;
  }
}

function getSupplyPipCount(level: SupplyLevel): number {
  switch (level) {
    case "FULL":
      return 4;
    case "HALF":
      return 2;
    case "LOW":
      return 1;
    case "EMPTY":
    default:
      return 0;
  }
}

function getSupplyTone(level: SupplyLevel): {
  pipColor: string;
  badgeClass: string;
} {
  switch (level) {
    case "FULL":
      return {
        pipColor: "bg-[var(--sage-text)]",
        badgeClass:
          "border-[var(--sage-border)] bg-[var(--sage-bg)] text-[var(--sage-strong)]",
      };
    case "HALF":
      return {
        pipColor: "bg-[var(--ink-secondary)]",
        badgeClass:
          "border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-[var(--ink-primary)]",
      };
    case "LOW":
      return {
        pipColor: "bg-[var(--amber-accent)]",
        badgeClass:
          "border-[var(--amber-border)] bg-[var(--amber-bg)] text-[var(--amber-strong)]",
      };
    case "EMPTY":
    default:
      return {
        pipColor: "bg-[var(--coral-accent)]",
        badgeClass:
          "border-[var(--coral-border)] bg-[var(--coral-bg)] text-[var(--coral-strong)]",
      };
  }
}

export function CareQuestBoard({
  token,
  initialSnapshot,
  initialWhoSlug,
}: CareQuestBoardProps) {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>(initialSnapshot);
  const isHydrated = useIsHydrated();
  const storedSlug = useStoredCaregiverSlug(token);
  const [pickedCaregiverId, setPickedCaregiverId] = useState<string | null>(
    () => {
      const fromQuery = findValidCaregiver(
        initialSnapshot.caregivers,
        initialWhoSlug
      );
      return fromQuery ? fromQuery.id : null;
    }
  );
  const [pickerDismissed, setPickerDismissed] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [inFlightAction, setInFlightAction] = useState<string | null>(null);
  const [editingAttributionLogId, setEditingAttributionLogId] = useState<
    string | null
  >(null);
  const [expandedSupplyKey, setExpandedSupplyKey] = useState<SupplyKey | null>(
    null
  );
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<SnackbarState | null>(null);

  const lastRetryActionRef = useRef<(() => Promise<void>) | null>(null);
  const snackbarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedKeyRef = useRef<string | null>(null);
  const litterKeyRef = useRef<string | null>(null);
  const playKeyRef = useRef<string | null>(null);

  const activeCaregiver =
    findValidCaregiver(snapshot.caregivers, pickedCaregiverId) ??
    findValidCaregiver(snapshot.caregivers, initialWhoSlug) ??
    findValidCaregiver(snapshot.caregivers, storedSlug);

  const pickerOpen = isHydrated && !activeCaregiver && !pickerDismissed;

  const helperName =
    snapshot.caregivers.find((c) => c.isActive && c.role === "helper")
      ?.displayName ?? "Ate";

  // Establish session cookie and persist ?who= slug cleanly without calling setState
  useEffect(() => {
    void ensureHouseholdSession(token).catch(() => {
      // Errors surface if subsequent requests fail
    });

    const fromQuery = findValidCaregiver(
      initialSnapshot.caregivers,
      initialWhoSlug
    );
    if (fromQuery) {
      writeStoredCaregiverSlug(token, fromQuery.slug);
    }
  }, [token, initialWhoSlug, initialSnapshot.caregivers]);

  useEffect(() => {
    return () => {
      if (snackbarTimerRef.current) {
        clearTimeout(snackbarTimerRef.current);
      }
    };
  }, []);

  const showSnackbar = useCallback(
    (message: string, undoLogId?: string) => {
      if (snackbarTimerRef.current) {
        clearTimeout(snackbarTimerRef.current);
      }
      setSnackbar({
        id: Date.now(),
        message,
        undoLogId,
      });
      snackbarTimerRef.current = setTimeout(() => {
        setSnackbar(null);
      }, 10000);
    },
    []
  );

  const handleSelectCaregiver = useCallback(
    (person: Caregiver) => {
      setPickedCaregiverId(person.id);
      writeStoredCaregiverSlug(token, person.slug);
      setPickerDismissed(true);
      setSwitcherOpen(false);
    },
    [token]
  );

  const requireCaregiver = useCallback((): Caregiver | null => {
    if (activeCaregiver) {
      return activeCaregiver;
    }
    setPickerDismissed(false);
    return null;
  }, [activeCaregiver]);

  const refreshDashboard = useCallback(async () => {
    setInFlightAction("refresh");
    setErrorBanner(null);
    lastRetryActionRef.current = null;
    try {
      const fresh = await apiFetch<DashboardSnapshot>(token, "/api/dashboard", {
        method: "GET",
      });
      setSnapshot(fresh);
    } catch (err) {
      setErrorBanner(
        err instanceof CareApiError
          ? err.message
          : UI_COPY.syncStates.offlineBody
      );
    } finally {
      setInFlightAction(null);
    }
  }, [token]);

  const handleFeedMeal = useCallback(async () => {
    const actor = requireCaregiver();
    if (!actor || inFlightAction) {
      return;
    }

    if (!feedKeyRef.current) {
      feedKeyRef.current = generateIdempotencyKey("feed");
    }
    const idempotencyKey = feedKeyRef.current;

    const run = async () => {
      setInFlightAction("meals:feed");
      setErrorBanner(null);
      try {
        const result = await apiFetch<{
          alreadyFed: boolean;
          record: { id: string };
          snapshot: DashboardSnapshot;
        }>(token, "/api/meals/feed", {
          method: "POST",
          body: JSON.stringify({
            caregiverId: actor.id,
            idempotencyKey,
          }),
        });

        feedKeyRef.current = null;
        lastRetryActionRef.current = null;
        setSnapshot(result.snapshot);
        const latestEntry =
          result.snapshot.meals.entries[
            result.snapshot.meals.entries.length - 1
          ];
        showSnackbar(
          UI_COPY.meals.savedToast(
            latestEntry?.completedTimeLabel ?? result.snapshot.manilaTimeLabel,
            result.snapshot.meals.count,
            result.snapshot.meals.target
          ),
          result.record.id
        );
      } catch (err) {
        if (err instanceof CareApiError && err.snapshot) {
          setSnapshot(err.snapshot);
        }
        setErrorBanner(
          err instanceof CareApiError
            ? err.message
            : UI_COPY.syncStates.offlineBody
        );
      } finally {
        setInFlightAction(null);
      }
    };

    lastRetryActionRef.current = run;
    await run();
  }, [inFlightAction, requireCaregiver, showSnackbar, token]);

  const handleUndoMeal = useCallback(
    async (logId: string) => {
      if (inFlightAction) {
        return;
      }

      const run = async () => {
        setInFlightAction(`undo:${logId}`);
        setErrorBanner(null);
        try {
          const result = await apiFetch<{ snapshot: DashboardSnapshot }>(
            token,
            "/api/meals/undo",
            {
              method: "POST",
              body: JSON.stringify({ logId }),
            }
          );
          setSnapshot(result.snapshot);
          setSnackbar(null);
          setEditingAttributionLogId(null);
        } catch (err) {
          setErrorBanner(
            err instanceof CareApiError
              ? err.message
              : UI_COPY.syncStates.offlineBody
          );
        } finally {
          setInFlightAction(null);
        }
      };

      lastRetryActionRef.current = run;
      await run();
    },
    [inFlightAction, token]
  );

  const handleChangeMealAttribution = useCallback(
    async (logId: string, caregiverId: string) => {
      if (inFlightAction) {
        return;
      }

      const run = async () => {
        setInFlightAction(`attr:${logId}`);
        setErrorBanner(null);
        try {
          const result = await apiFetch<{ snapshot: DashboardSnapshot }>(
            token,
            "/api/meals/attribution",
            {
              method: "PATCH",
              body: JSON.stringify({ logId, caregiverId }),
            }
          );
          setSnapshot(result.snapshot);
          setEditingAttributionLogId(null);
        } catch (err) {
          setErrorBanner(
            err instanceof CareApiError
              ? err.message
              : UI_COPY.syncStates.offlineBody
          );
        } finally {
          setInFlightAction(null);
        }
      };

      lastRetryActionRef.current = run;
      await run();
    },
    [inFlightAction, token]
  );

  const handleCleanLitter = useCallback(async () => {
    const actor = requireCaregiver();
    if (!actor || inFlightAction) {
      return;
    }

    if (!litterKeyRef.current) {
      litterKeyRef.current = generateIdempotencyKey("litter");
    }
    const idempotencyKey = litterKeyRef.current;

    const run = async () => {
      setInFlightAction("litter:clean");
      setErrorBanner(null);
      try {
        const result = await apiFetch<{ snapshot: DashboardSnapshot }>(
          token,
          "/api/litter/clean",
          {
            method: "POST",
            body: JSON.stringify({
              caregiverId: actor.id,
              idempotencyKey,
            }),
          }
        );
        litterKeyRef.current = null;
        setSnapshot(result.snapshot);
        showSnackbar(UI_COPY.litter.savedToast);
      } catch (err) {
        setErrorBanner(
          err instanceof CareApiError
            ? err.message
            : UI_COPY.syncStates.offlineBody
        );
      } finally {
        setInFlightAction(null);
      }
    };

    lastRetryActionRef.current = run;
    await run();
  }, [inFlightAction, requireCaregiver, showSnackbar, token]);

  const handleUpdateSupply = useCallback(
    async (supplyKey: SupplyKey, level: SupplyLevel) => {
      const actor = requireCaregiver();
      if (!actor || inFlightAction) {
        return;
      }

      const run = async () => {
        setInFlightAction(`supply:${supplyKey}:${level}`);
        setErrorBanner(null);
        try {
          const result = await apiFetch<{ snapshot: DashboardSnapshot }>(
            token,
            "/api/supplies",
            {
              method: "PATCH",
              body: JSON.stringify({
                supplyKey,
                level,
                caregiverId: actor.id,
              }),
            }
          );
          setSnapshot(result.snapshot);
          setExpandedSupplyKey(null);
          showSnackbar(
            UI_COPY.supplies.updatedSaved(
              UI_COPY.supplies.itemName(supplyKey),
              level
            )
          );
        } catch (err) {
          setErrorBanner(
            err instanceof CareApiError
              ? err.message
              : UI_COPY.syncStates.offlineBody
          );
        } finally {
          setInFlightAction(null);
        }
      };

      lastRetryActionRef.current = run;
      await run();
    },
    [inFlightAction, requireCaregiver, showSnackbar, token]
  );

  const handleLogPlay = useCallback(async () => {
    const actor = requireCaregiver();
    if (!actor || inFlightAction) {
      return;
    }

    if (!playKeyRef.current) {
      playKeyRef.current = generateIdempotencyKey("play");
    }
    const idempotencyKey = playKeyRef.current;

    const run = async () => {
      setInFlightAction("play:log");
      setErrorBanner(null);
      try {
        const result = await apiFetch<{ snapshot: DashboardSnapshot }>(
          token,
          "/api/play",
          {
            method: "POST",
            body: JSON.stringify({
              caregiverId: actor.id,
              eventType: "PLAY_SESSION",
              idempotencyKey,
            }),
          }
        );
        playKeyRef.current = null;
        setSnapshot(result.snapshot);
        showSnackbar(UI_COPY.play.savedToast);
      } catch (err) {
        setErrorBanner(
          err instanceof CareApiError
            ? err.message
            : UI_COPY.syncStates.offlineBody
        );
      } finally {
        setInFlightAction(null);
      }
    };

    lastRetryActionRef.current = run;
    await run();
  }, [inFlightAction, requireCaregiver, showSnackbar, token]);

  const survivabilityStyle = (() => {
    switch (snapshot.survivability.status) {
      case "SAFE":
        return {
          wrap: "border-[var(--sage-border)] bg-[var(--sage-bg)]",
          badge: "bg-white border-[var(--sage-border)] text-[var(--sage-strong)]",
          title: "text-[var(--sage-strong)]",
          sub: "text-[var(--ink-primary)]",
          icon: <ShieldCheck className="h-3.5 w-3.5 text-[var(--sage-text)]" aria-hidden="true" />,
        };
      case "ATTENTION":
        return {
          wrap: "border-[var(--amber-border)] bg-[var(--amber-bg)]",
          badge: "bg-white border-[var(--amber-border)] text-[var(--amber-strong)]",
          title: "text-[var(--amber-strong)]",
          sub: "text-[var(--ink-primary)]",
          icon: <Clock className="h-3.5 w-3.5 text-[var(--amber-accent)]" aria-hidden="true" />,
        };
      case "OVERDUE":
      default:
        return {
          wrap: "border-[var(--coral-border)] bg-[var(--coral-bg)]",
          badge: "bg-white border-[var(--coral-border)] text-[var(--coral-strong)]",
          title: "text-[var(--coral-strong)]",
          sub: "text-[var(--ink-primary)]",
          icon: <AlertCircle className="h-3.5 w-3.5 text-[var(--coral-accent)]" aria-hidden="true" />,
        };
    }
  })();

  const renderSupplyStripCard = (supply: SupplyView) => {
    const tone = getSupplyTone(supply.level);
    const pipCount = getSupplyPipCount(supply.level);
    const isExpanded = expandedSupplyKey === supply.key;

    return (
      <button
        key={supply.key}
        type="button"
        onClick={() =>
          setExpandedSupplyKey((prev) =>
            prev === supply.key ? null : supply.key
          )
        }
        aria-expanded={isExpanded}
        data-testid={`supply-card-${supply.key.toLowerCase()}`}
        className={`flex min-h-[104px] flex-col justify-between rounded-[var(--radius-card)] border p-3.5 text-left kitchen-transition sunlit-card sunlit-press focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)] ${
          isExpanded
            ? "border-[var(--border-control)] bg-[var(--bg-subtle)]"
            : "border-[var(--border-hairline)] bg-[var(--bg-card)] hover:border-[var(--border-control)]"
        }`}
      >
        <div className="flex w-full items-center justify-between gap-1.5">
          <span className="flex items-center gap-1.5 min-w-0 font-display text-sm font-bold text-[var(--ink-primary)]">
            {supply.key === "CAT_FOOD" ? (
              <Package className="h-4 w-4 shrink-0 text-[var(--ink-secondary)]" aria-hidden="true" />
            ) : (
              <Box className="h-4 w-4 shrink-0 text-[var(--ink-secondary)]" aria-hidden="true" />
            )}
            <span className="truncate">{supply.label}</span>
          </span>
          <span className="shrink-0 text-xs font-semibold text-[var(--ink-secondary)] underline decoration-[var(--border-control)] underline-offset-2">
            {UI_COPY.supplies.editLabel}
          </span>
        </div>

        <div className="mt-2.5 flex w-full items-center gap-1.5" aria-hidden="true">
          {[1, 2, 3, 4].map((pip) => (
            <span
              key={pip}
              className={`h-2.5 flex-1 rounded-full ${
                pip <= pipCount
                  ? tone.pipColor
                  : "bg-[var(--bg-track)] border border-[var(--border-hairline)]"
              }`}
            />
          ))}
        </div>

        <div className="mt-2 flex w-full items-center justify-between gap-2">
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${tone.badgeClass}`}
          >
            <span className="optical-trim">{UI_COPY.supplies.levels[supply.level]}</span>
          </span>
          <span className="truncate text-xs font-medium text-[var(--ink-tertiary)] tabular-nums">
            {supply.updatedLabel}
          </span>
        </div>
      </button>
    );
  };

  const focalCard: "meals" | "litter" | null = (() => {
    if (snapshot.meals.state === "OVERDUE") return "meals";
    if (snapshot.litter.state === "OVERDUE") return "litter";
    if (snapshot.meals.state === "DUE_NOW") return "meals";
    if (snapshot.litter.state === "DUE_NOW") return "litter";
    return null;
  })();

  const renderMealsCard = (meals: DailyMealsView) => {
    const tone = getStateToneClasses(meals.state);
    const isMealInFlight = inFlightAction === "meals:feed";
    const clampedMealPercent = Math.min(100, Math.max(0, meals.progressPercent));

    const mealsBody = (() => {
      if (meals.state === "OVERDUE") {
        return UI_COPY.meals.overdueBody(meals.count, meals.target, helperName);
      }
      if (meals.isGoalMet) {
        return UI_COPY.meals.goalMetBody(meals.target);
      }
      if (meals.count === 0) {
        return UI_COPY.meals.emptyBody(meals.target);
      }
      return UI_COPY.meals.progressBody(meals.count, meals.target);
    })();

    const isMealsActionFocus = focalCard === "meals";

    return (
      <article
        data-testid="meals-today-card"
        className={`rounded-[var(--radius-card)] bg-[var(--bg-card)] ${
          isMealsActionFocus
            ? meals.state === "OVERDUE"
              ? "border-2 border-[var(--coral-accent)] sunlit-hero-card p-4 sm:p-5"
              : "border-2 border-[var(--brand-coat)] sunlit-hero-card p-4 sm:p-5"
            : `border ${tone.border} sunlit-card p-3.5 sm:p-4`
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span
              aria-hidden="true"
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-btn)] ${
                meals.state === "OVERDUE"
                  ? "bg-[var(--coral-bg)] text-[var(--coral-strong)]"
                  : meals.state === "DUE_NOW"
                    ? "bg-[var(--brand-bg)] text-[var(--brand-primary)]"
                    : "bg-[var(--bg-subtle)] text-[var(--ink-secondary)]"
              }`}
            >
              <Utensils className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-lg font-bold tracking-[-0.01em] text-[var(--ink-primary)]">
                {UI_COPY.meals.title}
              </h2>
              <p className="text-xs font-medium text-[var(--ink-tertiary)] tabular-nums">
                {meals.count} of {meals.target} today
              </p>
            </div>
          </div>

          {meals.isGoalMet ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--sage-border)] bg-[var(--sage-bg)] px-3 py-1 text-xs font-bold text-[var(--sage-strong)] tabular-nums">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="optical-trim">
                {UI_COPY.meals.goalDoneBadge} ({meals.count} of {meals.target})
              </span>
            </span>
          ) : (
            <span
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold tabular-nums ${tone.badge}`}
            >
              <StateIcon state={meals.state} />
              <span className="optical-trim">
                {meals.count} of {meals.target}
              </span>
            </span>
          )}
        </div>

        <div
          className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-[var(--bg-subtle)] border border-[var(--border-hairline)]"
          role="progressbar"
          aria-label={UI_COPY.meals.title}
          aria-valuemin={0}
          aria-valuemax={meals.target}
          aria-valuenow={meals.count}
        >
          <div
            className="h-full rounded-full bg-[var(--sage-text)] kitchen-transition"
            style={{ width: `${clampedMealPercent}%` }}
          />
        </div>

        <p className="mt-3 max-w-prose text-sm sm:text-base text-[var(--ink-secondary)] leading-relaxed">
          {mealsBody}
        </p>

        {meals.entries.length > 0 ? (
          <ul
            data-testid="meal-entries-list"
            className="mt-3 divide-y divide-[var(--sage-border)]/70 rounded-[var(--radius-btn)] border border-[var(--sage-border)] bg-[var(--sage-bg)]/45"
          >
            {meals.entries.map((entry, idx) => {
              const isUndoInFlight = inFlightAction === `undo:${entry.id}`;
              const isAttrInFlight = inFlightAction === `attr:${entry.id}`;
              const showAttrList = editingAttributionLogId === entry.id;

              return (
                <li
                  key={entry.id}
                  data-testid={`meal-entry-${idx}`}
                  className="p-2.5 space-y-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {entry.completedBy ? (
                        <CaregiverBadge
                          initials={entry.completedBy.avatarInitials}
                          colorKey={entry.completedBy.avatarColor}
                          size="sm"
                        />
                      ) : null}
                      <span className="truncate text-sm font-semibold text-[var(--sage-strong)] tabular-nums">
                        Meal #{idx + 1}:{" "}
                        {entry.completedBy?.displayName ?? "Caregiver"} •{" "}
                        {entry.completedTimeLabel}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {entry.canUndo ? (
                        <button
                          type="button"
                          onClick={() => void handleUndoMeal(entry.id)}
                          disabled={Boolean(inFlightAction)}
                          data-testid={`undo-meal-${idx}`}
                          aria-label={`Undo Meal #${idx + 1}`}
                          className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border-control)] bg-[var(--bg-card)] px-2.5 text-xs font-semibold text-[var(--ink-primary)] hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)] disabled:opacity-60 kitchen-transition"
                        >
                          {isUndoInFlight ? (
                            <Loader2
                              className="h-3.5 w-3.5 animate-spin"
                              aria-hidden="true"
                            />
                          ) : (
                            <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          <span>{UI_COPY.meals.undoCta}</span>
                        </button>
                      ) : null}

                      <button
                        type="button"
                        onClick={() =>
                          setEditingAttributionLogId((prev) =>
                            prev === entry.id ? null : entry.id
                          )
                        }
                        aria-expanded={showAttrList}
                        data-testid={`change-name-${idx}`}
                        className="inline-flex min-h-[44px] items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border-control)] bg-[var(--bg-card)] px-2.5 text-xs font-semibold text-[var(--ink-primary)] hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)] kitchen-transition"
                      >
                        <span>{UI_COPY.meals.changeNameCta}</span>
                      </button>
                    </div>
                  </div>

                  {showAttrList ? (
                    <div className="border-t border-[var(--sage-border)]/70 pt-2.5">
                      <p className="mb-2 text-xs font-semibold text-[var(--ink-secondary)]">
                        {UI_COPY.avatarPicker.switchSubtitle}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {snapshot.caregivers
                          .filter((c) => c.isActive)
                          .map((person) => {
                            const isCurrent =
                              entry.completedBy?.id === person.id;
                            return (
                              <button
                                key={person.id}
                                type="button"
                                disabled={isAttrInFlight}
                                onClick={() =>
                                  void handleChangeMealAttribution(
                                    entry.id,
                                    person.id
                                  )
                                }
                                className={`flex min-h-[44px] items-center gap-2 rounded-[var(--radius-sm)] border px-2.5 text-left text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)] kitchen-transition ${
                                  isCurrent
                                    ? "border-[var(--sage-text)] bg-[var(--sage-bg)] text-[var(--sage-strong)]"
                                    : "border-[var(--border-hairline)] bg-[var(--bg-card)] text-[var(--ink-primary)] hover:bg-[var(--bg-subtle)]"
                                }`}
                              >
                                <CaregiverBadge
                                  initials={person.avatarInitials}
                                  colorKey={person.avatarColor}
                                  size="sm"
                                />
                                <span className="truncate">
                                  {person.displayName}
                                </span>
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}

        <div className="mt-4">
          <button
            type="button"
            onClick={() => void handleFeedMeal()}
            disabled={Boolean(inFlightAction)}
            data-testid="feed-cta"
            className={`inline-flex min-h-[56px] w-full items-center justify-center gap-2 rounded-[12px] px-4 font-display text-base font-bold kitchen-transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
              meals.state === "OVERDUE"
                ? "bg-[var(--coral-text)] text-white hover:bg-[var(--coral-strong)] focus-visible:ring-[var(--coral-text)]"
                : meals.isGoalMet
                  ? "border border-[var(--border-control)] bg-[var(--bg-subtle)] text-[var(--ink-primary)] hover:bg-[var(--border-hairline)] focus-visible:ring-[var(--ring-focus)]"
                  : "bg-[var(--brand-primary)] text-[var(--brand-on-primary)] hover:bg-[var(--brand-strong)] focus-visible:ring-[var(--ring-focus)]"
            } disabled:opacity-65`}
          >
            {isMealInFlight ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                <span>{UI_COPY.meals.savingCta}</span>
              </>
            ) : (
              <>
                <Check className="h-5 w-5" aria-hidden="true" />
                <span>
                  {meals.isGoalMet
                    ? UI_COPY.meals.extraMealCta
                    : UI_COPY.meals.markFedCta}
                </span>
              </>
            )}
          </button>
        </div>

        {meals.showFoodStockPiggyback ? (
          <div
            data-testid="food-stock-piggyback"
            className="mt-3 rounded-[12px] border border-[var(--amber-border)] bg-[var(--amber-bg)] p-3"
          >
            <p className="text-sm font-semibold text-[var(--amber-strong)]">
              {UI_COPY.meals.foodPiggybackQuestion}
            </p>
            <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 gap-2">
              {SUPPLY_LEVELS.map((lvl) => {
                const isSelected = snapshot.supplies.food.level === lvl;
                return (
                  <button
                    key={lvl}
                    type="button"
                    disabled={Boolean(inFlightAction)}
                    onClick={() => void handleUpdateSupply("CAT_FOOD", lvl)}
                    className={`min-h-[44px] rounded-[10px] border px-2 text-sm font-bold kitchen-transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--amber-text)] ${
                      isSelected
                        ? "border-[var(--amber-text)] bg-white text-[var(--amber-strong)]"
                        : "border-[var(--amber-border)] bg-white/80 text-[var(--ink-primary)] hover:bg-white"
                    }`}
                  >
                    {UI_COPY.supplies.levels[lvl]}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </article>
    );
  };

  const litterTone = getStateToneClasses(snapshot.litter.state);
  const litterBody = (() => {
    if (!snapshot.litter.lastCleanedAtIso) {
      return UI_COPY.litter.neverLogged;
    }
    if (snapshot.litter.state === "OVERDUE") {
      return UI_COPY.litter.overdueBody(snapshot.litter.hoursOverdue);
    }
    if (snapshot.litter.state === "DUE_NOW") {
      return UI_COPY.litter.dueBody;
    }
    return UI_COPY.litter.upcomingBody(
      snapshot.litter.lastCleanedLabel,
      snapshot.litter.nextDueLabel
    );
  })();

  const allMealsDoneAndSafe =
    snapshot.survivability.status === "SAFE" && snapshot.meals.isGoalMet;
  const isLitterActionFocus = focalCard === "litter";

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] pb-24">
      <AppHeader
        token={token}
        activeTab="board"
        manilaDateLabel={snapshot.manilaDateLabel}
        manilaTimeLabel={snapshot.manilaTimeLabel}
        activeCaregiver={activeCaregiver}
        onOpenSwitcher={() => setSwitcherOpen(true)}
        maxWidthClass="max-w-2xl"
      />

      <main className="mx-auto max-w-2xl space-y-5 px-4 pt-4">
        <MessengerWebViewBanner />

        {errorBanner ? (
          <div
            role="alert"
            data-testid="board-error-banner"
            className="rounded-[16px] border border-[var(--coral-border)] bg-[var(--coral-bg)] p-4"
          >
            <div className="flex items-start gap-3">
              <AlertCircle
                className="mt-0.5 h-5 w-5 shrink-0 text-[var(--coral-text)]"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-base font-bold text-[var(--coral-strong)]">
                  {UI_COPY.syncStates.offlineTitle}
                </h2>
                <p className="mt-1 text-sm text-[var(--ink-primary)]">
                  {errorBanner}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (lastRetryActionRef.current) {
                        void lastRetryActionRef.current();
                      } else {
                        void refreshDashboard();
                      }
                    }}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[12px] bg-[var(--coral-text)] px-4 text-sm font-bold text-white hover:bg-[var(--coral-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--coral-text)]"
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    <span>{UI_COPY.syncStates.tryAgainCta}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void refreshDashboard()}
                    className="inline-flex min-h-[44px] items-center rounded-[12px] border border-[var(--coral-border)] bg-white px-4 text-sm font-semibold text-[var(--coral-strong)] hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--coral-text)]"
                  >
                    {UI_COPY.syncStates.refreshCta}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* CHUNK 1: Status Header + Polaroid Survivability Crest */}
        <section
          aria-label="Maki Survivability Status"
          data-testid="survivability-crest"
          className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-card)] sunlit-card p-4 sm:p-5"
        >
          <div className="flex items-center gap-4">
            <div className="relative shrink-0 rounded-[16px] border border-[var(--border-hairline)] bg-white p-1.5 sunlit-polaroid -rotate-1">
              <Image
                src={
                  allMealsDoneAndSafe
                    ? "/maki/maki-cozy.jpg"
                    : "/maki/maki-portrait.jpg"
                }
                width={160}
                height={160}
                sizes="(min-width: 640px) 96px, 80px"
                preload={true}
                className="h-20 w-20 sm:h-24 sm:w-24 rounded-[11px] object-cover object-[50%_32%]"
                alt={
                  allMealsDoneAndSafe
                    ? "Maki curled up resting on a dark hoodie"
                    : "Maki the orange tabby cat looking up"
                }
              />
              <span
                aria-hidden="true"
                className="absolute -bottom-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border-hairline)] bg-white shadow-sm"
              >
                {survivabilityStyle.icon}
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold tabular-nums ${survivabilityStyle.wrap} ${survivabilityStyle.title}`}
              >
                {survivabilityStyle.icon}
                <span>
                  {snapshot.survivability.completedCoreCount} of{" "}
                  {snapshot.survivability.totalCoreCount}{" "}
                  {UI_COPY.survivability.coreLabelSuffix}
                </span>
              </span>
              <h1
                className={`mt-2 font-display text-2xl font-extrabold tracking-[-0.02em] leading-tight ${survivabilityStyle.title}`}
              >
                {snapshot.survivability.headline}
              </h1>
              <p className={`mt-1 text-sm font-medium ${survivabilityStyle.sub}`}>
                {snapshot.survivability.subtext}
              </p>
            </div>
          </div>

          {allMealsDoneAndSafe ? (
            <div
              data-testid="all-meals-done-strip"
              className="mt-4 flex items-center gap-3 rounded-[12px] border border-[var(--sage-border)] bg-[var(--sage-bg)]/80 px-3.5 py-2.5"
            >
              <CheckCircle2
                className="h-4 w-4 shrink-0 text-[var(--sage-text)]"
                aria-hidden="true"
              />
              <p className="text-sm font-semibold text-[var(--sage-strong)]">
                All {snapshot.meals.target} meals are done. Maki is resting easy tonight.
              </p>
            </div>
          ) : null}
        </section>

        {/* CHUNK 2: Today's Essential Quests */}
        <section aria-label="Today's Essential Quests" className="space-y-3">
          {renderMealsCard(snapshot.meals)}

          <article
            data-testid="litter-quest-card"
            className={`rounded-[var(--radius-card)] bg-[var(--bg-card)] ${
              isLitterActionFocus
                ? snapshot.litter.state === "OVERDUE"
                  ? "border-2 border-[var(--coral-accent)] sunlit-hero-card p-4 sm:p-5"
                  : "border-2 border-[var(--brand-coat)] sunlit-hero-card p-4 sm:p-5"
                : `border ${litterTone.border} sunlit-card p-3.5 sm:p-4`
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-btn)] bg-[var(--bg-subtle)] text-[var(--ink-primary)]"
                >
                  <Sparkles className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="font-display text-lg font-bold tracking-[-0.01em] text-[var(--ink-primary)]">
                    {UI_COPY.litter.title}
                  </h2>
                  <p className="text-xs font-medium text-[var(--ink-tertiary)]">
                    {UI_COPY.litter.cadenceHint}
                  </p>
                </div>
              </div>

              <span
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${litterTone.badge}`}
              >
                <StateIcon state={snapshot.litter.state} />
                <span className="optical-trim">{UI_COPY.litter.states[snapshot.litter.state]}</span>
              </span>
            </div>

            <p className="mt-3 max-w-prose text-sm sm:text-base text-[var(--ink-secondary)] leading-relaxed">
              {litterBody}
            </p>

            {snapshot.litter.lastCleanedBy ? (
              <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-[var(--ink-secondary)]">
                <CaregiverBadge
                  initials={snapshot.litter.lastCleanedBy.avatarInitials}
                  colorKey={snapshot.litter.lastCleanedBy.avatarColor}
                  size="sm"
                />
                <span>
                  {snapshot.litter.lastCleanedBy.displayName} •{" "}
                  {snapshot.litter.lastCleanedLabel}
                </span>
              </div>
            ) : null}

            <div className="mt-4">
              <button
                type="button"
                onClick={() => void handleCleanLitter()}
                disabled={Boolean(inFlightAction)}
                data-testid="litter-clean-cta"
                className={`inline-flex min-h-[56px] w-full items-center justify-center gap-2 rounded-[12px] px-4 font-display text-base font-bold kitchen-transition sunlit-press focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                  snapshot.litter.state === "OVERDUE"
                    ? "bg-[var(--coral-text)] text-white hover:bg-[var(--coral-strong)] focus-visible:ring-[var(--coral-text)]"
                    : snapshot.litter.state === "DUE_NOW"
                      ? "bg-[var(--brand-primary)] text-[var(--brand-on-primary)] hover:bg-[var(--brand-strong)] focus-visible:ring-[var(--ring-focus)]"
                      : "border border-[var(--border-control)] bg-[var(--bg-subtle)] text-[var(--ink-primary)] hover:bg-[var(--border-hairline)] focus-visible:ring-[var(--ring-focus)]"
                } disabled:opacity-65`}
              >
                {inFlightAction === "litter:clean" ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                    <span>{UI_COPY.litter.savingCta}</span>
                  </>
                ) : (
                  <>
                    <Check className="h-5 w-5" aria-hidden="true" />
                    <span>{UI_COPY.litter.markCleanedCta}</span>
                  </>
                )}
              </button>
            </div>

            {snapshot.litter.showLitterStockPiggyback ? (
              <div
                data-testid="litter-stock-piggyback"
                className="mt-3 rounded-[12px] border border-[var(--amber-border)] bg-[var(--amber-bg)] p-3"
              >
                <p className="text-sm font-semibold text-[var(--amber-strong)]">
                  {UI_COPY.litter.litterPiggybackQuestion}
                </p>
                <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {SUPPLY_LEVELS.map((lvl) => {
                    const isSelected = snapshot.supplies.litter.level === lvl;
                    return (
                      <button
                        key={lvl}
                        type="button"
                        disabled={Boolean(inFlightAction)}
                        onClick={() =>
                          void handleUpdateSupply("CAT_LITTER", lvl)
                        }
                        className={`min-h-[44px] rounded-[10px] border px-2 text-sm font-bold kitchen-transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--amber-text)] ${
                          isSelected
                            ? "border-[var(--amber-text)] bg-white text-[var(--amber-strong)]"
                            : "border-[var(--amber-border)] bg-white/80 text-[var(--ink-primary)] hover:bg-white"
                        }`}
                      >
                        {UI_COPY.supplies.levels[lvl]}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </article>
        </section>

        {/* CHUNK 3: Compact 2-Column Fuel Gauge Strip + Weekly Play Card */}
        <section aria-label="Supplies and Weekly Play" className="space-y-4">
          <div className="space-y-2.5">
            <h2 className="font-display text-sm font-bold text-[var(--ink-secondary)]">
              {UI_COPY.supplies.title}
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {renderSupplyStripCard(snapshot.supplies.food)}
              {renderSupplyStripCard(snapshot.supplies.litter)}
            </div>

            {expandedSupplyKey ? (
              <div
                data-testid="supply-level-editor"
                className="rounded-[var(--radius-card)] border border-[var(--border-control)] bg-[var(--bg-card)] p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-display text-sm font-bold text-[var(--ink-primary)]">
                    {UI_COPY.supplies.itemName(expandedSupplyKey)}
                  </p>
                  <button
                    type="button"
                    onClick={() => setExpandedSupplyKey(null)}
                    className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border-hairline)] text-[var(--ink-secondary)] hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)]"
                    aria-label={UI_COPY.avatarPicker.closeLabel}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {SUPPLY_LEVELS.map((lvl) => {
                    const currentLevel =
                      expandedSupplyKey === "CAT_FOOD"
                        ? snapshot.supplies.food.level
                        : snapshot.supplies.litter.level;
                    const isSelected = currentLevel === lvl;
                    return (
                      <button
                        key={lvl}
                        type="button"
                        disabled={Boolean(inFlightAction)}
                        data-testid={`supply-level-${expandedSupplyKey.toLowerCase()}-${lvl.toLowerCase()}`}
                        onClick={() =>
                          void handleUpdateSupply(expandedSupplyKey, lvl)
                        }
                        className={`min-h-[44px] rounded-[var(--radius-btn)] border px-3 text-sm font-bold kitchen-transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)] ${
                          isSelected
                            ? "border-[var(--sage-text)] bg-[var(--sage-bg)] text-[var(--sage-strong)]"
                            : "border-[var(--border-control)] bg-[var(--bg-canvas)] text-[var(--ink-primary)] hover:bg-[var(--bg-subtle)]"
                        }`}
                      >
                        {UI_COPY.supplies.levels[lvl]}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          <article
            data-testid="weekly-play-card"
            className="rounded-[var(--radius-card)] border border-[var(--border-hairline)] bg-[var(--bg-card)] sunlit-card p-4 sm:p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-btn)] bg-[var(--pink-bg)] border border-[var(--pink-border)] text-[var(--pink-text)]"
                >
                  <Footprints className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="font-display text-lg font-bold tracking-[-0.01em] text-[var(--ink-primary)]">
                    {UI_COPY.play.title}
                  </h2>
                  <p className="text-xs font-medium text-[var(--ink-tertiary)]">
                    {UI_COPY.play.bonusNote}
                  </p>
                </div>
              </div>

              {snapshot.weeklyPlay.isGoalMet ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--sage-border)] bg-[var(--sage-bg)] px-3 py-1 text-xs font-bold text-[var(--sage-strong)] tabular-nums">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="optical-trim">
                    {UI_COPY.play.goalDoneBadge} ({snapshot.weeklyPlay.count} of{" "}
                    {snapshot.weeklyPlay.target})
                  </span>
                </span>
              ) : (
                <span className="inline-flex shrink-0 items-center rounded-full border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-1 text-xs font-bold text-[var(--ink-secondary)] tabular-nums">
                  <span className="optical-trim">
                    {snapshot.weeklyPlay.count} of {snapshot.weeklyPlay.target}
                  </span>
                </span>
              )}
            </div>

            <div
              className="mt-3 grid grid-cols-3 gap-2"
              role="progressbar"
              aria-label={UI_COPY.play.title}
              aria-valuemin={0}
              aria-valuemax={snapshot.weeklyPlay.target}
              aria-valuenow={snapshot.weeklyPlay.count}
            >
              {Array.from({ length: snapshot.weeklyPlay.target }, (_, index) => {
                const stampNumber = index + 1;
                const isStamped = snapshot.weeklyPlay.count >= stampNumber;
                return (
                  <div
                    key={stampNumber}
                    className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-[var(--radius-btn)] border text-xs font-bold tabular-nums kitchen-transition ${
                      isStamped
                        ? snapshot.weeklyPlay.isGoalMet
                          ? "border-[var(--sage-border)] bg-[var(--sage-bg)] text-[var(--sage-strong)]"
                          : "border-[var(--pink-border)] bg-[var(--pink-bg)] text-[var(--pink-strong)]"
                        : "border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-[var(--ink-secondary)]"
                    }`}
                  >
                    <Footprints className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>#{stampNumber}</span>
                  </div>
                );
              })}
            </div>

            <p className="mt-3 max-w-prose text-sm text-[var(--ink-secondary)] leading-relaxed">
              {snapshot.weeklyPlay.isGoalMet
                ? UI_COPY.play.goalMetBody(snapshot.weeklyPlay.target)
                : UI_COPY.play.emptyBody}
            </p>

            {snapshot.weeklyPlay.recentEvents.length > 0 ? (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {snapshot.weeklyPlay.recentEvents.slice(0, 3).map((ev) => (
                  <span
                    key={ev.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2.5 py-1 text-xs font-medium text-[var(--ink-secondary)]"
                  >
                    <CaregiverBadge
                      initials={ev.caregiver.avatarInitials}
                      colorKey={ev.caregiver.avatarColor}
                      size="sm"
                    />
                    <span>
                      {ev.caregiver.displayName} • {ev.label}
                    </span>
                  </span>
                ))}
              </div>
            ) : null}

            <div className="mt-4">
              <button
                type="button"
                onClick={() => void handleLogPlay()}
                disabled={Boolean(inFlightAction)}
                data-testid="play-log-cta"
                className="inline-flex min-h-[56px] w-full items-center justify-center gap-2 rounded-[var(--radius-btn)] border border-[var(--border-control)] bg-[var(--bg-subtle)] px-4 font-display text-base font-bold text-[var(--ink-primary)] hover:bg-[var(--border-hairline)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)] focus-visible:ring-offset-2 disabled:opacity-65 kitchen-transition sunlit-press"
              >
                {inFlightAction === "play:log" ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                    <span>{UI_COPY.play.savingCta}</span>
                  </>
                ) : (
                  <>
                    <Footprints className="h-5 w-5 text-[var(--pink-text)]" aria-hidden="true" />
                    <span>
                      {snapshot.weeklyPlay.isGoalMet
                        ? UI_COPY.play.extraCta
                        : UI_COPY.play.cta}
                    </span>
                  </>
                )}
              </button>
            </div>
          </article>
        </section>
      </main>

      {snackbar ? (
        <div
          role="status"
          aria-live="polite"
          data-testid="bottom-undo-snackbar"
          className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-md items-center justify-between gap-2 rounded-[var(--radius-card)] bg-[var(--ink-primary)] px-4 py-3 text-white shadow-lg safe-bottom"
        >
          <span className="text-sm font-medium">{snackbar.message}</span>
          <div className="flex shrink-0 items-center gap-1.5">
            {snackbar.undoLogId ? (
              <button
                type="button"
                disabled={Boolean(inFlightAction)}
                onClick={() => {
                  if (snackbar.undoLogId) {
                    void handleUndoMeal(snackbar.undoLogId);
                  }
                }}
                className="inline-flex min-h-[44px] items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--sage-border)] bg-[var(--sage-strong)] px-3 text-xs font-bold text-white hover:bg-[var(--sage-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{UI_COPY.meals.undoCta}</span>
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setSnackbar(null)}
              aria-label={UI_COPY.avatarPicker.closeLabel}
              className="inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-sm)] text-[var(--bg-subtle)]/80 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white kitchen-transition"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}

      <AvatarPickerModal
        open={pickerOpen}
        caregivers={snapshot.caregivers}
        activeCaregiverId={activeCaregiver?.id ?? null}
        onSelect={handleSelectCaregiver}
      />

      <AvatarSwitcherSheet
        open={switcherOpen}
        caregivers={snapshot.caregivers}
        activeCaregiverId={activeCaregiver?.id ?? null}
        onSelect={handleSelectCaregiver}
        onClose={() => setSwitcherOpen(false)}
      />
    </div>
  );
}
