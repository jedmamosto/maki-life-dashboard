"use client";

import Image from "next/image";
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
  if (!open) {
    return null;
  }

  const activeList = caregivers.filter((c) => c.isActive);
  const dailyCaregivers = activeList.filter((c) => c.role !== "owner");
  const ownerCaregivers = activeList.filter((c) => c.role === "owner");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-scrim)] px-4 py-6 backdrop-blur-[2px] safe-top safe-bottom"
      role="dialog"
      aria-modal="true"
      aria-labelledby="avatar-picker-title"
      data-testid="avatar-picker-modal"
    >
      <div className="w-full max-w-md rounded-[24px] border border-[var(--border-hairline)] bg-[var(--bg-card)] p-5 sm:p-6">
        <div className="flex items-center gap-3.5">
          <Image
            src="/maki/maki-portrait.jpg"
            alt=""
            aria-hidden="true"
            width={104}
            height={104}
            className="h-13 w-13 shrink-0 rounded-full object-cover object-[50%_32%] ring-2 ring-[var(--brand-border)]"
          />
          <div>
            <h2
              id="avatar-picker-title"
              className="font-display text-xl font-bold tracking-[-0.02em] text-[var(--ink-primary)]"
            >
              {UI_COPY.avatarPicker.title}
            </h2>
            <p className="text-sm text-[var(--ink-secondary)]">
              {UI_COPY.avatarPicker.subtitle}
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          {dailyCaregivers.map((person) => {
            const isSelected = person.id === activeCaregiverId;
            return (
              <button
                key={person.id}
                type="button"
                onClick={() => onSelect(person)}
                data-testid={`avatar-option-${person.slug}`}
                aria-pressed={isSelected}
                className={`flex min-h-[84px] flex-col items-start justify-between rounded-[16px] border p-3.5 text-left kitchen-transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sage-text)] ${
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
                  className={`flex min-h-[64px] w-full items-center justify-between gap-3 rounded-[16px] border px-4 py-3 text-left kitchen-transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--indigo-text)] ${
                    isSelected
                      ? "border-[var(--indigo-text)] bg-[var(--indigo-bg)]"
                      : "border-[var(--indigo-border)] bg-[var(--indigo-bg)]/50 hover:bg-[var(--indigo-bg)]"
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
                      <div className="truncate text-xs font-medium text-[var(--indigo-text)]">
                        {UI_COPY.avatarPicker.roles[owner.role]}
                      </div>
                    </div>
                  </div>
                  {isSelected ? (
                    <Check
                      className="h-5 w-5 shrink-0 text-[var(--indigo-text)]"
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
    </div>
  );
}
