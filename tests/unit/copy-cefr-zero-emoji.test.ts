import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BANNED_COPY_WORDS,
  PUSH_TEMPLATES,
  UI_COPY,
  buildMessengerNudgeText,
} from "@/lib/copy";

const EMOJI_PATTERN = /\p{Extended_Pictographic}/u;

function listSourceFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) {
    return results;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listSourceFiles(fullPath));
    } else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

function collectStaticStrings(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (typeof value === "function") {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectStaticStrings(item));
  }
  if (value && typeof value === "object") {
    return Object.values(value).flatMap((entry) => collectStaticStrings(entry));
  }
  return [];
}

function splitSentences(text: string): string[] {
  const withoutUrls = text.replace(/https?:\/\/\S+/g, "link");
  return withoutUrls
    .split(/[.!?]+(?:\s+|$)/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

describe("CEFR A2 copy compliance and zero-emoji scan", () => {
  it("[AC-035] contains zero unicode emojis anywhere in src/", () => {
    const srcDir = path.resolve(process.cwd(), "src");
    const files = listSourceFiles(srcDir);
    expect(files.length).toBeGreaterThan(0);

    const violations: string[] = [];
    for (const filePath of files) {
      const content = fs.readFileSync(filePath, "utf8");
      if (EMOJI_PATTERN.test(content)) {
        violations.push(path.relative(process.cwd(), filePath));
      }
    }
    expect(violations).toEqual([]);
  });

  it("[AC-035] keeps all UI_COPY and PUSH_TEMPLATES free of banned words and <= 20 words/sentence", () => {
    const uiStaticStrings = collectStaticStrings(UI_COPY);
    const uiFunctionStrings = [
      UI_COPY.meals.upcomingBody("10:00 AM"),
      UI_COPY.meals.overdueBody(45, "Ate"),
      UI_COPY.meals.doneBody("Ate", "10:05 AM"),
      UI_COPY.meals.earlyWindowError("10:00 AM"),
      UI_COPY.meals.alreadyFedBody("Ate", "10:05 AM"),
      UI_COPY.meals.savedToast("10:05 AM"),
      UI_COPY.litter.upcomingBody("Yesterday, 2:00 PM", "Tomorrow, 2:00 PM"),
      UI_COPY.litter.overdueBody(24),
      UI_COPY.supplies.itemName("CAT_FOOD"),
      UI_COPY.supplies.itemName("CAT_LITTER"),
      UI_COPY.supplies.updatedSaved("Cat Food", "LOW"),
      UI_COPY.supplies.updatedSaved("Cat Litter", "EMPTY"),
      UI_COPY.play.goalMetBody(3),
      UI_COPY.setupView.step1Body("Ate"),
    ];

    const pushStrings = [
      PUSH_TEMPLATES.mealDueHelper("10:00 AM"),
      PUSH_TEMPLATES.mealSelfCheckHelper("10:00 AM"),
      PUSH_TEMPLATES.mealEscalateFamily("10:00 AM", "Ate"),
      PUSH_TEMPLATES.mealEscalateOwner("10:00 AM", 120),
      PUSH_TEMPLATES.litterDueHelper(),
      PUSH_TEMPLATES.litterEscalateOwner(),
      PUSH_TEMPLATES.supplyOwnerAlert("Cat Food", "LOW"),
      PUSH_TEMPLATES.supplyOwnerAlert("Cat Litter", "EMPTY"),
      PUSH_TEMPLATES.playFamilyNudge(1, 3),
      PUSH_TEMPLATES.pushHealthOwnerAlert(0),
      PUSH_TEMPLATES.pushHealthOwnerAlert(1),
      PUSH_TEMPLATES.testPing("Ate"),
    ].flatMap((entry) => [entry.title, entry.body]);

    const messengerString = buildMessengerNudgeText({
      taskSummary: "10:00 AM meal is waiting",
      dashboardUrl: "https://maki.example.com/h/secret",
    });

    const allStrings = [
      ...uiStaticStrings,
      ...uiFunctionStrings,
      ...pushStrings,
      messengerString,
    ];

    for (const text of allStrings) {
      expect(EMOJI_PATTERN.test(text)).toBe(false);
      const lower = text.toLowerCase();
      for (const banned of BANNED_COPY_WORDS) {
        const bannedRegex = new RegExp(`\\b${banned}\\b`, "i");
        expect(bannedRegex.test(lower)).toBe(false);
      }
      for (const sentence of splitSentences(text)) {
        const wordCount = sentence.split(/\s+/).filter(Boolean).length;
        expect(wordCount).toBeLessThanOrEqual(20);
      }
    }
  });
});
