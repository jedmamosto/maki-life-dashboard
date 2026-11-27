"use client";

import { useEffect, useRef } from "react";
import { Check, X } from "lucide-react";
import type { Caregiver } from "@/lib/types";
import { UI_COPY } from "@/lib/copy";
import { CaregiverBadge } from "./CaregiverBadge";
import { MakiCatIcon } from "./MakiCatIcon";

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
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Progressive fallback for browsers without native dialog closedby="any" (Safari)
  useEffect(() => {
    const dialog = dialogRef.current;
    if (
      !dialog ||
      typeof HTMLDialogElement === "undefined" ||
      "closedBy" in HTMLDialogElement.prototype
    ) {
      return;
    }

    const isOutside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      );
    };

    let pressedOutside = false;
    const onPointerDown = (e: PointerEvent) => {
      pressedOutside = isOutside(e);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e)) {
        dialog.close();
      }
      pressedOutside = false;
    };

    dialog.addEventListener("pointerdown", onPointerDown);
    dialog.addEventListener("pointerup", onPointerUp);
    return () => {
      dialog.removeEventListener("pointerdown", onPointerDown);
      dialog.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  const activeList = caregivers.filter((c) => c.isActive);
  const dailyCaregivers = activeList.filter((c) => c.role !== "owner");
  const ownerCaregivers = activeList.filter((c) => c.role === "owner");

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="avatar-switcher-title"
      data-testid="avatar-switcher-sheet"
      {...({ closedby: "any" } as Record<string, string>)}
      onClose={() => {
        if (open) {
          onClose();
        }
      }}
      className="max-sm:mb-0 max-sm:mt-auto max-sm:w-full max-sm:max-w-none max-sm:rounded-t-[var(--radius-sheet)] max-sm:rounded-b-none sm:m-auto sm:w-[calc(100%-2rem)] sm:max-w-md sm:rounded-[var(--radius-sheet)] border border-[var(--border-hairline)] bg-[var(--bg-card)] p-0 text-[var(--ink-primary)] sunlit-card"
    >
      <div className="p-5 sm:p-6 safe-bottom">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--border-hairline)] sm:hidden" />

        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <MakiCatIcon className="h-6 w-6 shrink-0" />
            <div className="min-w-0">
              <h1
                id="avatar-switcher-title"
                className="font-display text-xl font-bold tracking-[-0.02em] text-[var(--ink-primary)]"
              >
                {UI_COPY.avatarPicker.switchTitle}
              </h1>
              <p className="mt-0.5 text-sm text-[var(--ink-secondary)]">
                {UI_COPY.avatarPicker.switchSubtitle}
              </p>
            </div>
          </div>

          <button
            type="button"
            autoFocus
            onClick={onClose}
            data-testid="avatar-switcher-close"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-[var(--radius-btn)] border border-[var(--border-control)] bg-[var(--bg-subtle)] px-3 text-sm font-semibold text-[var(--ink-primary)] hover:bg-[var(--border-hairline)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)] kitchen-transition"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            <span className="optical-trim">{UI_COPY.avatarPicker.closeLabel}</span>
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
                className={`flex min-h-[76px] flex-col items-start justify-between rounded-[var(--radius-card)] border p-3 text-left kitchen-transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)] ${
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
                  className={`flex min-h-[56px] w-full items-center justify-between gap-3 rounded-[var(--radius-card)] border px-4 py-2.5 text-left kitchen-transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)] ${
                    isSelected
                      ? "border-[var(--brand-primary)] bg-[var(--brand-bg)]"
                      : "border-[var(--border-hairline)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)]"
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
                      <div className="truncate text-xs text-[var(--ink-secondary)]">
                        {UI_COPY.avatarPicker.roles[owner.role]}
                      </div>
                    </div>
                  </div>
                  {isSelected ? (
                    <Check
                      className="h-4 w-4 shrink-0 text-[var(--brand-primary)]"
                      aria-hidden="true"
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </dialog>
  );
}
