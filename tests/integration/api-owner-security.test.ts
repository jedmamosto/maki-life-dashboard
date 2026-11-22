import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as postAuthSession } from "@/app/api/auth/session/route";
import { GET as getDashboard } from "@/app/api/dashboard/route";
import { GET as getOwnerHistory } from "@/app/api/owner/history/route";
import {
  DELETE as deleteOwnerPin,
  GET as getOwnerPin,
  POST as postOwnerPin,
} from "@/app/api/owner/pin/route";
import { PATCH as patchOwnerSettings } from "@/app/api/owner/settings/route";
import { DELETE as deleteOwnerCaregiver } from "@/app/api/owner/caregivers/[id]/route";
import { POST as postTestReset } from "@/app/api/test/reset/route";
import { verifyHouseholdToken } from "@/lib/auth";
import { proxy } from "@/proxy";
import { NextRequest } from "next/server";
import { createTestHarness, type TestHarness } from "../fakes/test-harness";

describe("API integration: household proxy, PIN lockout, owner settings, test reset", () => {
  let harness: TestHarness;

  beforeEach(() => {
    harness = createTestHarness("2026-11-20T02:00:00.000Z"); // 10:00 AM PHT
  });

  afterEach(() => {
    harness.teardown();
  });

  it("[AC-001][AC-002][AC-003][AC-004] gates household session via proxy, /api/auth/session, and rejects unauthorized calls", async () => {
    // Unauthenticated API access -> 401
    const unauthReq = await harness.authedRequest("/api/dashboard", { rawCookies: "" });
    expect((await getDashboard(unauthReq)).status).toBe(401);

    // Tampered cookie -> 401
    const badCookieReq = await harness.authedRequest("/api/dashboard", {
      rawCookies: "maki_household=tampered.cookie",
    });
    expect((await getDashboard(badCookieReq)).status).toBe(401);

    // Proxy on valid /h/[token] sets HttpOnly SameSite=Lax cookie
    const validProxyReq = new NextRequest(
      "http://localhost:3000/h/maki-test-household-token",
    );
    const proxyRes = await proxy(validProxyReq);
    const setCookie = proxyRes.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("maki_household=");
    expect(setCookie.toLowerCase()).toContain("httponly");
    expect(setCookie.toLowerCase()).toContain("samesite=lax");

    // Proxy on invalid /h/[bad-token] does NOT issue session cookie
    const badProxyReq = new NextRequest("http://localhost:3000/h/wrong-token-len");
    const badProxyRes = await proxy(badProxyReq);
    expect(badProxyRes.headers.get("set-cookie") ?? "").not.toContain("maki_household=.");

    // Proxy on malformed percent-encoding (/h/%ZZ) does NOT throw 500
    const malformedProxyReq = new NextRequest("http://localhost:3000/h/%ZZ");
    const malformedProxyRes = await proxy(malformedProxyReq);
    expect(malformedProxyRes.status).toBe(200);
    expect(malformedProxyRes.headers.get("set-cookie") ?? "").not.toContain(
      "maki_household=.",
    );

    // POST /api/auth/session
    const badAuth = await postAuthSession(
      new Request("http://localhost:3000/api/auth/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "wrong" }),
      }),
    );
    expect(badAuth.status).toBe(401);

    const goodAuth = await postAuthSession(
      new Request("http://localhost:3000/api/auth/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "maki-test-household-token" }),
      }),
    );
    expect(goodAuth.status).toBe(200);
    expect(goodAuth.headers.get("set-cookie")).toContain("maki_household=");
  });

  it("[AC-005][AC-031][AC-032] enforces PIN 400/401/429 lockout, locks/unlocks settings, and rotates token", async () => {
    // Malformed PIN -> 400
    const badFmt = await postOwnerPin(
      await harness.authedRequest("/api/owner/pin", {
        method: "POST",
        body: JSON.stringify({ pin: "12" }),
      }),
    );
    expect(badFmt.status).toBe(400);

    // Settings blocked without PIN cookie -> 403
    const blockedSettings = await patchOwnerSettings(
      await harness.authedRequest("/api/owner/settings", {
        method: "PATCH",
        body: JSON.stringify({ weeklyPlayGoal: 4 }),
      }),
    );
    expect(blockedSettings.status).toBe(403);

    // 4 wrong PINs -> 401; 5th -> 429
    for (let i = 1; i <= 4; i++) {
      const r = await postOwnerPin(
        await harness.authedRequest("/api/owner/pin", {
          method: "POST",
          body: JSON.stringify({ pin: "9999" }),
        }),
      );
      expect(r.status).toBe(401);
    }
    const fifth = await postOwnerPin(
      await harness.authedRequest("/api/owner/pin", {
        method: "POST",
        body: JSON.stringify({ pin: "9999" }),
      }),
    );
    expect(fifth.status).toBe(429);

    // Advance 16 minutes -> unlock with default PIN 1234 -> 200 + cookie
    harness.clock.advanceMinutes(16);
    const okPin = await postOwnerPin(
      await harness.authedRequest("/api/owner/pin", {
        method: "POST",
        body: JSON.stringify({ pin: "1234" }),
      }),
    );
    expect(okPin.status).toBe(200);
    expect(okPin.headers.get("set-cookie")).toContain("maki_owner_pin=");

    // Unlocked settings update works and hashes newPin with scrypt (never plaintext)
    const updateRes = await patchOwnerSettings(
      await harness.authedRequest("/api/owner/settings", {
        method: "PATCH",
        includeOwnerPin: true,
        body: JSON.stringify({
          weeklyPlayGoal: 4,
          newPin: "5678",
          rotateHouseholdToken: true,
        }),
      }),
    );
    expect(updateRes.status).toBe(200);
    const updateBody = await updateRes.json();
    expect(updateBody.settings.weeklyPlayGoal).toBe(4);
    expect(updateBody.settings.hasPinConfigured).toBe(true);
    expect(typeof updateBody.newHouseholdToken).toBe("string");

    const storedSettings = await harness.repo.getSettings();
    expect(storedSettings.ownerPinHash).toBeTruthy();
    expect(storedSettings.ownerPinHash).not.toContain("5678");
    expect(await verifyHouseholdToken("maki-test-household-token")).toBe(false);
    expect(await verifyHouseholdToken(updateBody.newHouseholdToken)).toBe(true);

    // Old household cookie is rejected with 401 after token rotation
    const oldCookiePinStatus = await getOwnerPin(
      await harness.authedRequest("/api/owner/pin", { includeOwnerPin: true }),
    );
    expect(oldCookiePinStatus.status).toBe(401);

    // New household cookie + refreshed owner PIN cookie succeed
    const rotatedHeaders = `${await harness.makeAuthCookie(updateBody.newHouseholdToken)}; ${await harness.makeOwnerCookie()}`;
    const statusRes = await getOwnerPin(
      await harness.authedRequest("/api/owner/pin", {
        rawCookies: rotatedHeaders,
      }),
    );
    expect(statusRes.status).toBe(200);
    expect((await statusRes.json()).unlocked).toBe(true);
    const lockRes = await deleteOwnerPin(
      await harness.authedRequest("/api/owner/pin", {
        method: "DELETE",
        rawCookies: rotatedHeaders,
      }),
    );
    expect(lockRes.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("[AC-030][AC-033] guards /api/test/reset behind ENABLE_TEST_HARNESS and seeds 14-day history", async () => {
    const prevFlag = process.env.ENABLE_TEST_HARNESS;
    const prevNodeEnv = process.env.NODE_ENV;
    try {
      process.env.ENABLE_TEST_HARNESS = "false";
      const disabled = await postTestReset(
        new Request("http://localhost:3000/api/test/reset", {
          method: "POST",
          body: JSON.stringify({ action: "reset" }),
        }),
      );
      expect(disabled.status).toBe(404);

      process.env.ENABLE_TEST_HARNESS = "true";
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";
      const prodDisabled = await postTestReset(
        new Request("http://localhost:3000/api/test/reset", {
          method: "POST",
          body: JSON.stringify({ action: "reset" }),
        }),
      );
      expect(prodDisabled.status).toBe(404);

      (process.env as Record<string, string | undefined>).NODE_ENV = prevNodeEnv;
      const seeded = await postTestReset(
        new Request("http://localhost:3000/api/test/reset", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "seedHistory",
            days: 7,
          }),
        }),
      );
      expect(seeded.status).toBe(200);

      const historyRes = await getOwnerHistory(
        await harness.authedRequest("/api/owner/history"),
      );
      expect(historyRes.status).toBe(200);
      const history = await historyRes.json();
      expect(history.days).toHaveLength(14);
      expect(history.onTimePercent).toBeGreaterThan(0);
    } finally {
      process.env.ENABLE_TEST_HARNESS = prevFlag;
      (process.env as Record<string, string | undefined>).NODE_ENV = prevNodeEnv;
    }
  });

  it("manages and customizes household people with PIN guard and safe delete", async () => {
    // Unlock owner PIN
    const pinRes = await postOwnerPin(
      await harness.authedRequest("/api/owner/pin", {
        method: "POST",
        body: JSON.stringify({ pin: "1234" }),
      }),
    );
    expect(pinRes.status).toBe(200);
    const pinCookie = pinRes.headers.get("set-cookie")?.split(";")[0] ?? "";
    const ownerCookies = `maki_household=${await (async () => {
      const s = await postAuthSession(
        new Request("http://localhost:3000/api/auth/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token: "maki-test-household-token" }),
        }),
      );
      return s.headers.get("set-cookie")?.split(";")[0].split("=").slice(1).join("=") ?? "";
    })()}; ${pinCookie}`;

    // Delete without PIN -> 403
    const unpinnedDelete = await deleteOwnerCaregiver(
      await harness.authedRequest("/api/owner/caregivers/mom", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "mom" }) },
    );
    expect(unpinnedDelete.status).toBe(403);

    // Add a new person with custom initials, color, and role
    const addRes = await patchOwnerSettings(
      await harness.authedRequest("/api/owner/settings", {
        method: "PATCH",
        rawCookies: ownerCookies,
        body: JSON.stringify({
          caregivers: [
            {
              id: "lola",
              slug: "lola",
              displayName: "Lola",
              role: "family",
              avatarInitials: "la",
              avatarColor: "sibling",
              isActive: true,
            },
          ],
        }),
      }),
    );
    expect(addRes.status).toBe(200);
    const addData = await addRes.json();
    const lola = addData.snapshot.caregivers.find(
      (c: { id: string }) => c.id === "lola",
    );
    expect(lola).toMatchObject({
      displayName: "Lola",
      role: "family",
      avatarInitials: "LA",
      avatarColor: "sibling",
      isActive: true,
    });

    // Reject deactivating the last active owner
    const deactivateOwnerRes = await patchOwnerSettings(
      await harness.authedRequest("/api/owner/settings", {
        method: "PATCH",
        rawCookies: ownerCookies,
        body: JSON.stringify({
          caregivers: [
            {
              id: "jed",
              slug: "jed",
              displayName: "Jed",
              role: "owner",
              avatarInitials: "JD",
              avatarColor: "owner",
              isActive: false,
            },
          ],
        }),
      }),
    );
    expect(deactivateOwnerRes.status).toBe(400);

    // Reject duplicate slug across different ids
    const dupSlugRes = await patchOwnerSettings(
      await harness.authedRequest("/api/owner/settings", {
        method: "PATCH",
        rawCookies: ownerCookies,
        body: JSON.stringify({
          caregivers: [
            {
              id: "another",
              slug: "lola",
              displayName: "Another",
              role: "helper",
              avatarInitials: "AN",
              avatarColor: "helper",
              isActive: true,
            },
          ],
        }),
      }),
    );
    expect(dupSlugRes.status).toBe(400);

    // Delete unused person -> 200
    const deleteLolaRes = await deleteOwnerCaregiver(
      await harness.authedRequest("/api/owner/caregivers/lola", {
        method: "DELETE",
        rawCookies: ownerCookies,
      }),
      { params: Promise.resolve({ id: "lola" }) },
    );
    expect(deleteLolaRes.status).toBe(200);
    const deleteData = await deleteLolaRes.json();
    expect(
      deleteData.snapshot.caregivers.some(
        (c: { id: string }) => c.id === "lola",
      ),
    ).toBe(false);

    // Delete person with history ("jed" has default supply records) -> 400 last_owner,
    // and "ate" with a feeding log -> 409 has_history
    await harness.repo.logFeedingAtomic({
      slotKey: "2026-11-20:AM",
      serviceDate: "2026-11-20",
      period: "AM",
      dueAtIso: "2026-11-20T02:00:00.000Z",
      completedById: "ate",
      completedAtIso: "2026-11-20T02:05:00.000Z",
    });
    const deleteAteRes = await deleteOwnerCaregiver(
      await harness.authedRequest("/api/owner/caregivers/ate", {
        method: "DELETE",
        rawCookies: ownerCookies,
      }),
      { params: Promise.resolve({ id: "ate" }) },
    );
    expect(deleteAteRes.status).toBe(409);
  });
});
