import { describe, expect, it } from "vitest";
import {
  buildHouseholdEmailUrl,
  buildHouseholdPushNavigate,
  checkAndRecordPinAttempt,
  createHouseholdSessionCookieValue,
  createOwnerPinCookieValue,
  getServerHouseholdPath,
  hashPin,
  resetPinRateLimiter,
  safeTimingEqual,
  setQstashVerifierForTests,
  verifyHouseholdSessionCookieValue,
  verifyHouseholdToken,
  verifyOwnerPinAgainstSettings,
  verifyOwnerPinCookieValue,
  verifyPinHash,
  verifyQstashRequest,
} from "@/lib/auth";
import { DEFAULT_SETTINGS } from "@/lib/domain";
import type { HouseholdSettingsRecord } from "@/lib/types";
import { FakeQstashVerifier } from "../fakes/qstash-verifier";

function makeSettings(overrides?: Partial<HouseholdSettingsRecord>): HouseholdSettingsRecord {
  return {
    ...DEFAULT_SETTINGS,
    updatedAtIso: "2026-11-20T00:00:00.000Z",
    ...overrides,
  };
}

describe("auth, timingSafeEqual, scrypt PIN, cookies, and QStash verifier", () => {
  it("[AC-002] safeTimingEqual handles uneven byte lengths without throwing RangeError", async () => {
    expect(safeTimingEqual("short", "much-longer-token")).toBe(false);
    expect(safeTimingEqual("", "nonempty")).toBe(false);
    expect(safeTimingEqual("same-value", "same-value")).toBe(true);

    expect(await verifyHouseholdToken("x")).toBe(false);
    expect(await verifyHouseholdToken("maki-test-household-token")).toBe(true);
  });

  it("[AC-001][AC-003] signs and verifies household session cookie bound to token", async () => {
    const cookieVal = await createHouseholdSessionCookieValue("maki-test-household-token");
    expect(await verifyHouseholdSessionCookieValue(cookieVal)).toBe(true);
    expect(await verifyHouseholdSessionCookieValue(`${cookieVal}tampered`)).toBe(false);
  });

  it("[AC-031] hashes 4-digit Owner PIN with salted scryptSync and enforces 5-failure 429 lockout", () => {
    resetPinRateLimiter();
    const hashed = hashPin("4829");
    expect(hashed).not.toContain("4829");
    expect(hashed).toContain(":");
    expect(verifyPinHash("4829", hashed)).toBe(true);
    expect(verifyPinHash("1234", hashed)).toBe(false);

    const settings = makeSettings({ ownerPinHash: hashed });
    expect(verifyOwnerPinAgainstSettings("4829", settings)).toBe(true);
    expect(verifyOwnerPinAgainstSettings("0000", settings)).toBe(false);

    const nowMs = Date.UTC(2026, 10, 20, 4, 0, 0);
    // Attempts 1..4 fail with locked=false
    for (let i = 1; i <= 4; i++) {
      const res = checkAndRecordPinAttempt("test-client", false, nowMs + i * 1000);
      expect(res.locked).toBe(false);
      expect(res.remainingFailures).toBe(5 - i);
    }
    // 5th consecutive failure triggers lockout
    const fifth = checkAndRecordPinAttempt("test-client", false, nowMs + 5000);
    expect(fifth.locked).toBe(true);

    // Even a valid attempt during 15-min lockout remains locked
    const duringLock = checkAndRecordPinAttempt("test-client", true, nowMs + 60_000);
    expect(duringLock.locked).toBe(true);

    // After 15 minutes, valid attempt succeeds and resets
    const afterLock = checkAndRecordPinAttempt(
      "test-client",
      true,
      nowMs + 5000 + 15 * 60_000 + 1,
    );
    expect(afterLock.locked).toBe(false);

    const pinCookie = createOwnerPinCookieValue(settings, new Date(nowMs));
    expect(verifyOwnerPinCookieValue(pinCookie, settings, new Date(nowMs + 1000))).toBe(true);
    expect(
      verifyOwnerPinCookieValue(pinCookie, settings, new Date(nowMs + 3 * 3600_000)),
    ).toBe(false);
  });

  it("[AC-022] verifies QStash signature and rejects missing/tampered requests", async () => {
    const fake = new FakeQstashVerifier("secret-key");
    setQstashVerifierForTests(fake);
    try {
      const body = JSON.stringify({ trigger: "tick" });
      const sig = fake.sign(body);
      expect(
        await verifyQstashRequest({
          signature: sig,
          body,
          url: "http://localhost:3000/api/cron/tick",
        }),
      ).toBe(true);
      expect(
        await verifyQstashRequest({
          signature: "",
          body,
          url: "http://localhost:3000/api/cron/tick",
        }),
      ).toBe(false);
      expect(
        await verifyQstashRequest({
          signature: sig,
          body: JSON.stringify({ trigger: "tampered" }),
          url: "http://localhost:3000/api/cron/tick",
        }),
      ).toBe(false);
    } finally {
      setQstashVerifierForTests(null);
    }
  });

  it("[AC-030][A-02] fails closed in production when neither ownerPinHash nor OWNER_DEFAULT_PIN is configured", () => {
    const prevNodeEnv = process.env.NODE_ENV;
    const prevDefaultPin = process.env.OWNER_DEFAULT_PIN;
    const envObj = process.env as Record<string, string | undefined>;
    try {
      envObj.NODE_ENV = "production";
      delete envObj.OWNER_DEFAULT_PIN;

      const unconfigured = makeSettings({ ownerPinHash: null });
      expect(verifyOwnerPinAgainstSettings("1234", unconfigured)).toBe(false);
      expect(() => createOwnerPinCookieValue(unconfigured)).toThrow();
    } finally {
      envObj.NODE_ENV = prevNodeEnv;
      envObj.OWNER_DEFAULT_PIN = prevDefaultPin;
    }
  });

  it("[B-01] builds valid deep-link paths when unrotated and safe fallbacks when token is rotated", () => {
    const unrotated = makeSettings({ activeTokenHash: null });
    const unrotatedPath = getServerHouseholdPath(unrotated);
    expect(unrotatedPath).toBe("/h/maki-test-household-token");
    expect(buildHouseholdPushNavigate("http://localhost:3000", unrotatedPath)).toBe(
      "http://localhost:3000/h/maki-test-household-token",
    );
    expect(
      buildHouseholdPushNavigate("http://localhost:3000", unrotatedPath, "/owner"),
    ).toBe("http://localhost:3000/h/maki-test-household-token/owner");
    expect(buildHouseholdEmailUrl("http://localhost:3000", unrotatedPath)).toBe(
      "http://localhost:3000/h/maki-test-household-token/owner",
    );

    const rotated = makeSettings({ activeTokenHash: "sha256-rotated-hash" });
    const rotatedPath = getServerHouseholdPath(rotated);
    expect(rotatedPath).toBe("");
    expect(buildHouseholdPushNavigate("http://localhost:3000", rotatedPath)).toBe(
      "/",
    );
    expect(
      buildHouseholdPushNavigate("http://localhost:3000", rotatedPath, "/owner"),
    ).toBe("/owner");
    expect(buildHouseholdEmailUrl("http://localhost:3000", rotatedPath)).toBe(
      "http://localhost:3000",
    );
  });
});
