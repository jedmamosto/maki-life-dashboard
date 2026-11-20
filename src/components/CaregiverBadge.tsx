import type { AvatarColorKey } from "@/lib/types";
import { AVATAR_COLOR_MAP } from "./care-client";

interface CaregiverBadgeProps {
  initials: string;
  colorKey: AvatarColorKey;
  size?: "sm" | "md" | "lg";
  decorative?: boolean;
  label?: string;
}

const SIZE_CLASSES: Record<NonNullable<CaregiverBadgeProps["size"]>, string> = {
  sm: "h-7 w-7 text-[11px]",
  md: "h-9 w-9 text-xs",
  lg: "h-11 w-11 text-sm",
};

export function CaregiverBadge({
  initials,
  colorKey,
  size = "md",
  decorative = true,
  label,
}: CaregiverBadgeProps) {
  const cleanInitials = initials.slice(0, 2).toUpperCase();

  return (
    <span
      aria-hidden={decorative ? "true" : undefined}
      aria-label={!decorative ? label ?? cleanInitials : undefined}
      style={{ backgroundColor: AVATAR_COLOR_MAP[colorKey] }}
      className={`${SIZE_CLASSES[size]} inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold tracking-tight text-white select-none`}
    >
      {cleanInitials}
    </span>
  );
}
