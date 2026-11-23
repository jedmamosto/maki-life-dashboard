import { describe, expect, it } from "vitest";
import { DEFAULT_CAREGIVERS } from "@/lib/domain";
import {
  buildCareBoardPath,
  canAccessNavTab,
  findActiveCaregiverBySlug,
  getAllowedNavTabs,
} from "@/lib/role-access";

describe("role-access helpers", () => {
  it("grants helper access to Care Board only", () => {
    expect(getAllowedNavTabs("helper")).toEqual(["board"]);
    expect(canAccessNavTab("helper", "board")).toBe(true);
    expect(canAccessNavTab("helper", "owner")).toBe(false);
    expect(canAccessNavTab("helper", "setup")).toBe(false);
    expect(canAccessNavTab("helper", "settings")).toBe(false);
  });

  it("grants family access to Care Board and Phone Setup only", () => {
    expect(getAllowedNavTabs("family")).toEqual(["board", "setup"]);
    expect(canAccessNavTab("family", "board")).toBe(true);
    expect(canAccessNavTab("family", "setup")).toBe(true);
    expect(canAccessNavTab("family", "owner")).toBe(false);
    expect(canAccessNavTab("family", "settings")).toBe(false);
  });

  it("grants owner full access to Care Board, Owner View, Phone Setup, and Settings", () => {
    expect(getAllowedNavTabs("owner")).toEqual([
      "board",
      "owner",
      "setup",
      "settings",
    ]);
    expect(canAccessNavTab("owner", "board")).toBe(true);
    expect(canAccessNavTab("owner", "owner")).toBe(true);
    expect(canAccessNavTab("owner", "setup")).toBe(true);
    expect(canAccessNavTab("owner", "settings")).toBe(true);
  });

  it("defaults unidentified viewers to Care Board only", () => {
    expect(getAllowedNavTabs(null)).toEqual(["board"]);
    expect(getAllowedNavTabs(undefined)).toEqual(["board"]);
    expect(canAccessNavTab(null, "board")).toBe(true);
    expect(canAccessNavTab(null, "owner")).toBe(false);
    expect(canAccessNavTab(undefined, "setup")).toBe(false);
    expect(canAccessNavTab(null, "settings")).toBe(false);
  });

  it("builds Care Board paths with optional encoded caregiver slug", () => {
    expect(buildCareBoardPath("tok 1")).toBe("/h/tok%201");
    expect(buildCareBoardPath("tok-1", "joy")).toBe("/h/tok-1?who=joy");
  });

  it("finds active caregivers by slug or id case-insensitively and ignores inactive", () => {
    const caregivers = [
      ...DEFAULT_CAREGIVERS,
      {
        id: "joy-id",
        slug: "joy",
        displayName: "Joy",
        role: "helper" as const,
        avatarInitials: "JY",
        avatarColor: "helper" as const,
        isActive: false,
      },
    ];

    expect(findActiveCaregiverBySlug(caregivers, "JED")?.id).toBe("jed");
    expect(findActiveCaregiverBySlug(caregivers, "mom")?.role).toBe("family");
    expect(findActiveCaregiverBySlug(caregivers, "joy")).toBeNull();
    expect(findActiveCaregiverBySlug(caregivers, "")).toBeNull();
  });
});
