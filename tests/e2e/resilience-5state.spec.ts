import { expect, test } from "@playwright/test";
import {
  HOUSEHOLD_TOKEN,
  OWNER_DEFAULT_PIN,
  assertNoHorizontalOverflow,
  assertTouchTargets,
  attachTelemetryTrap,
  resetTestStore,
  waitForHouseholdCookie,
} from "./test-helpers";

test.describe("5-State Resilience Matrix and Viewport Geometry Audit", () => {
  const fixedNowIso = "2026-11-20T02:15:00.000Z"; // Manila 2026-11-20 10:15 AM

  test.beforeEach(async ({ request }) => {
    await resetTestStore(request, fixedNowIso);
  });

  test("Empty, Loading, Error + Retry Recovery, Partial, and Ideal states work with zero unhandled errors", async ({
    page,
  }) => {
    const trap = attachTelemetryTrap(page);

    // 1. EMPTY STATE: Cold-start household Care Board + Owner View contain no NaN/Invalid Date
    await page.goto(`/h/${HOUSEHOLD_TOKEN}?who=ate`);
    await waitForHouseholdCookie(page);

    await expect(
      page.getByText("Not logged yet. Clean the litter box and tap below."),
    ).toBeVisible();
    await expect(
      page.getByText("Take Maki out of the room for 10 minutes to play."),
    ).toBeVisible();

    const boardText = await page.evaluate(() => document.body.innerText);
    expect(boardText).not.toMatch(/\bNaN\b|Invalid Date/i);

    // 2. ERROR & RETRY RECOVERY: Inject HTTP 500 on first POST /api/meals/feed, recover on Try Again
    let feedAttempts = 0;
    await page.route("**/api/meals/feed", async (route) => {
      feedAttempts += 1;
      if (feedAttempts === 1) {
        await route.fulfill({
          status: 500,
          contentType: "application/problem+json",
          body: JSON.stringify({
            error: "Your phone could not reach the server. Check your internet and tap Try Again.",
          }),
        });
      } else {
        await route.continue();
      }
    });

    trap.expectHttpConsoleError(500);
    const amMealCard = page
      .getByRole("article")
      .filter({ has: page.getByRole("heading", { name: "10:00 AM Meal" }) });
    await amMealCard.getByRole("button", { name: "Mark Fed" }).click();

    const alertBanner = page
      .getByRole("alert")
      .filter({ hasText: "Could Not Save Update" });
    await expect(alertBanner).toBeVisible();

    const tryAgainBtn = alertBanner.getByRole("button", { name: "Try Again" });
    await expect(tryAgainBtn).toBeVisible();
    await tryAgainBtn.click();

    await expect(alertBanner).toBeHidden();
    await expect(
      amMealCard.getByText("Fed by Ate at 10:15 AM. Maki is all set."),
    ).toBeVisible();
    expect(feedAttempts).toBe(2);
    await page.unroute("**/api/meals/feed");

    // 3. PARTIAL STATE: AM Meal Done + PM Meal Upcoming + Litter Due Now -> 3 of 5 Core
    const crest = page.getByRole("region", {
      name: "Maki Survivability Status",
    });
    await expect(crest.getByText("3 of 5 Core")).toBeVisible();

    // 4. IDEAL STATE: Clean litter + 3 weekly play sessions -> Goal Done & Maki is Safe
    await page.getByRole("button", { name: "Mark Litter Cleaned" }).click();
    await expect(crest.getByText("4 of 5 Core")).toBeVisible();
    await expect(
      crest.getByRole("heading", { name: "Maki is Safe" }),
    ).toBeVisible();

    const playCard = page
      .getByRole("article")
      .filter({ has: page.getByRole("heading", { name: "Out-of-Room Play" }) });
    for (let i = 0; i < 3; i += 1) {
      await playCard.getByRole("button", { name: "Log Play Time" }).click();
    }
    await expect(playCard.getByText("Goal Done (3 of 3)")).toBeVisible();

    // 5. LOADING STATE: Delayed GET /api/dashboard on Owner View Refresh & Settings unlock
    await page.goto(`/h/${HOUSEHOLD_TOKEN}/owner?who=jed`);
    await expect(
      page.getByText("No care actions logged today yet."),
    ).toHaveCount(0);

    await page.route("**/api/dashboard", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      await route.continue();
    });

    const refreshBtn = page.getByRole("button", { name: "Refresh Status" });
    await refreshBtn.click();
    await expect(refreshBtn).toBeDisabled();
    await expect(refreshBtn).toBeEnabled({ timeout: 5000 });

    // Also verify delayed /api/dashboard loading banner on /settings unlock
    await page.goto(`/h/${HOUSEHOLD_TOKEN}/settings`);
    await page.getByPlaceholder("0000").fill(OWNER_DEFAULT_PIN);
    await page.getByRole("button", { name: "Unlock Settings" }).click();
    await expect(
      page.getByText("Loading Maki's meals and supplies from home."),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Owner Settings" }),
    ).toBeVisible({ timeout: 5000 });

    await page.unroute("**/api/dashboard");
    trap.assertClean();
  });

  for (const vp of [
    { name: "360x800", width: 360, height: 800 },
    { name: "390x844", width: 390, height: 844 },
    { name: "1280x800", width: 1280, height: 800 },
  ]) {
    test(`viewport ${vp.name}: zero horizontal overflow and >=44px / >=56px touch targets across all views`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
      });

      try {
        const page = await context.newPage();
        await page.clock.setFixedTime(new Date(fixedNowIso));
        const trap = attachTelemetryTrap(page);

        // Care Board
        await page.goto(`/h/${HOUSEHOLD_TOKEN}?who=ate`);
        await waitForHouseholdCookie(page);
        await assertNoHorizontalOverflow(page);
        await assertTouchTargets(page, [
          page
            .getByRole("article")
            .filter({ has: page.getByRole("heading", { name: "10:00 AM Meal" }) })
            .getByRole("button", { name: "Mark Fed" }),
          page.getByRole("button", { name: "Mark Litter Cleaned" }),
          page.getByRole("button", { name: "Log Play Time" }),
        ]);

        // Owner View
        await page.goto(`/h/${HOUSEHOLD_TOKEN}/owner?who=jed`);
        await assertNoHorizontalOverflow(page);
        await assertTouchTargets(page, [
          page.getByRole("button", { name: "Copy Messenger Nudge" }),
        ]);

        // Setup View
        await page.goto(`/h/${HOUSEHOLD_TOKEN}/setup?who=jed`);
        await assertNoHorizontalOverflow(page);
        await assertTouchTargets(page, [
          page.getByRole("button", { name: "Copy Personal Link" }),
          page.getByRole("button", { name: "Allow Phone Alerts" }),
          page.getByRole("button", { name: "Send Test Ping" }),
        ]);

        // Settings PIN Gate & Panel
        await page.goto(`/h/${HOUSEHOLD_TOKEN}/settings`);
        await assertNoHorizontalOverflow(page);
        await assertTouchTargets(page, [
          page.getByRole("button", { name: "Unlock Settings" }),
        ]);

        await page.getByPlaceholder("0000").fill(OWNER_DEFAULT_PIN);
        await page.getByRole("button", { name: "Unlock Settings" }).click();
        await expect(
          page.getByRole("heading", { name: "Owner Settings" }),
        ).toBeVisible();
        await assertNoHorizontalOverflow(page);
        await assertTouchTargets(page, [
          page.getByRole("button", { name: "Save Schedule and Email" }),
        ]);

        trap.assertClean();
      } finally {
        await context.close();
      }
    });
  }
});
