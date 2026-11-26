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
      "Meals Today",
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
    await expect(page.getByText("Meals Today")).toHaveCount(0);
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

    // Log Meal #1
    const mealsCard = page
      .getByRole("article")
      .filter({ has: page.getByRole("heading", { name: "Meals Today" }) });
    await mealsCard.getByRole("button", { name: "Mark Fed" }).click();
    await expect(mealsCard.getByText("Meal #1: Ate • 10:15 AM")).toBeVisible();
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

  test("dynamic PWA manifest preserves household token and caregiver slug for iOS and Android installs", async ({
    page,
    request,
  }) => {
    const trap = attachTelemetryTrap(page);

    // Unauthenticated root and invalid token must not expose an installable manifest
    await page.goto("/");
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(0);

    await page.goto("/h/bad-token");
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(0);

    const badManifestRes = await request.get("/h/bad-token/manifest");
    expect(badManifestRes.status()).toBe(404);

    // Valid personal link emits a single manifest inside <head> pointing to /h/<token>/manifest?who=ate
    await page.goto(`/h/${HOUSEHOLD_TOKEN}?who=ate`);
    const manifestLinks = page.locator('head link[rel="manifest"]');
    await expect(manifestLinks).toHaveCount(1);
    const manifestHref = await manifestLinks.getAttribute("href");
    expect(manifestHref).toBe(`/h/${HOUSEHOLD_TOKEN}/manifest?who=ate`);
    await expect(
      page.locator('head meta[name="apple-mobile-web-app-capable"]'),
    ).toHaveAttribute("content", "yes");

    // Fetch manifest without cookies (mirrors Android Chrome / iOS Safari manifest fetch)
    const manifestRes = await request.get(manifestHref!, {
      headers: { cookie: "" },
    });
    expect(manifestRes.status()).toBe(200);
    expect(manifestRes.headers()["content-type"]).toContain(
      "application/manifest+json",
    );
    const manifestJson = (await manifestRes.json()) as {
      id: string;
      start_url: string;
      scope: string;
      display: string;
      icons: Array<{ sizes: string; type: string }>;
    };
    expect(manifestJson.id).toBe(`/h/${HOUSEHOLD_TOKEN}`);
    expect(manifestJson.start_url).toBe(`/h/${HOUSEHOLD_TOKEN}?who=ate`);
    expect(manifestJson.scope).toBe("/");
    expect(manifestJson.display).toBe("standalone");
    expect(
      manifestJson.icons.some(
        (i) => i.sizes === "192x192" && i.type === "image/png",
      ),
    ).toBe(true);
    expect(
      manifestJson.icons.some(
        (i) => i.sizes === "512x512" && i.type === "image/png",
      ),
    ).toBe(true);

    // Switching person on /setup (as family/owner) updates the linked manifest href for direct install
    await page.goto(`/h/${HOUSEHOLD_TOKEN}/setup?who=mom`);
    await page.getByTestId("setup-member-jed").click();
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      "href",
      `/h/${HOUSEHOLD_TOKEN}/manifest?who=jed`,
    );

    trap.assertClean();
  });

  test("appropriates header links and guards restricted routes by caregiver role", async ({
    page,
  }) => {
    const trap = attachTelemetryTrap(page);

    // 1. Helper (?who=ate): Care Board only — Owner, Phone Setup, and Settings links are hidden
    await page.goto(`/h/${HOUSEHOLD_TOKEN}?who=ate`);
    await waitForHouseholdCookie(page);
    await expect(
      page.getByRole("navigation", { name: "Household Views" }),
    ).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Owner" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Phone Setup" })).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Owner Settings" }),
    ).toHaveCount(0);

    // Direct navigation to /owner, /setup, or /settings as helper redirects back to Care Board
    await page.goto(`/h/${HOUSEHOLD_TOKEN}/owner`);
    await expect(page).toHaveURL(new RegExp(`/h/${HOUSEHOLD_TOKEN}\\?who=ate$`));
    await expect(
      page.getByRole("heading", { name: "Owner View" }),
    ).toHaveCount(0);

    await page.goto(`/h/${HOUSEHOLD_TOKEN}/setup`);
    await expect(page).toHaveURL(new RegExp(`/h/${HOUSEHOLD_TOKEN}\\?who=ate$`));

    await page.goto(`/h/${HOUSEHOLD_TOKEN}/settings?who=ate`);
    await expect(page).toHaveURL(new RegExp(`/h/${HOUSEHOLD_TOKEN}\\?who=ate$`));

    // 2. Family (?who=mom): Care Board + Phone Setup only — Owner and Settings are hidden
    await page.goto(`/h/${HOUSEHOLD_TOKEN}?who=mom`);
    const familyNav = page.getByRole("navigation", { name: "Household Views" });
    await expect(familyNav).toBeVisible();
    await expect(
      familyNav.getByRole("link", { name: "Care Board" }),
    ).toBeVisible();
    await expect(
      familyNav.getByRole("link", { name: "Phone Setup" }),
    ).toBeVisible();
    await expect(familyNav.getByRole("link", { name: "Owner" })).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Owner Settings" }),
    ).toHaveCount(0);

    // Family can open Phone Setup, but is redirected from /owner and /settings?who=mom
    await familyNav.getByRole("link", { name: "Phone Setup" }).click();
    await expect(
      page.getByRole("heading", { name: "Set Up This Phone in 2 Minutes" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Owner" })).toHaveCount(0);

    await page.goto(`/h/${HOUSEHOLD_TOKEN}/owner`);
    await expect(page).toHaveURL(new RegExp(`/h/${HOUSEHOLD_TOKEN}\\?who=mom$`));

    await page.goto(`/h/${HOUSEHOLD_TOKEN}/settings?who=mom`);
    await expect(page).toHaveURL(new RegExp(`/h/${HOUSEHOLD_TOKEN}\\?who=mom$`));

    // 3. Owner (?who=jed): Full access across Care Board, Owner, Phone Setup, and Settings
    await page.goto(`/h/${HOUSEHOLD_TOKEN}?who=jed`);
    const ownerNav = page.getByRole("navigation", { name: "Household Views" });
    await expect(
      ownerNav.getByRole("link", { name: "Care Board" }),
    ).toBeVisible();
    await expect(ownerNav.getByRole("link", { name: "Owner" })).toBeVisible();
    await expect(
      ownerNav.getByRole("link", { name: "Phone Setup" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Owner Settings" }),
    ).toBeVisible();

    await ownerNav.getByRole("link", { name: "Owner" }).click();
    await expect(
      page.getByRole("heading", { name: "Owner View" }),
    ).toBeVisible();

    // Selecting a helper in Phone Setup keeps Jed's owner navigation links intact
    await page.getByRole("link", { name: "Open Phone Setup" }).click();
    await expect(
      page.getByRole("heading", { name: "Set Up This Phone in 2 Minutes" }),
    ).toBeVisible();
    await page.getByTestId("setup-member-ate").click();
    await expect(
      page.getByRole("navigation", { name: "Household Views" }).getByRole("link", { name: "Owner" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Owner Settings" }),
    ).toBeVisible();

    trap.assertClean();
  });
});
