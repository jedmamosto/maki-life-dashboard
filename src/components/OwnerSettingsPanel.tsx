"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Loader2,
  Lock,
  RefreshCw,
} from "lucide-react";
import type { Caregiver, DashboardSnapshot } from "@/lib/types";
import { UI_COPY } from "@/lib/copy";
import { CaregiverBadge } from "./CaregiverBadge";
import {
  CareApiError,
  apiFetch,
  copyTextSafely,
  useClientOrigin,
} from "./care-client";

interface OwnerSettingsPanelProps {
  token: string;
  initialSnapshot: DashboardSnapshot;
  onLocked: () => void;
}

interface RotateResponse {
  snapshot?: DashboardSnapshot;
  newToken?: string;
  rotatedToken?: string;
  token?: string;
}

export function OwnerSettingsPanel({
  token,
  initialSnapshot,
  onLocked,
}: OwnerSettingsPanelProps) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>(initialSnapshot);
  const [amMealTime, setAmMealTime] = useState(
    initialSnapshot.settings.amMealTime
  );
  const [pmMealTime, setPmMealTime] = useState(
    initialSnapshot.settings.pmMealTime
  );
  const [litterIntervalHours, setLitterIntervalHours] = useState(
    String(initialSnapshot.settings.litterIntervalHours)
  );
  const [weeklyPlayGoal, setWeeklyPlayGoal] = useState(
    String(initialSnapshot.settings.weeklyPlayGoal)
  );
  const [ownerEmail, setOwnerEmail] = useState(
    initialSnapshot.settings.ownerEmail
  );
  const [caregivers, setCaregivers] = useState<Caregiver[]>(
    initialSnapshot.caregivers
  );
  const [newPin, setNewPin] = useState("");
  const origin = useClientOrigin();
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [rotatedNewLink, setRotatedNewLink] = useState<string | null>(null);
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const syncFromSnapshot = (next: DashboardSnapshot) => {
    setSnapshot(next);
    setAmMealTime(next.settings.amMealTime);
    setPmMealTime(next.settings.pmMealTime);
    setLitterIntervalHours(String(next.settings.litterIntervalHours));
    setWeeklyPlayGoal(String(next.settings.weeklyPlayGoal));
    setOwnerEmail(next.settings.ownerEmail);
    setCaregivers(next.caregivers);
  };

  const handleLockSettings = async () => {
    setSavingSection("lock");
    try {
      await apiFetch<{ ok?: boolean }>(token, "/api/owner/pin", {
        method: "DELETE",
      });
    } catch {
      // Lock client view even if cookie already cleared
    } finally {
      setSavingSection(null);
      onLocked();
    }
  };

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSection("schedule");
    setErrorBanner(null);
    setStatusMessage(null);
    try {
      const result = await apiFetch<{ snapshot: DashboardSnapshot }>(
        token,
        "/api/owner/settings",
        {
          method: "PATCH",
          body: JSON.stringify({
            amMealTime,
            pmMealTime,
            litterIntervalHours: Number(litterIntervalHours),
            weeklyPlayGoal: Number(weeklyPlayGoal),
            ownerEmail: ownerEmail.trim(),
          }),
        }
      );
      if (result.snapshot) {
        syncFromSnapshot(result.snapshot);
      }
      setStatusMessage(UI_COPY.ownerSettings.savedSettings);
    } catch (err) {
      if (err instanceof CareApiError && err.status === 401) {
        onLocked();
        return;
      }
      setErrorBanner(
        err instanceof CareApiError
          ? err.message
          : UI_COPY.syncStates.offlineBody
      );
    } finally {
      setSavingSection(null);
    }
  };

  const handleSaveRoster = async () => {
    setSavingSection("roster");
    setErrorBanner(null);
    setStatusMessage(null);
    try {
      const result = await apiFetch<{ snapshot: DashboardSnapshot }>(
        token,
        "/api/owner/settings",
        {
          method: "PATCH",
          body: JSON.stringify({
            caregivers: caregivers.map((c) => ({
              id: c.id,
              slug: c.slug,
              displayName: c.displayName.trim() || c.slug,
              role: c.role,
              avatarInitials:
                (c.displayName.trim().slice(0, 2) || c.avatarInitials).toUpperCase(),
              avatarColor: c.avatarColor,
              isActive: c.isActive,
            })),
          }),
        }
      );
      if (result.snapshot) {
        syncFromSnapshot(result.snapshot);
      }
      setStatusMessage(UI_COPY.ownerSettings.savedSettings);
    } catch (err) {
      if (err instanceof CareApiError && err.status === 401) {
        onLocked();
        return;
      }
      setErrorBanner(
        err instanceof CareApiError
          ? err.message
          : UI_COPY.syncStates.offlineBody
      );
    } finally {
      setSavingSection(null);
    }
  };

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(newPin)) {
      setErrorBanner(UI_COPY.ownerSettings.pinMalformed);
      return;
    }
    setSavingSection("pin");
    setErrorBanner(null);
    setStatusMessage(null);
    try {
      const result = await apiFetch<{ snapshot?: DashboardSnapshot }>(
        token,
        "/api/owner/settings",
        {
          method: "PATCH",
          body: JSON.stringify({ newPin }),
        }
      );
      if (result.snapshot) {
        syncFromSnapshot(result.snapshot);
      }
      setNewPin("");
      setStatusMessage(UI_COPY.ownerSettings.savedSettings);
    } catch (err) {
      setErrorBanner(
        err instanceof CareApiError
          ? err.message
          : UI_COPY.syncStates.offlineBody
      );
    } finally {
      setSavingSection(null);
    }
  };

  const handleRotateToken = async () => {
    setSavingSection("rotate");
    setErrorBanner(null);
    setStatusMessage(null);
    try {
      const result = await apiFetch<RotateResponse>(
        token,
        "/api/owner/settings",
        {
          method: "PATCH",
          body: JSON.stringify({ rotateToken: true }),
        }
      );
      const nextToken =
        result.newToken ?? result.rotatedToken ?? result.token ?? null;
      setConfirmRotate(false);
      if (nextToken) {
        const nextUrl = `${origin}/h/${encodeURIComponent(nextToken)}`;
        setRotatedNewLink(nextUrl);
        setStatusMessage("New home link created. Share it with your family.");
        router.replace(`/h/${encodeURIComponent(nextToken)}/settings`);
      } else {
        setStatusMessage(UI_COPY.ownerSettings.savedSettings);
      }
    } catch (err) {
      setErrorBanner(
        err instanceof CareApiError
          ? err.message
          : UI_COPY.syncStates.offlineBody
      );
    } finally {
      setSavingSection(null);
    }
  };

  const handleCopyPersonLink = async (person: Caregiver) => {
    const url = `${origin}/h/${encodeURIComponent(token)}?who=${encodeURIComponent(person.slug)}`;
    const ok = await copyTextSafely(url);
    if (ok) {
      setCopiedSlug(person.slug);
      setTimeout(() => setCopiedSlug(null), 2500);
    }
  };

  return (
    <div data-testid="owner-settings-panel" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-[-0.02em] text-[var(--ink-primary)]">
            {UI_COPY.ownerSettings.settingsTitle}
          </h1>
          <p className="text-xs font-medium text-[var(--ink-tertiary)] tabular-nums">
            Timezone: {snapshot.settings.householdTimezone}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleLockSettings()}
          disabled={Boolean(savingSection)}
          data-testid="lock-settings-cta"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-[12px] border border-[var(--border-control)] bg-[var(--bg-card)] px-4 text-sm font-bold text-[var(--ink-primary)] hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--indigo-text)]"
        >
          <Lock className="h-4 w-4" aria-hidden="true" />
          <span>{UI_COPY.ownerSettings.lockCta}</span>
        </button>
      </div>

      {statusMessage ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-[12px] border border-[var(--sage-border)] bg-[var(--sage-bg)] p-3.5 text-sm font-semibold text-[var(--sage-strong)]"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{statusMessage}</span>
        </div>
      ) : null}

      {errorBanner ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-[12px] border border-[var(--coral-border)] bg-[var(--coral-bg)] p-3.5 text-sm font-medium text-[var(--coral-strong)]"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{errorBanner}</span>
        </div>
      ) : null}

      {/* Schedule & Alert Email */}
      <form
        onSubmit={(e) => void handleSaveSchedule(e)}
        className="rounded-[16px] border border-[var(--border-hairline)] bg-[var(--bg-card)] p-4 sm:p-5 space-y-4"
      >
        <h2 className="font-display text-lg font-bold text-[var(--ink-primary)]">
          Meal Times and Goals
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="am-meal-time"
              className="block text-sm font-semibold text-[var(--ink-primary)]"
            >
              AM Meal Time
            </label>
            <input
              id="am-meal-time"
              type="time"
              required
              value={amMealTime}
              onChange={(e) => setAmMealTime(e.target.value)}
              className="mt-1.5 min-h-[44px] w-full rounded-[12px] border border-[var(--border-control)] bg-[var(--bg-canvas)] px-3 text-base text-[var(--ink-primary)] tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sage-text)]"
            />
          </div>

          <div>
            <label
              htmlFor="pm-meal-time"
              className="block text-sm font-semibold text-[var(--ink-primary)]"
            >
              PM Meal Time
            </label>
            <input
              id="pm-meal-time"
              type="time"
              required
              value={pmMealTime}
              onChange={(e) => setPmMealTime(e.target.value)}
              className="mt-1.5 min-h-[44px] w-full rounded-[12px] border border-[var(--border-control)] bg-[var(--bg-canvas)] px-3 text-base text-[var(--ink-primary)] tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sage-text)]"
            />
          </div>

          <div>
            <label
              htmlFor="litter-hours"
              className="block text-sm font-semibold text-[var(--ink-primary)]"
            >
              Litter Interval (Hours)
            </label>
            <input
              id="litter-hours"
              type="number"
              min={12}
              max={168}
              required
              value={litterIntervalHours}
              onChange={(e) => setLitterIntervalHours(e.target.value)}
              className="mt-1.5 min-h-[44px] w-full rounded-[12px] border border-[var(--border-control)] bg-[var(--bg-canvas)] px-3 text-base text-[var(--ink-primary)] tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sage-text)]"
            />
          </div>

          <div>
            <label
              htmlFor="weekly-play-goal"
              className="block text-sm font-semibold text-[var(--ink-primary)]"
            >
              Weekly Play Goal
            </label>
            <input
              id="weekly-play-goal"
              type="number"
              min={1}
              max={14}
              required
              value={weeklyPlayGoal}
              onChange={(e) => setWeeklyPlayGoal(e.target.value)}
              className="mt-1.5 min-h-[44px] w-full rounded-[12px] border border-[var(--border-control)] bg-[var(--bg-canvas)] px-3 text-base text-[var(--ink-primary)] tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sage-text)]"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="owner-email"
            className="block text-sm font-semibold text-[var(--ink-primary)]"
          >
            Owner Alert Email
          </label>
          <input
            id="owner-email"
            type="email"
            value={ownerEmail}
            onChange={(e) => setOwnerEmail(e.target.value)}
            className="mt-1.5 min-h-[44px] w-full rounded-[12px] border border-[var(--border-control)] bg-[var(--bg-canvas)] px-3 text-base text-[var(--ink-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sage-text)]"
          />
        </div>

        <button
          type="submit"
          disabled={Boolean(savingSection)}
          data-testid="save-schedule-cta"
          className="inline-flex min-h-[56px] w-full items-center justify-center gap-2 rounded-[12px] bg-[var(--sage-text)] px-4 font-display text-base font-bold text-white hover:bg-[var(--sage-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sage-text)] focus-visible:ring-offset-2 disabled:opacity-65"
        >
          {savingSection === "schedule" ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          ) : null}
          <span>Save Schedule and Email</span>
        </button>
      </form>

      {/* Household People & Personal Links */}
      <section
        aria-label="Household People"
        className="rounded-[16px] border border-[var(--border-hairline)] bg-[var(--bg-card)] p-4 sm:p-5 space-y-4"
      >
        <h2 className="font-display text-lg font-bold text-[var(--ink-primary)]">
          Household People
        </h2>

        <div className="space-y-3">
          {caregivers.map((person, index) => (
            <div
              key={person.id}
              className="rounded-[12px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3 space-y-2.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <CaregiverBadge
                    initials={person.avatarInitials}
                    colorKey={person.avatarColor}
                    size="sm"
                  />
                  <span className="text-xs font-bold uppercase tracking-wide text-[var(--ink-tertiary)]">
                    {UI_COPY.avatarPicker.roles[person.role]}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => void handleCopyPersonLink(person)}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[10px] border border-[var(--border-control)] bg-white px-3 text-xs font-bold text-[var(--ink-primary)] hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sage-text)]"
                >
                  {copiedSlug === person.slug ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-[var(--sage-text)]" aria-hidden="true" />
                      <span>{UI_COPY.setupView.copiedLinkCta}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Copy Link</span>
                    </>
                  )}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label className="sr-only" htmlFor={`caregiver-name-${person.id}`}>
                  Name for {person.slug}
                </label>
                <input
                  id={`caregiver-name-${person.id}`}
                  type="text"
                  value={person.displayName}
                  onChange={(e) => {
                    const value = e.target.value;
                    setCaregivers((prev) =>
                      prev.map((item, i) =>
                        i === index ? { ...item, displayName: value } : item
                      )
                    );
                  }}
                  className="min-h-[44px] flex-1 min-w-[160px] rounded-[10px] border border-[var(--border-control)] bg-white px-3 text-sm font-semibold text-[var(--ink-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sage-text)]"
                />

                <label className="inline-flex min-h-[44px] items-center gap-2 rounded-[10px] border border-[var(--border-hairline)] bg-white px-3 text-xs font-bold text-[var(--ink-primary)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={person.isActive}
                    disabled={person.role === "owner"}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setCaregivers((prev) =>
                        prev.map((item, i) =>
                          i === index ? { ...item, isActive: checked } : item
                        )
                      );
                    }}
                    className="h-4 w-4 accent-[var(--sage-text)]"
                  />
                  <span>Active</span>
                </label>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          disabled={Boolean(savingSection)}
          onClick={() => void handleSaveRoster()}
          className="inline-flex min-h-[56px] w-full items-center justify-center gap-2 rounded-[12px] border border-[var(--border-control)] bg-[var(--bg-subtle)] px-4 font-display text-base font-bold text-[var(--ink-primary)] hover:bg-[var(--border-hairline)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sage-text)] disabled:opacity-65"
        >
          {savingSection === "roster" ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          ) : null}
          <span>Save People</span>
        </button>
      </section>

      {/* Change PIN */}
      <form
        onSubmit={(e) => void handleSavePin(e)}
        className="rounded-[16px] border border-[var(--border-hairline)] bg-[var(--bg-card)] p-4 sm:p-5 space-y-3"
      >
        <h2 className="font-display text-lg font-bold text-[var(--ink-primary)]">
          Change 4-Digit Owner PIN
        </h2>
        <div className="flex flex-wrap gap-3">
          <label htmlFor="new-owner-pin" className="sr-only">
            New 4-Digit PIN
          </label>
          <input
            id="new-owner-pin"
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={newPin}
            onChange={(e) =>
              setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))
            }
            placeholder="New 4 digits"
            className="min-h-[44px] flex-1 min-w-[160px] rounded-[12px] border border-[var(--border-control)] bg-[var(--bg-canvas)] px-3 text-base text-[var(--ink-primary)] tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--indigo-text)]"
          />
          <button
            type="submit"
            disabled={Boolean(savingSection)}
            className="inline-flex min-h-[44px] items-center justify-center rounded-[12px] bg-[var(--indigo-text)] px-5 text-sm font-bold text-white hover:bg-[var(--indigo-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--indigo-text)] disabled:opacity-65"
          >
            Update PIN
          </button>
        </div>
      </form>

      {/* Rotate Secret Home Link */}
      <section
        aria-label="Rotate Secret Home Link"
        className="rounded-[16px] border border-[var(--coral-border)] bg-[var(--coral-bg)] p-4 sm:p-5 space-y-3"
      >
        <h2 className="font-display text-lg font-bold text-[var(--coral-strong)]">
          Create a New Home Link
        </h2>
        <p className="text-sm text-[var(--ink-primary)]">
          {UI_COPY.ownerSettings.rotateWarning}
        </p>

        {rotatedNewLink ? (
          <input
            type="text"
            readOnly
            value={rotatedNewLink}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="New Home Link"
            className="w-full rounded-[12px] border border-[var(--sage-border)] bg-white px-3 py-2.5 text-sm font-semibold text-[var(--ink-primary)]"
          />
        ) : null}

        {!confirmRotate ? (
          <button
            type="button"
            disabled={Boolean(savingSection)}
            onClick={() => setConfirmRotate(true)}
            data-testid="rotate-token-start-cta"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-[12px] border border-[var(--coral-border)] bg-white px-4 text-sm font-bold text-[var(--coral-strong)] hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--coral-text)]"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            <span>Rotate Home Link</span>
          </button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={Boolean(savingSection)}
              onClick={() => void handleRotateToken()}
              data-testid="rotate-token-confirm-cta"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-[12px] bg-[var(--coral-text)] px-4 text-sm font-bold text-white hover:bg-[var(--coral-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--coral-text)]"
            >
              {savingSection === "rotate" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              <span>Yes, Create New Link</span>
            </button>
            <button
              type="button"
              disabled={Boolean(savingSection)}
              onClick={() => setConfirmRotate(false)}
              className="inline-flex min-h-[44px] items-center rounded-[12px] border border-[var(--border-control)] bg-white px-4 text-sm font-bold text-[var(--ink-primary)] hover:bg-[var(--bg-subtle)]"
            >
              Cancel
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
