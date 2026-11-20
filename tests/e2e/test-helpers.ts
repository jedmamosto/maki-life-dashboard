import { expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";

export const HOUSEHOLD_TOKEN = "maki-e2e-household-token-2026";
export const OWNER_DEFAULT_PIN = "1234";
export const EMOJI_PATTERN = /\p{Extended_Pictographic}/u;

export const BANNED_COPY_WORDS = [
  "utilize",
  "facilitate",
  "demonstrate",
  "procure",
  "remit",
  "remediate",
  "seamless",
  "cutting-edge",
  "revolutionary",
  "robust",
  "ingestion",
  "orchestrating",
  "synergistic",
  "neglect",
  "guilt",
  "forgot",
  "trapped",
] as const;

export interface TelemetryTrap {
  consoleErrors: string[];
  pageErrors: string[];
  expectHttpConsoleError: (statusCode: number, count?: number) => void;
  assertClean: () => void;
}

export function attachTelemetryTrap(page: Page): TelemetryTrap {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const expectedStatusPatterns: RegExp[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      const idx = expectedStatusPatterns.findIndex((re) => re.test(text));
      if (idx >= 0) {
        expectedStatusPatterns.splice(idx, 1);
        return;
      }
      consoleErrors.push(text);
    }
  });

  page.on("pageerror", (err) => {
    pageErrors.push(err.message);
  });

  return {
    consoleErrors,
    pageErrors,
    expectHttpConsoleError: (statusCode: number, count = 1) => {
      for (let i = 0; i < count; i += 1) {
        expectedStatusPatterns.push(
          new RegExp(`status of ${statusCode}\\b`, "i"),
        );
      }
    },
    assertClean: () => {
      expect(pageErrors, "Unhandled page errors detected").toEqual([]);
      expect(consoleErrors, "Console errors detected").toEqual([]);
    },
  };
}

export async function resetTestStore(
  request: APIRequestContext,
  nowIso: string | null = null,
): Promise<void> {
  const res = await request.post("/api/test/reset", {
    data: { action: "reset", nowIso },
  });
  expect(res.ok(), `reset failed with ${res.status()}`).toBe(true);
}

export async function setServerClock(
  request: APIRequestContext,
  nowIso: string | null,
): Promise<void> {
  const res = await request.post("/api/test/reset", {
    data: { action: "setClock", nowIso },
  });
  expect(res.ok(), `setClock failed with ${res.status()}`).toBe(true);
}

export async function seedTestHistory(
  request: APIRequestContext,
  days: number,
): Promise<void> {
  const res = await request.post("/api/test/reset", {
    data: { action: "seedHistory", days },
  });
  expect(res.ok(), `seedHistory failed with ${res.status()}`).toBe(true);
}

export async function seedTestPushSubscription(
  request: APIRequestContext,
  subscription: {
    caregiverId: string;
    endpoint: string;
    platform?: "ios_pwa" | "android_pwa" | "desktop";
    supportsDeclarative?: boolean;
    revoked?: boolean;
  },
): Promise<void> {
  const res = await request.post("/api/test/reset", {
    data: {
      action: "seedPushSub",
      subscription: {
        p256dh: "e2e-p256dh-key",
        auth: "e2e-auth-key",
        platform: "desktop",
        supportsDeclarative: false,
        ...subscription,
      },
    },
  });
  expect(res.ok(), `seedPushSub failed with ${res.status()}`).toBe(true);
}

export async function waitForHouseholdCookie(
  page: Page,
): Promise<{ name: string; value: string; httpOnly: boolean }> {
  let matched:
    | { name: string; value: string; httpOnly: boolean }
    | undefined;

  await expect
    .poll(
      async () => {
        const cookies = await page.context().cookies();
        const found = cookies.find((c) => c.name === "maki_household");
        if (found) {
          matched = {
            name: found.name,
            value: found.value,
            httpOnly: found.httpOnly,
          };
          return true;
        }
        return false;
      },
      { timeout: 10_000 },
    )
    .toBe(true);

  if (!matched) {
    throw new Error("maki_household cookie was not set.");
  }
  return matched;
}

