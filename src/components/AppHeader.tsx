"use client";

import Link from "next/link";
import { Cat, ChevronDown, Settings } from "lucide-react";
import { canAccessNavTab, type AppNavTab } from "@/lib/role-access";
import type { Caregiver, CaregiverRole } from "@/lib/types";
import { UI_COPY } from "@/lib/copy";
import { CaregiverBadge } from "./CaregiverBadge";

export type ActiveNavTab = AppNavTab;

interface AppHeaderProps {
  token: string;
  activeTab: ActiveNavTab;
  manilaDateLabel?: string;
  manilaTimeLabel?: string;
  activeCaregiver?: Caregiver | null;
  onOpenSwitcher?: () => void;
  maxWidthClass?: "max-w-2xl" | "max-w-4xl";
}

export function AppHeader({
  token,
  activeTab,
  manilaDateLabel,
  manilaTimeLabel,
  activeCaregiver,
  onOpenSwitcher,
  maxWidthClass = "max-w-2xl",
}: AppHeaderProps) {
  const basePath = `/h/${encodeURIComponent(token)}`;
  const whoQuery = activeCaregiver
    ? `?who=${encodeURIComponent(activeCaregiver.slug)}`
    : "";

  const effectiveRole: CaregiverRole | null =
    activeCaregiver?.role ?? (activeTab !== "board" ? "owner" : null);

  const allNavItems: Array<{
    key: Exclude<ActiveNavTab, "settings">;
    label: string;
    href: string;
  }> = [
    { key: "board", label: UI_COPY.brandBoardNav, href: `${basePath}${whoQuery}` },
    { key: "owner", label: UI_COPY.brandOwnerNav, href: `${basePath}/owner${whoQuery}` },
    {
      key: "setup",
      label: UI_COPY.brandSetupNav,
      href: `${basePath}/setup${whoQuery}`,
    },
  ];

  const navItems = allNavItems.filter((item) =>
    canAccessNavTab(effectiveRole, item.key)
  );
  const canAccessSettings = canAccessNavTab(effectiveRole, "settings");
  const navGridColsClass = navItems.length === 2 ? "grid-cols-2" : "grid-cols-3";

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border-hairline)] bg-[var(--bg-canvas)]/95 backdrop-blur-sm safe-top">
      <div className={`mx-auto ${maxWidthClass} px-4 pt-3 pb-2.5`}>
        <div className="flex items-center justify-between gap-2">
          <Link
            href={`${basePath}${whoQuery}`}
            className="flex min-h-[44px] min-w-0 items-center gap-2.5 rounded-[12px] pr-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sage-text)]"
          >
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[var(--sage-text)] text-white"
            >
              <Cat className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-display text-lg font-bold tracking-[-0.02em] text-[var(--ink-primary)] leading-tight">
                {UI_COPY.brandTitle}
              </span>
              {manilaDateLabel && manilaTimeLabel ? (
                <span className="block truncate text-xs font-medium text-[var(--ink-tertiary)] tabular-nums">
                  {manilaDateLabel} • {manilaTimeLabel}
                </span>
              ) : null}
            </span>
          </Link>

          <div className="flex shrink-0 items-center gap-2">
            {onOpenSwitcher ? (
              <button
                type="button"
                onClick={onOpenSwitcher}
                data-testid="caregiver-switcher-trigger"
                aria-label={
                  activeCaregiver
                    ? `${activeCaregiver.displayName}, ${UI_COPY.avatarPicker.switchTitle}`
                    : UI_COPY.avatarPicker.switchTitle
                }
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[var(--border-control)] bg-[var(--bg-card)] pl-1.5 pr-3 py-1 text-sm font-semibold text-[var(--ink-primary)] hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sage-text)] kitchen-transition"
              >
                {activeCaregiver ? (
                  <>
                    <CaregiverBadge
                      initials={activeCaregiver.avatarInitials}
                      colorKey={activeCaregiver.avatarColor}
                      size="sm"
                    />
                    <span className="max-w-[76px] truncate sm:max-w-[120px]">
                      {activeCaregiver.displayName}
                    </span>
                  </>
                ) : (
                  <span className="px-1.5">{UI_COPY.avatarPicker.switchTitle}</span>
                )}
                <ChevronDown
                  className="h-4 w-4 text-[var(--ink-secondary)]"
                  aria-hidden="true"
                />
              </button>
            ) : null}

            {canAccessSettings ? (
              <Link
                href={`${basePath}/settings${whoQuery}`}
                aria-label={UI_COPY.ownerSettings.settingsTitle}
                aria-current={activeTab === "settings" ? "page" : undefined}
                className={`inline-flex h-11 w-11 items-center justify-center rounded-[12px] border kitchen-transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sage-text)] ${
                  activeTab === "settings"
                    ? "border-[var(--indigo-border)] bg-[var(--indigo-bg)] text-[var(--indigo-text)]"
                    : "border-[var(--border-hairline)] bg-[var(--bg-card)] text-[var(--ink-secondary)] hover:bg-[var(--bg-subtle)]"
                }`}
              >
                <Settings className="h-5 w-5" aria-hidden="true" />
              </Link>
            ) : null}
          </div>
        </div>

        {navItems.length > 1 ? (
          <nav
            aria-label="Household Views"
            className={`mt-2.5 grid ${navGridColsClass} gap-2`}
          >
            {navItems.map((item) => {
              const isActive = activeTab === item.key;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`inline-flex min-h-[44px] items-center justify-center rounded-[12px] border px-2 text-center text-xs sm:text-sm font-semibold kitchen-transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sage-text)] ${
                    isActive
                      ? "border-[var(--sage-border)] bg-[var(--sage-bg)] text-[var(--sage-strong)]"
                      : "border-[var(--border-hairline)] bg-[var(--bg-card)] text-[var(--ink-secondary)] hover:bg-[var(--bg-subtle)]"
                  }`}
                >
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        ) : null}
      </div>
    </header>
  );
}
