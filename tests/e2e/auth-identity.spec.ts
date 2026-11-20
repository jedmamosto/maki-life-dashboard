import { expect, test } from "@playwright/test";
import {
  HOUSEHOLD_TOKEN,
  OWNER_DEFAULT_PIN,
  attachTelemetryTrap,
  resetTestStore,
  waitForHouseholdCookie,
} from "./test-helpers";

test.describe("Auth, HttpOnly Cookie Isolation, Caregiver Identity, and PIN Gate", () => {
  test.beforeEach(async ({ request }) => {
    // 2026-11-20 10:15 AM Manila (02:15 UTC): AM meal is DUE_NOW, PM is UPCOMING
    await resetTestStore(request, "2026-11-20T02:15:00.000Z");
  });

  test("unauthed / and /h/bad-token render Household Link Needed with zero Maki data", async ({
    page,
  }) => {
    const trap = attachTelemetryTrap(page);

    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Household Link Needed" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "This Maki link is missing or wrong. Ask Jed for the home link in Messenger.",
      ),
    ).toBeVisible();

    for (const leakedText of [
      "Maki is Safe",
      "Maki Needs Care",
      "10:00 AM Meal",
      "7:00 PM Meal",
      "Litter Box",
      "Cat Food",
      "Out-of-Room Play",
    ]) {
      await expect(page.getByText(leakedText)).toHaveCount(0);
    }

    await page.goto("/h/bad-token");
    await expect(
      page.getByRole("heading", { name: "Household Link Needed" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Try Link Again" }),
    ).toBeVisible();
    await expect(page.getByText("10:00 AM Meal")).toHaveCount(0);
    await expect(page.getByText("Cat Food")).toHaveCount(0);

    trap.assertClean();
  });

  test("?who=ate sets HttpOnly session cookie, hides token from document.cookie, and persists Ate across reload", async ({
    page,
  }) => {
    const trap = attachTelemetryTrap(page);

    await page.goto(`/h/${HOUSEHOLD_TOKEN}?who=ate`);

    const switcherBtn = page.getByRole("button", {
      name: "Ate, Switch Person",
    });
    await expect(switcherBtn).toBeVisible();
    await expect(
      page.getByRole("dialog", { name: "Who is helping Maki today?" }),
    ).toHaveCount(0);

    const sessionCookie = await waitForHouseholdCookie(page);
    expect(sessionCookie.httpOnly).toBe(true);
    expect(sessionCookie.value).not.toContain(HOUSEHOLD_TOKEN);

    const documentCookie = await page.evaluate(() => document.cookie);
    expect(documentCookie).not.toContain(HOUSEHOLD_TOKEN);
    expect(documentCookie).not.toContain("maki_household");

    // Navigate without ?who= query param and reload to verify localStorage identity persistence
    await page.goto(`/h/${HOUSEHOLD_TOKEN}`);
    await expect(
      page.getByRole("button", { name: "Ate, Switch Person" }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Ate, Switch Person" }),
    ).toBeVisible();
    await expect(
      page.getByRole("dialog", { name: "Who is helping Maki today?" }),
    ).toHaveCount(0);

    trap.assertClean();
  });

  test("caregiver logs meal, litter, supply, and play with zero PIN prompt", async ({
    page,
  }) => {
    const trap = attachTelemetryTrap(page);

    await page.goto(`/h/${HOUSEHOLD_TOKEN}?who=ate`);
    await waitForHouseholdCookie(page);

    // Log AM Meal
    const amMealCard = page
      .getByRole("article")
      .filter({ has: page.getByRole("heading", { name: "10:00 AM Meal" }) });
    await amMealCard.getByRole("button", { name: "Mark Fed" }).click();
    await expect(
      amMealCard.getByText("Fed by Ate at 10:15 AM. Maki is all set."),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Enter Owner 4-Digit PIN" }),
    ).toHaveCount(0);

    // Log Litter Box
    const litterCard = page
      .getByRole("article")
      .filter({ has: page.getByRole("heading", { name: "Litter Box" }) });
    await litterCard
      .getByRole("button", { name: "Mark Litter Cleaned" })
      .click();
    await expect(litterCard.getByText("Ate • Today, 10:15 AM")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Enter Owner 4-Digit PIN" }),
    ).toHaveCount(0);

    // Update Supply (Cat Food -> Low)
    await page.getByRole("button", { name: /Cat Food/i }).click();
    await page.getByRole("button", { name: "Low" }).click();
    await expect(
      page.getByRole("button", { name: /Cat Food.*Low/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Enter Owner 4-Digit PIN" }),
    ).toHaveCount(0);

    // Log Weekly Play
    const playCard = page
      .getByRole("article")
      .filter({ has: page.getByRole("heading", { name: "Out-of-Room Play" }) });
    await playCard.getByRole("button", { name: "Log Play Time" }).click();
    await expect(playCard.getByText("1 of 3")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Enter Owner 4-Digit PIN" }),
    ).toHaveCount(0);

    trap.assertClean();
  });

  test("/settings PIN gate rejects wrong PIN with CEFR A2 error and unlocks with 1234 persisting saved setting", async ({
    page,
  }) => {
    const trap = attachTelemetryTrap(page);

    await page.goto(`/h/${HOUSEHOLD_TOKEN}/settings`);
    await waitForHouseholdCookie(page);

    await expect(
      page.getByRole("heading", { name: "Enter Owner 4-Digit PIN" }),
    ).toBeVisible();

    // Wrong PIN -> 401 + CEFR A2 error
    trap.expectHttpConsoleError(401, 1);
    const pinInput = page.getByPlaceholder("0000");
    await pinInput.fill("9999");
    await page.getByRole("button", { name: "Unlock Settings" }).click();

    const pinAlert = page
      .getByRole("region", { name: "Enter Owner 4-Digit PIN" })
      .getByRole("alert");
    await expect(pinAlert).toContainText("Wrong PIN. Try again.");
    await expect(
      page.getByRole("heading", { name: "Owner Settings" }),
    ).toHaveCount(0);

    // Correct PIN (1234)
    await pinInput.fill(OWNER_DEFAULT_PIN);
    await page.getByRole("button", { name: "Unlock Settings" }).click();

    await expect(
      page.getByRole("heading", { name: "Owner Settings" }),
    ).toBeVisible();

    // Save updated schedule & email and verify persistence across reload
    const playGoalInput = page.getByLabel("Weekly Play Goal");
    const emailInput = page.getByLabel("Owner Alert Email");
    await playGoalInput.fill("5");
    await emailInput.fill("jed@example.com");
    await page
      .getByRole("button", { name: "Save Schedule and Email" })
      .click();

    await expect(page.getByRole("status")).toContainText("Settings saved.");

    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Owner Settings" }),
    ).toBeVisible();
    await expect(page.getByLabel("Weekly Play Goal")).toHaveValue("5");
    await expect(page.getByLabel("Owner Alert Email")).toHaveValue(
      "jed@example.com",
    );

    trap.assertClean();
  });
});
