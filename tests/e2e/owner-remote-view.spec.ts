import { expect, test } from "@playwright/test";
import {
  EMOJI_PATTERN,
  HOUSEHOLD_TOKEN,
  attachTelemetryTrap,
  resetTestStore,
  seedTestHistory,
  seedTestPushSubscription,
  waitForHouseholdCookie,
} from "./test-helpers";

test.describe("Owner Remote View: 14-Day History, Push Health, and Messenger Nudge Clipboard", () => {
  const fixedNowIso = "2026-05-15T04:00:00.000Z"; // Manila 2026-05-15 12:00 PM

  test("renders exact 14 Manila days when 16 days are seeded and flags revoked Helper alerts off", async ({
    page,
    request,
  }) => {
    await resetTestStore(request, fixedNowIso);
    await seedTestHistory(request, 16);
    await seedTestPushSubscription(request, {
      caregiverId: "ate",
      endpoint: "https://push.example/e2e-ate-revoked",
      platform: "android_pwa",
      revoked: true,
    });

    await page.clock.setFixedTime(new Date(fixedNowIso));
    const trap = attachTelemetryTrap(page);

    await page.goto(`/h/${HOUSEHOLD_TOKEN}/owner`);
    await waitForHouseholdCookie(page);

    // Expected 14 Manila days: 2026-05-02 .. 2026-05-15 (excludes 2026-04-30 and 2026-05-01)
    const expected14Days = [
      "2026-05-02",
      "2026-05-03",
      "2026-05-04",
      "2026-05-05",
      "2026-05-06",
      "2026-05-07",
      "2026-05-08",
      "2026-05-09",
      "2026-05-10",
      "2026-05-11",
      "2026-05-12",
      "2026-05-13",
      "2026-05-14",
      "2026-05-15",
    ];

    const historySection = page.getByRole("region", {
      name: "14-Day Care History",
    });
    const historyTable = historySection.getByRole("table");
    const amRowCells = historyTable
      .getByRole("row", { name: /AM Meal/i })
      .getByRole("button");
    await expect(amRowCells).toHaveCount(14);

    const midRowCells = historyTable
      .getByRole("row", { name: /Midday Meal/i })
      .getByRole("button");
    await expect(midRowCells).toHaveCount(14);

    for (const dateKey of expected14Days) {
      await expect(page.getByTestId(`history-cell-${dateKey}-am`)).toBeVisible();
      await expect(page.getByTestId(`history-cell-${dateKey}-mid`)).toBeVisible();
    }
    await expect(page.getByTestId("history-cell-2026-04-30-am")).toHaveCount(0);
    await expect(page.getByTestId("history-cell-2026-05-01-am")).toHaveCount(0);

    // Push Health card flags revoked Helper alerts off
    const pushHealth = page.getByRole("region", {
      name: "Phone Alerts Health",
    });
    await expect(
      pushHealth.getByText(/Helper Devices:\s*0/),
    ).toBeVisible();
    await expect(pushHealth.getByText("Alerts Off")).toBeVisible();
    await expect(pushHealth.getByText(/Android Chrome/)).toBeVisible();

    const sendTestButtons = pushHealth.getByRole("button", {
      name: "Send Test Alert",
    });
    await expect(sendTestButtons).toHaveCount(4);
    await expect(sendTestButtons.first()).toBeDisabled();

    trap.assertClean();
  });

  test("Copy Messenger Nudge copies plain CEFR A2 zero-emoji text when clipboard is granted", async ({
    browser,
    request,
  }) => {
    await resetTestStore(request, fixedNowIso);

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      permissions: ["clipboard-read", "clipboard-write"],
    });

    try {
      const page = await context.newPage();
      await page.clock.setFixedTime(new Date(fixedNowIso));
      const trap = attachTelemetryTrap(page);

      await page.goto(`/h/${HOUSEHOLD_TOKEN}/owner`);
      await waitForHouseholdCookie(page);

      const copyBtn = page.getByRole("button", {
        name: "Copy Messenger Nudge",
      });
      await copyBtn.click();

      await expect(
        page.getByRole("button", { name: "Copied for Messenger" }),
      ).toBeVisible();

      const copiedText = await page.evaluate(() =>
        navigator.clipboard.readText(),
      );
      expect(copiedText).toContain("Hi everyone! Quick check on Maki:");
      expect(copiedText).toContain("You can tap done here:");
      expect(EMOJI_PATTERN.test(copiedText)).toBe(false);

      trap.assertClean();
    } finally {
      await context.close();
    }
  });

  test("Copy Messenger Nudge renders selectable fallback textarea when clipboard write is denied", async ({
    browser,
    request,
  }) => {
    await resetTestStore(request, fixedNowIso);

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });

    try {
      const page = await context.newPage();
      await page.clock.setFixedTime(new Date(fixedNowIso));
      await page.addInitScript(() => {
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: {
            writeText: () =>
              Promise.reject(new DOMException("Denied", "NotAllowedError")),
          },
        });
      });
      const trap = attachTelemetryTrap(page);

      await page.goto(`/h/${HOUSEHOLD_TOKEN}/owner`);
      await waitForHouseholdCookie(page);

      await page
        .getByRole("button", { name: "Copy Messenger Nudge" })
        .click();

      const fallbackTextarea = page.getByRole("textbox", {
        name: "Send a Quick Nudge",
      });
      await expect(fallbackTextarea).toBeVisible();
      await expect(fallbackTextarea).toHaveAttribute("readonly", "");

      const value = await fallbackTextarea.inputValue();
      expect(value).toContain("Hi everyone! Quick check on Maki:");
      expect(EMOJI_PATTERN.test(value)).toBe(false);

      await expect(
        page.getByText(
          "Copy blocked by browser. Copy the text above directly.",
        ),
      ).toBeVisible();

      trap.assertClean();
    } finally {
      await context.close();
    }
  });
});
