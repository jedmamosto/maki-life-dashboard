import { MemoryCareRepository } from "@/db/file-repository";
import { setCareRepositoryForTests } from "@/db";
import {
  HOUSEHOLD_COOKIE_NAME,
  OWNER_PIN_COOKIE_NAME,
  createHouseholdSessionCookieValue,
  createOwnerPinCookieValue,
  resetPinRateLimiter,
  setQstashVerifierForTests,
} from "@/lib/auth";
import { setClockForTests } from "@/lib/dashboard-service";
import {
  setEmailTransportForTests,
  setPushTransportForTests,
} from "@/lib/notifications";
import { FakeClock } from "./clock";
import { FakeEmailTransport } from "./email-transport";
import { FakePushTransport } from "./push-transport";
import { FakeQstashVerifier } from "./qstash-verifier";

export interface TestHarness {
  repo: MemoryCareRepository;
  clock: FakeClock;
  push: FakePushTransport;
  email: FakeEmailTransport;
  qstash: FakeQstashVerifier;
  makeAuthCookie: (token?: string) => Promise<string>;
  makeOwnerCookie: () => Promise<string>;
  authedRequest: (
    path: string,
    init?: RequestInit & { includeOwnerPin?: boolean; rawCookies?: string },
  ) => Promise<Request>;
  teardown: () => void;
}

export function createTestHarness(
  initialIso: string = "2026-11-20T01:00:00.000Z", // 09:00 AM PHT
): TestHarness {
  const repo = new MemoryCareRepository();
  const clock = new FakeClock(initialIso);
  const push = new FakePushTransport();
  const email = new FakeEmailTransport();
  const qstash = new FakeQstashVerifier("test-qstash-secret");

  setCareRepositoryForTests(repo);
  setClockForTests(() => clock.now());
  setPushTransportForTests(push);
  setEmailTransportForTests(email);
  setQstashVerifierForTests(qstash);
  resetPinRateLimiter();

  async function makeAuthCookie(
    token: string = process.env.HOUSEHOLD_TOKEN ?? "maki-test-household-token",
  ): Promise<string> {
    const val = await createHouseholdSessionCookieValue(token, clock.now());
    return `${HOUSEHOLD_COOKIE_NAME}=${val}`;
  }

  async function makeOwnerCookie(): Promise<string> {
    const settings = await repo.getSettings();
    const val = createOwnerPinCookieValue(settings, clock.now());
    return `${OWNER_PIN_COOKIE_NAME}=${val}`;
  }

  async function authedRequest(
    path: string,
    init: RequestInit & { includeOwnerPin?: boolean; rawCookies?: string } = {},
  ): Promise<Request> {
    const headers = new Headers(init.headers);
    if (init.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    if (init.rawCookies !== undefined) {
      if (init.rawCookies.length > 0) {
        headers.set("cookie", init.rawCookies);
      }
    } else {
      const parts = [await makeAuthCookie()];
      if (init.includeOwnerPin) {
        parts.push(await makeOwnerCookie());
      }
      headers.set("cookie", parts.join("; "));
    }

    const url = path.startsWith("http") ? path : `http://localhost:3000${path}`;
    return new Request(url, {
      ...init,
      headers,
    });
  }

  return {
    repo,
    clock,
    push,
    email,
    qstash,
    makeAuthCookie,
    makeOwnerCookie,
    authedRequest,
    teardown: () => {
      setCareRepositoryForTests(null);
      setClockForTests(null);
      setPushTransportForTests(null);
      setEmailTransportForTests(null);
      setQstashVerifierForTests(null);
      resetPinRateLimiter();
    },
  };
}
