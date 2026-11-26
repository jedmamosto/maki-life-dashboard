"use client";

import { useSyncExternalStore } from "react";
import { findActiveCaregiverBySlug } from "@/lib/role-access";
import type {
  AvatarColorKey,
  Caregiver,
  DashboardSnapshot,
  PushPlatform,
} from "@/lib/types";

const subscribeNoop = () => () => {};

export function useIsHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false
  );
}

export function useClientOrigin(): string {
  return useSyncExternalStore(
    subscribeNoop,
    () => window.location.origin,
    () => ""
  );
}

export function useStoredCaregiverSlug(token: string): string | null {
  return useSyncExternalStore(
    subscribeNoop,
    () => readStoredCaregiverSlug(token),
    () => null
  );
}

export class CareApiError extends Error {
  readonly status: number;
  readonly snapshot?: DashboardSnapshot;
  readonly alreadyFed?: boolean;

  constructor(
    message: string,
    status: number,
    extra?: { snapshot?: DashboardSnapshot; alreadyFed?: boolean }
  ) {
    super(message);
    this.name = "CareApiError";
    this.status = status;
    this.snapshot = extra?.snapshot;
    this.alreadyFed = extra?.alreadyFed;
  }
}

const sessionPromiseCache = new Map<string, Promise<void>>();

/**
 * Ensures the HttpOnly household session cookie is present before calling API routes.
 */
export async function ensureHouseholdSession(
  token: string,
  forceRefresh = false
): Promise<void> {
  if (!token) {
    return;
  }

  if (forceRefresh) {
    sessionPromiseCache.delete(token);
  }

  const existing = sessionPromiseCache.get(token);
  if (existing) {
    return existing;
  }

  const pending = (async () => {
    const res = await fetch("/api/auth/session", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token }),
    });

    if (!res.ok) {
      sessionPromiseCache.delete(token);
      throw new CareApiError("Household link is invalid.", res.status);
    }
  })();

  sessionPromiseCache.set(token, pending);
  try {
    await pending;
  } catch (err) {
    sessionPromiseCache.delete(token);
    throw err;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDashboardSnapshot(value: unknown): value is DashboardSnapshot {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.manilaNowIso === "string" &&
    isRecord(value.survivability) &&
    isRecord(value.meals) &&
    typeof value.meals.count === "number" &&
    Array.isArray(value.meals.entries) &&
    isRecord(value.litter) &&
    isRecord(value.supplies) &&
    isRecord(value.weeklyPlay) &&
    Array.isArray(value.caregivers)
  );
}

export async function apiFetch<T>(
  token: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  await ensureHouseholdSession(token);

  const perform = async (): Promise<Response> =>
    fetch(path, {
      ...init,
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });

  let res = await perform();

  if (res.status === 401 && token && path !== "/api/owner/pin") {
    await ensureHouseholdSession(token, true);
    res = await perform();
  }

  const raw: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const errMessage =
      isRecord(raw) && typeof raw.error === "string"
        ? raw.error
        : "Your phone could not reach the server.";
    const snapshot =
      isRecord(raw) && isDashboardSnapshot(raw.snapshot)
        ? raw.snapshot
        : undefined;
    const alreadyFed =
      isRecord(raw) && typeof raw.alreadyFed === "boolean"
        ? raw.alreadyFed
        : undefined;
    throw new CareApiError(errMessage, res.status, { snapshot, alreadyFed });
  }

  return raw as T;
}

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function getCaregiverStorageKey(token: string): string {
  return `maki_caregiver_${fnv1aHex(token)}`;
}

export function readStoredCaregiverSlug(token: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage.getItem(getCaregiverStorageKey(token));
  } catch {
    return null;
  }
}

export function writeStoredCaregiverSlug(token: string, slug: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(getCaregiverStorageKey(token), slug);
  } catch {
    // Ignore storage quota / private mode failures gracefully
  }
}

export function findValidCaregiver(
  caregivers: Caregiver[],
  slugOrId: string | null | undefined
): Caregiver | null {
  return findActiveCaregiverBySlug(caregivers, slugOrId);
}

export function generateIdempotencyKey(prefix: string): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const AVATAR_COLOR_MAP: Record<AvatarColorKey, string> = {
  helper: "var(--avatar-helper)",
  mom: "var(--avatar-mom)",
  dad: "var(--avatar-dad)",
  sibling: "var(--avatar-sibling)",
  owner: "var(--avatar-owner)",
};

export async function copyTextSafely(text: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function detectClientPlatform(): PushPlatform {
  if (typeof navigator === "undefined") {
    return "desktop";
  }
  const ua = navigator.userAgent || "";
  const isIos =
    /iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIos) {
    return "ios_pwa";
  }
  if (/Android/i.test(ua)) {
    return "android_pwa";
  }
  return "desktop";
}

export function isStandaloneDisplayMode(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const mediaMatch = window.matchMedia?.("(display-mode: standalone)").matches;
  const iosStandalone = Boolean(
    (window.navigator as Navigator & { standalone?: boolean }).standalone
  );
  return Boolean(mediaMatch || iosStandalone);
}

export function isMessengerInAppBrowser(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  return /FBAN|FBAV|FB_IAB|Messenger/i.test(navigator.userAgent || "");
}

export function urlBase64ToUint8Array(
  base64String: string
): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
