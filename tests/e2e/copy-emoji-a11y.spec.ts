import { expect, test } from "@playwright/test";
import {
  HOUSEHOLD_TOKEN,
  OWNER_DEFAULT_PIN,
  assertCleanCopyAndA11y,
  attachTelemetryTrap,
  resetTestStore,
  waitForHouseholdCookie,
} from "./test-helpers";

test.describe("CEFR A2 Copy, Zero Unicode Emojis, and Button/Input Accessibility", () => {
  const fixedNowIso = "2026-11-20T02:15:00.000Z";

  test.beforeEach(async ({ request }) => {
    await resetTestStore(request, fixedNowIso);
  });

  test("all views, modals, and error states have zero unicode emojis, no banned words, and accessible interactive labels", async ({
    page,
  }) => {
    const trap = attachTelemetryTrap(page);

    // 1. Access Gate Error View
    await page.goto("/h/bad-token");
    await expect(
      page.getByRole("heading", { name: "Household Link Needed" }),
    ).toBeVisible();
    await assertCleanCopyAndA11y(page, "Access Gate");

    // 2. Avatar Picker Modal (first visit without ?who=)
    await page.goto(`/h/${HOUSEHOLD_TOKEN}`);
    await waitForHouseholdCookie(page);
    await expect(
      page.getByRole("dialog", { name: "Who is helping Maki today?" }),
    ).toBeVisible();
    await assertCleanCopyAndA11y(page, "Avatar Picker Modal");

    await page.getByRole("button", { name: /Ate/i }).click();
    await expect(
      page.getByRole("dialog", { name: "Who is helping Maki today?" }),
    ).toHaveCount(0);

    // 3. Care Board + Supply Editor + Switcher Sheet + Error Banner
    await assertCleanCopyAndA11y(page, "Care Board");

    await page.getByRole("button", { name: /Cat Food/i }).click();
    await assertCleanCopyAndA11y(page, "Care Board Supply Editor");

    await page.getByRole("button", { name: "Ate, Switch Person" }).click();
    const switcherDialog = page.getByRole("dialog", { name: "Switch Person" });
    await expect(switcherDialog).toBeVisible();
    await assertCleanCopyAndA11y(page, "Avatar Switcher Sheet");
    await switcherDialog.getByRole("button", { name: "Close" }).click();
    await page.getByRole("button", { name: "Close" }).click();

    // Error Banner via injected 500
    await page.route("**/api/meals/feed", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/problem+json",
        body: JSON.stringify({
          error:
            "Your phone could not reach the server. Check your internet and tap Try Again.",
        }),
      });
    });
    trap.expectHttpConsoleError(500);
    await page
      .getByRole("article")
      .filter({ has: page.getByRole("heading", { name: "10:00 AM Meal" }) })
      .getByRole("button", { name: "Mark Fed" })
      .click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Could Not Save Update" }),
    ).toBeVisible();
    await assertCleanCopyAndA11y(page, "Care Board Error Banner");
    await page.unroute("**/api/meals/feed");

    // 4. Owner View
    await page.goto(`/h/${HOUSEHOLD_TOKEN}/owner`);
    await expect(
      page.getByRole("heading", { name: "Owner View" }),
    ).toBeVisible();
    await assertCleanCopyAndA11y(page, "Owner View");

    // 5. Setup View (both iOS and Android guides)
    await page.goto(`/h/${HOUSEHOLD_TOKEN}/setup?who=ate`);
    await expect(
      page.getByRole("heading", { name: "Set Up This Phone in 2 Minutes" }),
    ).toBeVisible();
    await assertCleanCopyAndA11y(page, "Setup View iOS");

    await page.getByRole("button", { name: "Android / Chrome" }).click();
    await assertCleanCopyAndA11y(page, "Setup View Android");

    // 6. Settings PIN Gate (including error alert) & Unlocked Settings Panel
    await page.goto(`/h/${HOUSEHOLD_TOKEN}/settings`);
    await expect(
      page.getByRole("heading", { name: "Enter Owner 4-Digit PIN" }),
    ).toBeVisible();
    await assertCleanCopyAndA11y(page, "Settings PIN Gate");

    trap.expectHttpConsoleError(401, 1);
    await page.getByPlaceholder("0000").fill("9999");
    await page.getByRole("button", { name: "Unlock Settings" }).click();
    await expect(
      page
        .getByRole("region", { name: "Enter Owner 4-Digit PIN" })
        .getByRole("alert")
        .filter({ hasText: "Wrong PIN. Try again." }),
    ).toBeVisible();
    await assertCleanCopyAndA11y(page, "Settings PIN Gate Error");

    await page.getByPlaceholder("0000").fill(OWNER_DEFAULT_PIN);
    await page.getByRole("button", { name: "Unlock Settings" }).click();
    await expect(
      page.getByRole("heading", { name: "Owner Settings" }),
    ).toBeVisible();
    await assertCleanCopyAndA11y(page, "Owner Settings Panel");

    trap.assertClean();
  });
});
