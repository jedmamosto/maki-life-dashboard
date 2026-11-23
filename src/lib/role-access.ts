import type { Caregiver, CaregiverRole } from "./types";

export type AppNavTab = "board" | "owner" | "setup" | "settings";

const ROLE_ALLOWED_TABS: Record<CaregiverRole, readonly AppNavTab[]> = {
  helper: ["board"],
  family: ["board", "setup"],
  owner: ["board", "owner", "setup", "settings"],
};

/**
 * Returns the navigation tabs a caregiver role may see and open.
 * Unidentified viewers default to Care Board only.
 */
export function getAllowedNavTabs(
  role: CaregiverRole | null | undefined,
): readonly AppNavTab[] {
  if (!role) {
    return ["board"];
  }
  return ROLE_ALLOWED_TABS[role] ?? ["board"];
}

/**
 * Checks whether a caregiver role can access a given app view.
 */
export function canAccessNavTab(
  role: CaregiverRole | null | undefined,
  tab: AppNavTab,
): boolean {
  return getAllowedNavTabs(role).includes(tab);
}

/**
 * Builds the Care Board path, preserving the caregiver slug when present.
 */
export function buildCareBoardPath(
  token: string,
  whoSlug?: string | null,
): string {
  const basePath = `/h/${encodeURIComponent(token)}`;
  if (!whoSlug) {
    return basePath;
  }
  return `${basePath}?who=${encodeURIComponent(whoSlug)}`;
}

/**
 * Finds an active caregiver matching a slug or id case-insensitively.
 */
export function findActiveCaregiverBySlug(
  caregivers: Caregiver[],
  slugOrId: string | null | undefined,
): Caregiver | null {
  if (!slugOrId) {
    return null;
  }
  const normalized = slugOrId.trim().toLowerCase();
  return (
    caregivers.find(
      (c) =>
        c.isActive &&
        (c.slug.toLowerCase() === normalized || c.id.toLowerCase() === normalized),
    ) ?? null
  );
}
