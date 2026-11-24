import { describe, expect, it } from "vitest";
import type { CareRepository } from "@/lib/types";

export function runCareRepositoryContractSuite(
  name: string,
  createRepo: () => Promise<CareRepository> | CareRepository,
): void {
  describe(`CareRepository Contract (${name})`, () => {
    it("[AC-034] seeds default caregivers, supplies, and Manila settings", async () => {
      const repo = await createRepo();
      const caregivers = await repo.listCaregivers();
      expect(caregivers.map((c) => c.slug).sort()).toEqual([
        "ate",
        "dad",
        "jed",
        "mom",
      ]);

      const ate = await repo.getCaregiverBySlug("ate");
      expect(ate?.role).toBe("helper");
      expect(ate?.avatarColor).toBe("helper");

      const settings = await repo.getSettings();
      expect(settings.householdTimezone).toBe("Asia/Manila");
      expect(settings.amMealHour).toBe(10);
      expect(settings.midMealHour).toBe(14);
      expect(settings.midMealMinute).toBe(0);
      expect(settings.pmMealHour).toBe(19);
      expect(settings.litterIntervalHours).toBe(48);
      expect(settings.weeklyPlayGoal).toBe(3);

      const supplies = await repo.listSupplies();
      expect(supplies).toHaveLength(2);
      expect(supplies.every((s) => s.level === "FULL" && s.lastAlertedLevel === null)).toBe(true);
    });

    it("[AC-034] enforces atomic partial uniqueness on feeding_logs and supports Undo -> Re-feed", async () => {
      const repo = await createRepo();
      const slotKey = "2026-11-20:AM";
      const dueAtIso = "2026-11-20T02:00:00.000Z";

      const [first, second] = await Promise.all([
        repo.logFeedingAtomic({
          slotKey,
          serviceDate: "2026-11-20",
          period: "AM",
          dueAtIso,
          completedById: "ate",
          completedAtIso: "2026-11-20T02:05:00.000Z",
        }),
        repo.logFeedingAtomic({
          slotKey,
          serviceDate: "2026-11-20",
          period: "AM",
          dueAtIso,
          completedById: "mom",
          completedAtIso: "2026-11-20T02:05:01.000Z",
        }),
      ]);

      const winners = [first, second].filter((r) => !r.alreadyFed);
      const losers = [first, second].filter((r) => r.alreadyFed);
      expect(winners).toHaveLength(1);
      expect(losers).toHaveLength(1);
      expect(losers[0].record.id).toBe(winners[0].record.id);

      const undone = await repo.undoFeedingBySlot(
        slotKey,
        "2026-11-20T02:06:00.000Z",
      );
      expect(undone?.undoneAtIso).toBe("2026-11-20T02:06:00.000Z");
      expect(await repo.getActiveFeedingBySlot(slotKey)).toBeNull();

      const refed = await repo.logFeedingAtomic({
        slotKey,
        serviceDate: "2026-11-20",
        period: "AM",
        dueAtIso,
        completedById: "dad",
        completedAtIso: "2026-11-20T02:07:00.000Z",
      });
      expect(refed.alreadyFed).toBe(false);
      expect(refed.completedBy.slug).toBe("dad");
    });

    it("[AC-034] deduplicates care_events by idempotencyKey and updates attribution", async () => {
      const repo = await createRepo();
      const first = await repo.logCareEvent({
        id: "ev-1",
        eventType: "LITTER_CLEAN",
        caregiverId: "ate",
        occurredAtIso: "2026-11-20T03:00:00.000Z",
        isoWeekKey: "2026-W47",
        idempotencyKey: "idem-litter-1",
      });
      const dup = await repo.logCareEvent({
        id: "ev-2",
        eventType: "LITTER_CLEAN",
        caregiverId: "mom",
        occurredAtIso: "2026-11-20T03:01:00.000Z",
        isoWeekKey: "2026-W47",
        idempotencyKey: "idem-litter-1",
      });
      expect(first.created).toBe(true);
      expect(dup.created).toBe(false);
      expect(dup.record.id).toBe("ev-1");
    });

    it("[AC-034] manages supplies alert latch and notification dispatches cleanly", async () => {
      const repo = await createRepo();
      const s1 = await repo.upsertSupplyAtomic({
        supplyKey: "CAT_FOOD",
        level: "LOW",
        updatedById: "ate",
        updatedAtIso: "2026-11-20T03:00:00.000Z",
      });
      expect(s1.shouldAlertLevel).toBe("LOW");

      const s2 = await repo.upsertSupplyAtomic({
        supplyKey: "CAT_FOOD",
        level: "LOW",
        updatedById: "mom",
        updatedAtIso: "2026-11-20T03:05:00.000Z",
      });
      expect(s2.shouldAlertLevel).toBeNull();

      const s3 = await repo.upsertSupplyAtomic({
        supplyKey: "CAT_FOOD",
        level: "EMPTY",
        updatedById: "mom",
        updatedAtIso: "2026-11-20T03:10:00.000Z",
      });
      expect(s3.shouldAlertLevel).toBe("EMPTY");

      await repo.upsertSupplyAtomic({
        supplyKey: "CAT_FOOD",
        level: "FULL",
        updatedById: "jed",
        updatedAtIso: "2026-11-20T04:00:00.000Z",
      });
      const s4 = await repo.upsertSupplyAtomic({
        supplyKey: "CAT_FOOD",
        level: "LOW",
        updatedById: "ate",
        updatedAtIso: "2026-11-20T05:00:00.000Z",
      });
      expect(s4.shouldAlertLevel).toBe("LOW");

      const claimed1 = await repo.claimNotificationDispatch({
        dispatchKey: "meal:2026-11-20:AM:T0_HELPER",
        channel: "web_push",
        targetScope: "helper",
        status: "sent",
        metaJson: null,
      });
      const claimed2 = await repo.claimNotificationDispatch({
        dispatchKey: "meal:2026-11-20:AM:T0_HELPER",
        channel: "web_push",
        targetScope: "helper",
        status: "sent",
        metaJson: null,
      });
      expect(claimed1).toBe(true);
      expect(claimed2).toBe(false);

      await repo.clearDispatchesWithPrefix("meal:2026-11-20:AM:");
      expect(
        await repo.hasNotificationDispatch("meal:2026-11-20:AM:T0_HELPER"),
      ).toBe(false);
    });

    it("deletes unused caregivers and blocks deletion when history or last owner", async () => {
      const repo = await createRepo();

      expect(await repo.deleteCaregiverIfUnused("missing-id")).toEqual({
        deleted: false,
        reason: "not_found",
      });

      expect(await repo.deleteCaregiverIfUnused("jed")).toEqual({
        deleted: false,
        reason: "last_owner",
      });

      // Seeded supplies are updatedById: "jed"; test feeding log history on "ate"
      await repo.logFeedingAtomic({
        slotKey: "2026-11-20:AM",
        serviceDate: "2026-11-20",
        period: "AM",
        dueAtIso: "2026-11-20T02:00:00.000Z",
        completedById: "ate",
        completedAtIso: "2026-11-20T02:05:00.000Z",
      });
      expect(await repo.deleteCaregiverIfUnused("ate")).toEqual({
        deleted: false,
        reason: "has_history",
      });

      await repo.upsertCaregiver({
        id: "sitter",
        slug: "sitter",
        displayName: "Sitter",
        role: "helper",
        avatarInitials: "SI",
        avatarColor: "sibling",
        isActive: true,
      });
      expect(await repo.deleteCaregiverIfUnused("sitter")).toEqual({
        deleted: true,
      });
      expect(await repo.getCaregiverById("sitter")).toBeNull();
    });
  });
}
