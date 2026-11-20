import crypto from "node:crypto";
import { Receiver } from "@upstash/qstash";
import { cookies } from "next/headers";
import { getCareRepository } from "@/db";
import { getEffectiveNow } from "./dashboard-service";
import type { HouseholdSettingsRecord } from "./types";

export const HOUSEHOLD_COOKIE_NAME = "maki_household";
export const OWNER_PIN_COOKIE_NAME = "maki_owner_pin";

const HOUSEHOLD_COOKIE_TTL_SECONDS = 60 * 60 * 24 * 30;
const OWNER_PIN_COOKIE_TTL_SECONDS = 60 * 60 * 2;
const PIN_MAX_FAILURES = 5;
const PIN_LOCKOUT_MS = 15 * 60 * 1000;

export interface QstashVerifier {
  verify(input: { signature: string; body: string; url: string }): Promise<boolean>;
}

interface PinLockState {
  failures: number;
  lockedUntilMs: number;
}

declare global {
  var __makiPinAttempts: Map<string, PinLockState> | undefined;
}

const pinAttemptsByScope: Map<string, PinLockState> =
  globalThis.__makiPinAttempts ??
  (globalThis.__makiPinAttempts = new Map<string, PinLockState>());
let qstashVerifierOverride: QstashVerifier | null = null;

export function setQstashVerifierForTests(verifier: QstashVerifier | null): void {
  qstashVerifierOverride = verifier;
}

export function resetPinRateLimiter(): void {
  pinAttemptsByScope.clear();
}

export function safeTimingEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function getSessionSecret(): string {
  const envSecret = process.env.SESSION_SECRET;
  if (envSecret && envSecret.length > 0) {
    return envSecret;
  }
  if (process.env.NODE_ENV !== "production") {
    return "maki-dev-session-secret-change-in-prod";
  }
  return "";
}

function getEnvHouseholdToken(): string {
  const envToken = process.env.HOUSEHOLD_TOKEN;
  if (envToken && envToken.length > 0) {
    return envToken;
  }
  if (process.env.NODE_ENV !== "production") {
    return "maki-dev-household-token-change-in-prod";
  }
  return "";
}

function getExpectedPinRaw(settings: HouseholdSettingsRecord): string {
  if (settings.ownerPinHash) {
    return settings.ownerPinHash;
  }
  const envPin = process.env.OWNER_DEFAULT_PIN;
  if (envPin && envPin.length > 0) {
    return envPin;
  }
  if (process.env.NODE_ENV !== "production") {
    return "1234";
  }
  return "";
}

export function getServerHouseholdPath(
  settings?: HouseholdSettingsRecord,
): string {
  if (settings?.activeTokenHash) {
    return "";
  }
  const envToken = getEnvHouseholdToken();
  if (!envToken) {
    return "";
  }
  return `/h/${encodeURIComponent(envToken)}`;
}

export function buildHouseholdPushNavigate(
  baseUrl: string,
  householdPath: string,
  subpath: "" | "/owner" = "",
): string {
  const cleanBase = baseUrl.replace(/\/$/, "");
  if (!householdPath) {
    return subpath === "/owner" ? "/owner" : "/";
  }
  return `${cleanBase}${householdPath}${subpath}`;
}

export function buildHouseholdEmailUrl(
  baseUrl: string,
  householdPath: string,
): string {
  const cleanBase = baseUrl.replace(/\/$/, "");
  if (!householdPath) {
    return cleanBase;
  }
  return `${cleanBase}${householdPath}/owner`;
}

function signPayload(payloadJson: string): string {
  const secret = getSessionSecret();
  if (!secret) {
    throw new Error("SESSION_SECRET is required in production");
  }
  const encoded = Buffer.from(payloadJson, "utf8").toString("base64url");
  const sig = crypto
    .createHmac("sha256", secret)
    .update(encoded, "utf8")
    .digest("base64url");
  return `${encoded}.${sig}`;
}

