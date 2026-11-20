"use client";

import { useEffect, useRef } from "react";
import { Check, X } from "lucide-react";
import type { Caregiver } from "@/lib/types";
import { UI_COPY } from "@/lib/copy";
import { CaregiverBadge } from "./CaregiverBadge";

interface AvatarSwitcherSheetProps {
  open: boolean;
  caregivers: Caregiver[];
  activeCaregiverId?: string | null;
  onSelect: (caregiver: Caregiver) => void;
  onClose: () => void;
}

export function AvatarSwitcherSheet({
  open,
  caregivers,
  activeCaregiverId,
  onSelect,
  onClose,
}: AvatarSwitcherSheetProps) {
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    closeBtnRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const activeList = caregivers.filter((c) => c.isActive);
  const dailyCaregivers = activeList.filter((c) => c.role !== "owner");
  const ownerCaregivers = activeList.filter((c) => c.role === "owner");

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/45 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="avatar-switcher-title"
      data-testid="avatar-switcher-sheet"
    >
      <div
        className="absolute inset-0"
        aria-hidden="true"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md rounded-t-[24px] sm:rounded-[24px] border border-[var(--border-hairline)] bg-[var(--bg-card)] p-5 sm:p-6 safe-bottom">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--border-hairline)] sm:hidden" />

        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="avatar-switcher-title"
              className="font-display text-xl font-bold tracking-[-0.02em] text-[var(--ink-primary)]"
            >
              {UI_COPY.avatarPicker.switchTitle}
            </h2>
            <p className="mt-0.5 text-sm text-[var(--ink-secondary)]">
              {UI_COPY.avatarPicker.switchSubtitle}
            </p>
          </div>

          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            data-testid="avatar-switcher-close"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-[12px] border border-[var(--border-control)] bg-[var(--bg-subtle)] px-3 text-sm font-semibold text-[var(--ink-primary)] hover:bg-[var(--border-hairline)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sage-text)]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            <span>{UI_COPY.avatarPicker.closeLabel}</span>
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          {dailyCaregivers.map((person) => {
            const isSelected = person.id === activeCaregiverId;
            return (
              <button
                key={person.id}
                type="button"
                onClick={() => {
                  onSelect(person);
                  onClose();
                }}
                data-testid={`switcher-option-${person.slug}`}
                aria-pressed={isSelected}
                className={`flex min-h-[76px] flex-col items-start justify-between rounded-[16px] border p-3 text-left kitchen-transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sage-text)] ${
                  isSelected
                    ? "border-[var(--sage-text)] bg-[var(--sage-bg)]"
                    : "border-[var(--border-hairline)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)]"
                }`}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <CaregiverBadge
                    initials={person.avatarInitials}
                    colorKey={person.avatarColor}
                    size="sm"
                  />
                  {isSelected ? (
                    <Check
                      className="h-4 w-4 text-[var(--sage-strong)]"
                      aria-hidden="true"
                    />
                  ) : null}
                </div>
                <div className="mt-2 min-w-0 w-full">
                  <div className="truncate font-display text-sm font-bold text-[var(--ink-primary)]">
                    {person.displayName}
                  </div>
                  <div className="truncate text-xs text-[var(--ink-secondary)]">
                    {UI_COPY.avatarPicker.roles[person.role]}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {ownerCaregivers.length > 0 ? (
          <div className="mt-3 space-y-2">
            {ownerCaregivers.map((owner) => {
              const isSelected = owner.id === activeCaregiverId;
              return (
                <button
                  key={owner.id}
                  type="button"
                  onClick={() => {
                    onSelect(owner);
                    onClose();
                  }}
                  data-testid={`switcher-option-${owner.slug}`}
                  aria-pressed={isSelected}
                  className={`flex min-h-[56px] w-full items-center justify-between gap-3 rounded-[16px] border px-4 py-2.5 text-left kitchen-transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--indigo-text)] ${
                    isSelected
                      ? "border-[var(--indigo-text)] bg-[var(--indigo-bg)]"
                      : "border-[var(--indigo-border)] bg-[var(--indigo-bg)]/50 hover:bg-[var(--indigo-bg)]"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <CaregiverBadge
                      initials={owner.avatarInitials}
                      colorKey={owner.avatarColor}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <div className="truncate font-display text-sm font-bold text-[var(--ink-primary)]">
                        {owner.displayName}
                      </div>
                      <div className="truncate text-xs text-[var(--indigo-text)]">
                        {UI_COPY.avatarPicker.roles[owner.role]}
                      </div>
                    </div>
                  </div>
                  {isSelected ? (
                    <Check
                      className="h-4 w-4 shrink-0 text-[var(--indigo-text)]"
                      aria-hidden="true"
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
