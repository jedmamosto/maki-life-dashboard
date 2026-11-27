"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { Check } from "lucide-react";
import type { Caregiver } from "@/lib/types";
import { UI_COPY } from "@/lib/copy";
import { CaregiverBadge } from "./CaregiverBadge";

interface AvatarPickerModalProps {
  open: boolean;
  caregivers: Caregiver[];
  activeCaregiverId?: string | null;
  onSelect: (caregiver: Caregiver) => void;
}

export function AvatarPickerModal({
  open,
  caregivers,
  activeCaregiverId,
  onSelect,
}: AvatarPickerModalProps) {
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

  const activeList = caregivers.filter((c) => c.isActive);
  const dailyCaregivers = activeList.filter((c) => c.role !== "owner");
  const ownerCaregivers = activeList.filter((c) => c.role === "owner");

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="avatar-picker-title"
      data-testid="avatar-picker-modal"
      {...({ closedby: "none" } as Record<string, string>)}
      onCancel={(e) => {
        e.preventDefault();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-[var(--radius-sheet)] border border-[var(--border-hairline)] bg-[var(--bg-card)] p-0 text-[var(--ink-primary)] sunlit-card"
    >
      <div className="p-5 sm:p-6">
        <div className="flex items-center gap-3.5">
          <div className="shrink-0 rounded-[var(--radius-card)] border border-[var(--border-hairline)] bg-white p-1 sunlit-polaroid -rotate-1">
            <Image
              src="/maki/maki-portrait.jpg"
              alt=""
              aria-hidden="true"
              width={104}
              height={104}
              loading="eager"
              className="h-14 w-14 rounded-[var(--radius-btn)] object-cover object-[50%_32%]"
            />
          </div>
          <div className="min-w-0">
            <h1
              id="avatar-picker-title"
              className="font-display text-xl font-bold tracking-[-0.02em] text-[var(--ink-primary)]"
            >
              {UI_COPY.avatarPicker.title}
            </h1>
            <p className="text-sm text-[var(--ink-secondary)]">
              {UI_COPY.avatarPicker.subtitle}
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          {dailyCaregivers.map((person, index) => {
            const isSelected = person.id === activeCaregiverId;
            return (
              <button
                key={person.id}
                type="button"
                autoFocus={index === 0}
                onClick={() => onSelect(person)}
                data-testid={`avatar-option-${person.slug}`}
                aria-pressed={isSelected}
                className={`flex min-h-[84px] flex-col items-start justify-between rounded-[var(--radius-card)] border p-3.5 text-left kitchen-transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)] ${
                  isSelected
                    ? "border-[var(--sage-text)] bg-[var(--sage-bg)]"
                    : "border-[var(--border-hairline)] bg-[var(--bg-canvas)] hover:border-[var(--border-control)] hover:bg-[var(--bg-subtle)]"
                }`}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <CaregiverBadge
                    initials={person.avatarInitials}
                    colorKey={person.avatarColor}
                    size="md"
                  />
                  {isSelected ? (
                    <Check
                      className="h-4 w-4 text-[var(--sage-strong)]"
                      aria-hidden="true"
                    />
                  ) : null}
                </div>
                <div className="mt-2.5 min-w-0 w-full">
                  <div className="truncate font-display text-base font-bold text-[var(--ink-primary)]">
                    {person.displayName}
                  </div>
                  <div className="truncate text-xs font-medium text-[var(--ink-secondary)]">
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
                  onClick={() => onSelect(owner)}
                  data-testid={`avatar-option-${owner.slug}`}
                  aria-pressed={isSelected}
                  className={`flex min-h-[64px] w-full items-center justify-between gap-3 rounded-[var(--radius-card)] border px-4 py-3 text-left kitchen-transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)] ${
                    isSelected
                      ? "border-[var(--brand-primary)] bg-[var(--brand-bg)]"
                      : "border-[var(--border-hairline)] bg-[var(--bg-canvas)] hover:border-[var(--border-control)] hover:bg-[var(--bg-subtle)]"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <CaregiverBadge
                      initials={owner.avatarInitials}
                      colorKey={owner.avatarColor}
                      size="md"
                    />
                    <div className="min-w-0">
                      <div className="truncate font-display text-base font-bold text-[var(--ink-primary)]">
                        {owner.displayName}
                      </div>
                      <div className="truncate text-xs font-medium text-[var(--ink-secondary)]">
                        {UI_COPY.avatarPicker.roles[owner.role]}
                      </div>
                    </div>
                  </div>
                  {isSelected ? (
                    <Check
                      className="h-5 w-5 shrink-0 text-[var(--brand-primary)]"
                      aria-hidden="true"
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}

        <p className="mt-4 text-center text-xs font-medium text-[var(--ink-tertiary)]">
          {UI_COPY.avatarPicker.reassurance}
        </p>
      </div>
    </dialog>
  );
}