function verifySignedPayload<T extends Record<string, unknown>>(
  cookieValue: string,
): T | null {
  const secret = getSessionSecret();
  if (!secret || !cookieValue) {
    return null;
  }
  const parts = cookieValue.split(".");
  if (parts.length !== 2) {
    return null;
  }
  const [encoded, providedSig] = parts;
  if (!encoded || !providedSig) {
    return null;
  }
  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(encoded, "utf8")
    .digest("base64url");
  if (!safeTimingEqual(providedSig, expectedSig)) {
    return null;
  }
  try {
    const raw = Buffer.from(encoded, "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed as T;
  } catch {
    return null;
  }
}

export function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(pin, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPinHash(pin: string, storedHash: string): boolean {
  const parts = storedHash.split(":");
  if (parts.length !== 2) {
    return false;
  }
  const [salt, expectedHex] = parts;
  if (!salt || !expectedHex) {
    return false;
  }
  const derivedHex = crypto.scryptSync(pin, salt, 64).toString("hex");
  return safeTimingEqual(derivedHex, expectedHex);
}

export function verifyOwnerPinAgainstSettings(
  pin: string,
  settings: HouseholdSettingsRecord,
): boolean {
  if (!/^\d{4}$/.test(pin)) {
    return false;
  }
  if (settings.ownerPinHash) {
    return verifyPinHash(pin, settings.ownerPinHash);
  }
  const envPin = process.env.OWNER_DEFAULT_PIN;
  if (envPin && envPin.length > 0) {
    return safeTimingEqual(pin, envPin);
  }
  if (process.env.NODE_ENV !== "production") {
    return safeTimingEqual(pin, "1234");
  }
  return false;
}

async function getExpectedTokenDigest(): Promise<string> {
  const settings = await getCareRepository().getSettings();
  if (settings.activeTokenHash) {
    return settings.activeTokenHash.slice(0, 16);
  }
  const envToken = getEnvHouseholdToken();
  if (!envToken) {
    return "";
  }
  return sha256Hex(envToken).slice(0, 16);
}

export async function verifyHouseholdToken(token: string): Promise<boolean> {
  if (!token) {
    return false;
  }
  const settings = await getCareRepository().getSettings();
  if (settings.activeTokenHash) {
    return safeTimingEqual(sha256Hex(token), settings.activeTokenHash);
  }
  const envToken = getEnvHouseholdToken();
  if (!envToken) {
    return false;
  }
  return safeTimingEqual(token, envToken);
}

export async function createHouseholdSessionCookieValue(
  token: string,
  now: Date = new Date(),
): Promise<string> {
  const tokenDigest = sha256Hex(token).slice(0, 16);
  const nowSec = Math.floor(now.getTime() / 1000);
  return signPayload(
    JSON.stringify({
      kind: "household",
      tokenDigest,
      iat: nowSec,
      exp: nowSec + HOUSEHOLD_COOKIE_TTL_SECONDS,
    }),
  );
}

export async function verifyHouseholdSessionCookieValue(
  cookieValue: string,
  now: Date = new Date(),
): Promise<boolean> {
  const payload = verifySignedPayload<{
    kind?: string;
    tokenDigest?: string;
    exp?: number;
  }>(cookieValue);
  if (!payload || payload.kind !== "household") {
    return false;
  }
  const nowSec = Math.floor(now.getTime() / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= nowSec) {
    return false;
  }
  const expectedDigest = await getExpectedTokenDigest();
  if (!expectedDigest || typeof payload.tokenDigest !== "string") {
    return false;
  }
  return safeTimingEqual(payload.tokenDigest, expectedDigest);
}

export function createOwnerPinCookieValue(
  settings: HouseholdSettingsRecord,
  now: Date = new Date(),
): string {
  const expectedPinRaw = getExpectedPinRaw(settings);
  if (!expectedPinRaw) {
    throw new Error("Owner PIN is not configured");
  }
  const pinDigest = sha256Hex(expectedPinRaw).slice(0, 16);
  const nowSec = Math.floor(now.getTime() / 1000);
  return signPayload(
    JSON.stringify({
      kind: "owner_pin",
      pinDigest,
      iat: nowSec,
      exp: nowSec + OWNER_PIN_COOKIE_TTL_SECONDS,
    }),
  );
}

export function verifyOwnerPinCookieValue(
  cookieValue: string,
  settings: HouseholdSettingsRecord,
  now: Date = new Date(),
): boolean {
  const payload = verifySignedPayload<{
    kind?: string;
    pinDigest?: string;
    exp?: number;
  }>(cookieValue);
  if (!payload || payload.kind !== "owner_pin") {
    return false;
  }
  const nowSec = Math.floor(now.getTime() / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= nowSec) {
    return false;
  }
  const expectedPinRaw = getExpectedPinRaw(settings);
  if (!expectedPinRaw || typeof payload.pinDigest !== "string") {
    return false;
  }
  const expectedDigest = sha256Hex(expectedPinRaw).slice(0, 16);
  return safeTimingEqual(payload.pinDigest, expectedDigest);
}

export function parseCookieHeader(header: string): Map<string, string> {
  const out = new Map<string, string>();
  if (!header) {
    return out;
  }
  for (const part of header.split(";")) {
    const eqIdx = part.indexOf("=");
    if (eqIdx <= 0) {
      continue;
    }
    const name = part.slice(0, eqIdx).trim();
    const val = part.slice(eqIdx + 1).trim();
    if (name) {
      try {
        out.set(name, decodeURIComponent(val));
      } catch {
        out.set(name, val);
      }
    }
  }
  return out;
}

async function readCookieValue(
  name: string,
  request?: Request,
): Promise<string | null> {
  if (request) {
    const header = request.headers.get("cookie") ?? "";
    return parseCookieHeader(header).get(name) ?? null;
  }
  const cookieStore = await cookies();
  return cookieStore.get(name)?.value ?? null;
}

export async function isHouseholdRequestAuthorized(
  request?: Request,
  now?: Date,
): Promise<boolean> {
  const cookieVal = await readCookieValue(HOUSEHOLD_COOKIE_NAME, request);
  if (!cookieVal) {
    return false;
  }
  return verifyHouseholdSessionCookieValue(cookieVal, now ?? getEffectiveNow());
}

export async function isOwnerPinCookieValid(
  request?: Request,
  now?: Date,
): Promise<boolean> {
  const cookieVal = await readCookieValue(OWNER_PIN_COOKIE_NAME, request);
  if (!cookieVal) {
    return false;
  }
  const settings = await getCareRepository().getSettings();
  return verifyOwnerPinCookieValue(cookieVal, settings, now ?? getEffectiveNow());
}

export function getPinRateLimitScope(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const firstIp = forwarded.split(",")[0]?.trim();
    if (firstIp) {
      return `ip:${firstIp}`;
    }
  }
  return "household:default";
}

export function isPinLockedOut(
  scope: string,
  nowMs: number = Date.now(),
): boolean {
  const state = pinAttemptsByScope.get(scope);
  if (!state) {
    return false;
  }
  if (state.lockedUntilMs > nowMs) {
    return true;
  }
  if (state.lockedUntilMs > 0 && state.lockedUntilMs <= nowMs) {
    pinAttemptsByScope.delete(scope);
  }
  return false;
}

export function checkAndRecordPinAttempt(
  scope: string,
  success: boolean,
  nowMs: number = Date.now(),
): { locked: boolean; remainingFailures: number } {
  const existing = pinAttemptsByScope.get(scope);
  if (existing && existing.lockedUntilMs > nowMs) {
    return { locked: true, remainingFailures: 0 };
  }
  if (existing && existing.lockedUntilMs > 0 && existing.lockedUntilMs <= nowMs) {
    pinAttemptsByScope.delete(scope);
  }

  if (success) {
    pinAttemptsByScope.delete(scope);
    return { locked: false, remainingFailures: PIN_MAX_FAILURES };
  }

  const currentFailures = (pinAttemptsByScope.get(scope)?.failures ?? 0) + 1;
  if (currentFailures >= PIN_MAX_FAILURES) {
    pinAttemptsByScope.set(scope, {
      failures: currentFailures,
      lockedUntilMs: nowMs + PIN_LOCKOUT_MS,
    });
    return { locked: true, remainingFailures: 0 };
  }

  pinAttemptsByScope.set(scope, {
    failures: currentFailures,
    lockedUntilMs: 0,
  });
  return {
    locked: false,
    remainingFailures: PIN_MAX_FAILURES - currentFailures,
  };
}

export async function verifyQstashRequest(input: {
  signature: string;
  body: string;
  url: string;
}): Promise<boolean> {
  if (!input.signature) {
    return false;
  }
  if (qstashVerifierOverride) {
    return qstashVerifierOverride.verify(input);
  }

  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!currentSigningKey || !nextSigningKey) {
    return false;
  }

  const receiver = new Receiver({
    currentSigningKey,
    nextSigningKey,
  });

  try {
    const verified = await receiver.verify({
      signature: input.signature,
      body: input.body,
      url: input.url,
    });
    return verified;
  } catch {
    return false;
  }
}

export function getHouseholdCookieOptions(): {
  name: string;
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  maxAge: number;
} {
  return {
    name: HOUSEHOLD_COOKIE_NAME,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: HOUSEHOLD_COOKIE_TTL_SECONDS,
  };
}

export function getOwnerPinCookieOptions(): {
  name: string;
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  maxAge: number;
} {
  return {
    name: OWNER_PIN_COOKIE_NAME,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: OWNER_PIN_COOKIE_TTL_SECONDS,
  };
}
