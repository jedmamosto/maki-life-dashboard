import { expect, test } from "@playwright/test";
import {
  HOUSEHOLD_TOKEN,
  assertNoHorizontalOverflow,
  attachTelemetryTrap,
  resetTestStore,
  setServerClock,
  waitForHouseholdCookie,
} from "./test-helpers";

test.describe("Care Workflows, Cross-Context Sync, Timezone Boundaries, Debounce, Undo, and Play", () => {
  test("cross-context sync across Manila vs America/New_York, rapid double-click debounce, undo/re-feed, and additive weekly play", async ({
    browser,
    request,
  }) => {
    // Midnight boundary: 2026-05-10T16:30:00.000Z
    // Manila (UTC+8): Mon, May 11, 12:30 AM
    // New York (EDT, UTC-4): Sun, May 10, 12:30 PM
    const boundaryIso = "2026-05-10T16:30:00.000Z";
    await resetTestStore(request, boundaryIso);

    const contextA = await browser.newContext({
      viewport: { width: 360, height: 800 },
    });
    const contextB = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      timezoneId: "America/New_York",
    });

    try {
      const pageA = await contextA.newPage();
      const pageB = await contextB.newPage();
      await pageB.clock.setFixedTime(new Date(boundaryIso));

      const trapA = attachTelemetryTrap(pageA);
      const trapB = attachTelemetryTrap(pageB);

      // 1. Verify Manila date May 11 on Context A vs EDT May 10 on Context B at 2026-05-10T16:30:00.000Z
      // Also verify Meals Today card is ready anytime (no early-feed lockout)
      await pageA.goto(`/h/${HOUSEHOLD_TOKEN}?who=ate`);
      await waitForHouseholdCookie(pageA);
      await expect(pageA.getByText(/Mon, May 11/)).toBeVisible();
      await expect(pageA.getByText(/12:30 AM/)).toBeVisible();
      const mealsCardA = pageA
        .getByRole("article")
        .filter({ has: pageA.getByRole("heading", { name: "Meals Today" }) });
      await expect(mealsCardA).toBeVisible();
      await expect(mealsCardA.getByText("0 of 3 today")).toBeVisible();
      await expect(
        mealsCardA.getByRole("button", { name: "Mark Fed" }),
      ).toBeEnabled();

      await pageB.goto(`/h/${HOUSEHOLD_TOKEN}/owner`);
      await waitForHouseholdCookie(pageB);
      const dualClockRegion = pageB.getByRole("region", {
        name: "Dual Clock Survivability",
      });
      await expect(dualClockRegion.getByText("Mon, May 11 • Asia/Manila")).toBeVisible();
      await expect(dualClockRegion.getByText("12:30 AM")).toBeVisible();
      await expect(dualClockRegion.getByText("Sun, May 10 • EDT")).toBeVisible();
      await expect(dualClockRegion.getByText("12:30 PM")).toBeVisible();

      // 2. Advance clock to Manila May 11 10:15 AM (still EDT May 10 10:15 PM)
      const feedWindowIso = "2026-05-11T02:15:00.000Z";
      await setServerClock(request, feedWindowIso);
      await pageB.clock.setFixedTime(new Date(feedWindowIso));

      await pageA.reload();
      await expect(pageA.getByText(/Mon, May 11 • 10:15 AM/)).toBeVisible();

      // 3. Rapid double-click debounce on Mark Fed (delayed POST /api/meals/feed -> exactly 1 request)
      let feedRequestCount = 0;
      await pageA.route("**/api/meals/feed", async (route) => {
        feedRequestCount += 1;
        await new Promise((resolve) => setTimeout(resolve, 450));
        await route.continue();
      });

      const markFedBtn = mealsCardA.getByRole("button", { name: "Mark Fed" });
      await expect(markFedBtn).toBeEnabled();

      const btnBox = await markFedBtn.boundingBox();
      expect(btnBox).not.toBeNull();
      await pageA.mouse.dblclick(
        btnBox!.x + btnBox!.width / 2,
        btnBox!.y + btnBox!.height / 2,
        { delay: 20 },
      );

      await expect(
        mealsCardA.getByText("Meal #1: Ate • 10:15 AM"),
      ).toBeVisible();
      await expect(mealsCardA.getByText("1 of 3 today")).toBeVisible();
      expect(feedRequestCount).toBe(1);

      await pageA.unroute("**/api/meals/feed");

      // 4. Context B (?who=jed) reloads Care Board and verifies synced Manila May 11 & Meal #1
      await pageB.goto(`/h/${HOUSEHOLD_TOKEN}?who=jed`);
      await expect(pageB.getByText(/Mon, May 11/)).toBeVisible();
      const mealsCardB = pageB
        .getByRole("article")
        .filter({ has: pageB.getByRole("heading", { name: "Meals Today" }) });
      await expect(
        mealsCardB.getByText("Meal #1: Ate • 10:15 AM"),
      ).toBeVisible();

      // 5. Undo Meal + re-Mark Fed + extra meal logging beyond goal (3/3 -> 4/3)
      await mealsCardA.getByTestId("undo-meal-0").click();
      await expect(mealsCardA.getByText("0 of 3 today")).toBeVisible();

      await mealsCardA.getByRole("button", { name: "Mark Fed" }).click();
      await expect(
        mealsCardA.getByText("Meal #1: Ate • 10:15 AM"),
      ).toBeVisible();

      await pageB.reload();
      await expect(
        mealsCardB.getByText("Meal #1: Ate • 10:15 AM"),
      ).toBeVisible();

      // Log 2nd and 3rd meals to reach Goal Met (3 of 3), then 1 extra meal (4 of 3)
      await mealsCardA.getByRole("button", { name: "Mark Fed" }).click();
      await expect(mealsCardA.getByText("2 of 3 today")).toBeVisible();
      await mealsCardA.getByRole("button", { name: "Mark Fed" }).click();
      await expect(mealsCardA.getByText("Goal Met (3 of 3)")).toBeVisible();
      await mealsCardA.getByRole("button", { name: "Log Extra Meal" }).click();
      await expect(mealsCardA.getByText("Goal Met (4 of 3)")).toBeVisible();

      // 6. Clean Litter so core tasks are all safe, then log Additive Weekly Play 0/3 -> 4/3
      await pageA
        .getByRole("button", { name: "Mark Litter Cleaned" })
        .click();

      const crest = pageA.getByRole("region", {
        name: "Maki Survivability Status",
      });
      await expect(
        crest.getByRole("heading", { name: "Maki is Safe" }),
      ).toBeVisible();
      await expect(crest.getByText("Care Is Late")).toHaveCount(0);

      const playCardA = pageA
        .getByRole("article")
        .filter({ has: pageA.getByRole("heading", { name: "Out-of-Room Play" }) });
      await expect(playCardA.getByText("0 of 3")).toBeVisible();

      for (let i = 1; i <= 3; i += 1) {
        await playCardA.getByRole("button", { name: "Log Play Time" }).click();
        if (i < 3) {
          await expect(playCardA.getByText(`${i} of 3`)).toBeVisible();
        }
      }

      await expect(playCardA.getByText("Goal Done (3 of 3)")).toBeVisible();
      await playCardA.getByRole("button", { name: "Log Extra Play" }).click();
      await expect(playCardA.getByText("Goal Done (4 of 3)")).toBeVisible();

      // Survivability stays safe / non-red even after 4/3
      await expect(
        crest.getByRole("heading", { name: "Maki is Safe" }),
      ).toBeVisible();
      await expect(crest.getByText("Care Is Late")).toHaveCount(0);

      await assertNoHorizontalOverflow(pageA);
      await assertNoHorizontalOverflow(pageB);

      trapA.assertClean();
      trapB.assertClean();
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