export async function assertNoHorizontalOverflow(page: Page): Promise<{
  scrollWidth: number;
  clientWidth: number;
}> {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(
    metrics.scrollWidth,
    `Horizontal overflow: scrollWidth=${metrics.scrollWidth} > clientWidth=${metrics.clientWidth}`,
  ).toBeLessThanOrEqual(metrics.clientWidth);
  return metrics;
}

export async function assertTouchTargets(
  page: Page,
  primaryCtas: Locator[] = [],
): Promise<void> {
  const violations = await page.evaluate(() => {
    const out: Array<{ tag: string; label: string; width: number; height: number }> = [];
    const elements = Array.from(
      document.querySelectorAll<HTMLElement>("button, a[href]"),
    );

    for (const el of elements) {
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") {
        continue;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        continue;
      }
      if (rect.height < 43.5) {
        const label =
          el.getAttribute("aria-label") ||
          el.innerText.trim() ||
          el.tagName;
        out.push({
          tag: el.tagName.toLowerCase(),
          label: label.slice(0, 60),
          width: Math.round(rect.width),
          height: Math.round(rect.height * 10) / 10,
        });
      }
    }
    return out;
  });

  expect(
    violations,
    `Interactive elements below 44px height: ${JSON.stringify(violations)}`,
  ).toEqual([]);

  for (const cta of primaryCtas) {
    await expect(cta).toBeVisible();
    const box = await cta.boundingBox();
    expect(box, "Primary CTA missing bounding box").not.toBeNull();
    expect(
      box!.height,
      `Primary CTA height ${box!.height} < 56px`,
    ).toBeGreaterThanOrEqual(55.5);
  }
}

export async function assertCleanCopyAndA11y(
  page: Page,
  viewLabel: string,
): Promise<void> {
  const bodyText = await page.evaluate(() => document.body.innerText);
  expect(
    EMOJI_PATTERN.test(bodyText),
    `Emoji detected in ${viewLabel}: ${bodyText}`,
  ).toBe(false);

  const lower = bodyText.toLowerCase();
  for (const banned of BANNED_COPY_WORDS) {
    const regex = new RegExp(`\\b${banned}\\b`, "i");
    expect(
      regex.test(lower),
      `Banned word "${banned}" found in ${viewLabel}`,
    ).toBe(false);
  }

  const unlabeled = await page.evaluate(() => {
    const missing: string[] = [];
    const controls = Array.from(
      document.querySelectorAll<HTMLElement>("button, a[href]"),
    );
    for (const el of controls) {
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") {
        continue;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        continue;
      }
      const ariaLabel = el.getAttribute("aria-label")?.trim() ?? "";
      const labelledById = el.getAttribute("aria-labelledby");
      const labelledByText = labelledById
        ? document.getElementById(labelledById)?.textContent?.trim() ?? ""
        : "";
      const text = el.textContent?.replace(/\s+/g, " ").trim() ?? "";
      if (!ariaLabel && !labelledByText && !text) {
        missing.push(el.outerHTML.slice(0, 100));
      }
    }

    const inputs = Array.from(
      document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        "input, textarea",
      ),
    );
    for (const input of inputs) {
      const style = window.getComputedStyle(input);
      if (style.display === "none" || style.visibility === "hidden") {
        continue;
      }
      const rect = input.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        continue;
      }
      const ariaLabel = input.getAttribute("aria-label")?.trim() ?? "";
      const id = input.id;
      const explicitLabel = id
        ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent?.trim() ?? ""
        : "";
      const wrappingLabel = input.closest("label")?.textContent?.trim() ?? "";
      if (!ariaLabel && !explicitLabel && !wrappingLabel) {
        missing.push(input.outerHTML.slice(0, 100));
      }
    }
    return missing;
  });

  expect(
    unlabeled,
    `Unlabeled controls in ${viewLabel}: ${JSON.stringify(unlabeled)}`,
  ).toEqual([]);
}
