import { getCareRepository } from "@/db";
import {
  buildDashboardSnapshot,
  buildOwnerHistory,
} from "./domain";
import {
  addManilaDays,
  getManilaDateKey,
  getManilaIsoWeekKey,
  getSlotScheduledAt,
} from "./timezone";
import type { DashboardSnapshot, OwnerHistoryResponse } from "./types";

declare global {
  var __makiMockNowIso: string | null | undefined;
}

let clockOverrideForTests: (() => Date) | null = null;

export function setClockForTests(fn: (() => Date) | null): void {
  clockOverrideForTests = fn;
}

export function setMockNowIso(nowIso: string | null): void {
  globalThis.__makiMockNowIso = nowIso;
}

export function getEffectiveNow(): Date {
  if (clockOverrideForTests) {
    return clockOverrideForTests();
  }
  if (globalThis.__makiMockNowIso) {
    return new Date(globalThis.__makiMockNowIso);
  }
  return new Date();
}

export function getAppBaseUrl(requestUrl?: string): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured && configured.length > 0) {
    return configured.replace(/\/$/, "");
  }
  if (requestUrl) {
    try {
      return new URL(requestUrl).origin;
    } catch {
      return "http://localhost:3000";
    }
  }
  return "http://localhost:3000";
}

export async function getDashboardSnapshot(
  now?: Date,
  baseUrl?: string,
): Promise<DashboardSnapshot> {
  const effectiveNow = now ?? getEffectiveNow();
  const effectiveBaseUrl = baseUrl ?? getAppBaseUrl();
  const repo = getCareRepository();
  const todayDateKey = getManilaDateKey(effectiveNow);
  const isoWeekKey = getManilaIsoWeekKey(effectiveNow);

  const [
    caregivers,
    settings,
    todayFeedings,
    litterEvents,
    supplies,
    weekEvents,
    pushSubscriptions,
  ] = await Promise.all([
    repo.listCaregivers(),
    repo.getSettings(),
    repo.listActiveFeedingsByDate(todayDateKey),
    repo.listCareEventsByType("LITTER_CLEAN"),
    repo.listSupplies(),
    repo.listCareEventsByWeek(isoWeekKey),
    repo.listAllPushSubscriptions(),
  ]);

  return buildDashboardSnapshot({
    now: effectiveNow,
    baseUrl: effectiveBaseUrl,
    caregivers,
    settings,
    todayFeedings,
    litterEvents,
    supplies,
    weekEvents,
    pushSubscriptions,
  });
}

export async function getOwnerHistory(
  now?: Date,
): Promise<OwnerHistoryResponse> {
  const effectiveNow = now ?? getEffectiveNow();
  const repo = getCareRepository();
  const todayDateKey = getManilaDateKey(effectiveNow);
  const startDateKey = addManilaDays(todayDateKey, -13);
  const historyStartIso = getSlotScheduledAt(
    addManilaDays(todayDateKey, -17),
    0,
    0,
  ).toISOString();

  const [
    caregivers,
    settings,
    feedingLogs,
    careEvents,
    supplies,
    pushSubscriptions,
  ] = await Promise.all([
    repo.listCaregivers(),
    repo.getSettings(),
    repo.listFeedingsInRange(startDateKey, todayDateKey),
    repo.listCareEventsSince(historyStartIso),
    repo.listSupplies(),
    repo.listAllPushSubscriptions(),
  ]);

  return buildOwnerHistory({
    now: effectiveNow,
    caregivers,
    settings,
    feedingLogs,
    careEvents,
    supplies,
    pushSubscriptions,
  });
}
