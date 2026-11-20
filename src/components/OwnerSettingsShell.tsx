"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import type { DashboardSnapshot } from "@/lib/types";
import { UI_COPY } from "@/lib/copy";
import { AppHeader } from "./AppHeader";
import { OwnerPinGate } from "./OwnerPinGate";
import { OwnerSettingsPanel } from "./OwnerSettingsPanel";
import { CareApiError, apiFetch, ensureHouseholdSession } from "./care-client";

interface OwnerSettingsShellProps {
  token: string;
  initialUnlocked: boolean;
  initialSnapshot: DashboardSnapshot | null;
}

export function OwnerSettingsShell({
  token,
  initialUnlocked,
  initialSnapshot,
}: OwnerSettingsShellProps) {
  const [unlocked, setUnlocked] = useState(initialUnlocked);
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(
    initialSnapshot
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);

  useEffect(() => {
    void ensureHouseholdSession(token).catch(() => {
      // Handled by PIN gate or settings fetch
    });
  }, [token]);

  const loadSnapshot = useCallback(async () => {
    setLoadingSnapshot(true);
    setLoadError(null);
    try {
      const fresh = await apiFetch<DashboardSnapshot>(token, "/api/dashboard", {
        method: "GET",
      });
      setSnapshot(fresh);
      setUnlocked(true);
    } catch (err) {
      setLoadError(
        err instanceof CareApiError
          ? err.message
          : UI_COPY.syncStates.offlineBody
      );
    } finally {
      setLoadingSnapshot(false);
    }
  }, [token]);

  const handleUnlocked = async () => {
    setUnlocked(true);
    await loadSnapshot();
  };

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] pb-12">
      <AppHeader
        token={token}
        activeTab="settings"
        manilaDateLabel={snapshot?.manilaDateLabel}
        manilaTimeLabel={snapshot?.manilaTimeLabel}
        maxWidthClass="max-w-2xl"
      />

      <main className="mx-auto max-w-2xl px-4 pt-6">
        {!unlocked ? (
          <OwnerPinGate token={token} onUnlocked={handleUnlocked} />
        ) : snapshot ? (
          <OwnerSettingsPanel
            token={token}
            initialSnapshot={snapshot}
            onLocked={() => {
              setUnlocked(false);
              setSnapshot(null);
              setLoadError(null);
            }}
          />
        ) : (
          <div
            role={loadError ? "alert" : "status"}
            className="mx-auto max-w-md rounded-[16px] border border-[var(--border-hairline)] bg-[var(--bg-card)] p-5 text-center space-y-3"
          >
            {loadError ? (
              <>
                <AlertCircle
                  className="mx-auto h-6 w-6 text-[var(--coral-text)]"
                  aria-hidden="true"
                />
                <h1 className="font-display text-lg font-bold text-[var(--coral-strong)]">
                  {UI_COPY.syncStates.offlineTitle}
                </h1>
                <p className="text-sm text-[var(--ink-secondary)]">
                  {loadError}
                </p>
                <button
                  type="button"
                  disabled={loadingSnapshot}
                  onClick={() => void loadSnapshot()}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[12px] bg-[var(--coral-text)] px-4 text-sm font-bold text-white"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  <span>{UI_COPY.syncStates.tryAgainCta}</span>
                </button>
              </>
            ) : (
              <p className="text-sm font-medium text-[var(--ink-secondary)]">
                {UI_COPY.syncStates.loadingDashboard}
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
