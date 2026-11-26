import type { CaregiverRole, SupplyKey, SupplyLevel } from "./types";

/**
 * Centralized CEFR A2 caregiver copy and notification templates.
 * All user-facing strings obey: active SVO, <= 20 words per sentence,
 * zero blame/guilt wording, and zero unicode emojis.
 */

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

export const UI_COPY = {
  brandTitle: "Maki Care",
  brandTitleShort: "Maki",
  brandOwnerNav: "Owner",
  brandBoardNav: "Care Board",
  brandSetupNav: "Phone Setup",

  accessGate: {
    title: "Household Link Needed",
    body: "This Maki link is missing or wrong. Ask Jed for the home link in Messenger.",
    retryLabel: "Try Link Again",
  },

  webViewBanner: {
    title: "Open Outside Messenger",
    body: "Alerts cannot work inside Messenger. Open the Maki icon on your Home Screen instead.",
    openHint: "Tap the menu and pick Open in Chrome or Safari.",
    dismissLabel: "Keep Logging Here",
  },

  avatarPicker: {
    title: "Who is helping Maki today?",
    subtitle: "Tap your name once. This phone remembers.",
    reassurance: "No password needed. You can switch later.",
    rememberLabel: "Remember me on this phone",
    switchTitle: "Switch Person",
    switchSubtitle: "Pick who is using this phone right now.",
    closeLabel: "Close",
    changeNameLabel: "Change Name",
    switchTriggerSuffix: "Switch",
    roles: {
      helper: "Daily Helper",
      family: "Family",
      owner: "Owner View",
    } satisfies Record<CaregiverRole, string>,
  },

  survivability: {
    safeTitle: "Maki is Safe",
    dueTitle: "Maki Needs Care",
    overdueTitle: "Care Is Late",
    coreLabelSuffix: "Core",
    mealsProgressPrefix: "Meals today:",
    allSetToday: "Meals and litter are on track today.",
  },

  meals: {
    title: "Meals Today",
    goalDoneBadge: "Goal Met",
    states: {
      UPCOMING: "In Progress",
      DUE_NOW: "Check-in Due",
      OVERDUE: "Short",
      DONE: "Goal Met",
    },
    emptyBody: (target: number) =>
      `Tap below each time you feed Maki. Today's goal is ${target} meals.`,
    progressBody: (count: number, target: number) =>
      `${count} of ${target} meals logged today. Tap below after the next meal.`,
    goalMetBody: (target: number) =>
      `Maki had ${target} meals today. You can still log extra meals below.`,
    overdueBody: (count: number, target: number, helperName: string) =>
      `Only ${count} of ${target} meals logged. Check Maki's bowl or ask ${helperName}.`,
    markFedCta: "Mark Fed",
    extraMealCta: "Log Extra Meal",
    savingCta: "Saving Meal...",
    undoCta: "Undo",
    changeNameCta: "Change Name",
    priorDayUndoError: "You can only undo meals from today.",
    savedToast: (timeLabel: string, count: number, target: number) =>
      `Saved: Meal ${count} of ${target} at ${timeLabel}.`,
    foodPiggybackQuestion: "Quick check: How much cat food is left?",
  },

  litter: {
    title: "Litter Box",
    cadenceHint: "Clean every 2 days",
    states: {
      UPCOMING: "Upcoming",
      DUE_NOW: "Due Now",
      OVERDUE: "Overdue",
      DONE: "Clean",
    },
    neverLogged: "Not logged yet. Clean the litter box and tap below.",
    upcomingBody: (lastLabel: string, nextLabel: string) =>
      `Last cleaned ${lastLabel}. Next clean ${nextLabel}.`,
    dueBody: "It has been 2 days. Tap below after cleaning the box.",
    overdueBody: (hoursLate: number) =>
      `Litter clean is ${hoursLate} hours late. Tap below when done.`,
    markCleanedCta: "Mark Litter Cleaned",
    savingCta: "Saving Clean...",
    litterPiggybackQuestion: "Quick check: How much cat litter is left?",
  },

  supplies: {
    title: "Supplies",
    foodLabel: "Cat Food",
    litterLabel: "Cat Litter",
    editLabel: "Edit",
    levels: {
      FULL: "Full",
      HALF: "Half",
      LOW: "Low",
      EMPTY: "Empty",
    } satisfies Record<SupplyLevel, string>,
    itemName: (key: SupplyKey) =>
      key === "CAT_FOOD" ? "Cat Food" : "Cat Litter",
    updatedSaved: (label: string, level: SupplyLevel) =>
      `${label} marked ${level.toLowerCase()}.`,
  },

  play: {
    title: "Out-of-Room Play",
    bonusNote: "Optional weekly bonus goal.",
    emptyBody: "Take Maki out of the room for 10 minutes to play.",
    goalMetBody: (target: number) =>
      `Great work. Maki had ${target} out-of-room sessions this week.`,
    goalDoneBadge: "Goal Done",
    cta: "Log Play Time",
    extraCta: "Log Extra Play",
    savingCta: "Saving Play...",
    savedToast: "Saved: Play time logged for Maki.",
  },

  syncStates: {
    loadingDashboard: "Loading Maki's meals and supplies from home.",
    offlineTitle: "Could Not Save Update",
    offlineBody:
      "Your phone could not reach the server. Check your internet and tap Try Again.",
    tryAgainCta: "Try Again",
    refreshCta: "Refresh Status",
  },

  ownerView: {
    title: "Owner View",
    houseTimeLabel: "House Time (Manila)",
    localTimeLabel: "Your Time (Local)",
    escalationLabel: "Meal Check-in Steps",
    nudgeCardTitle: "Send a Quick Nudge",
    copyNudgeCta: "Copy Messenger Nudge",
    copiedNudgeCta: "Copied for Messenger",
    clipboardFallbackNote: "Copy blocked by browser. Copy the text above directly.",
    timelineTitle: "Today's Care Timeline",
    historyTitle: "14-Day Care History",
    last7Label: "Last 7 Days",
    prev7Label: "Previous 7 Days",
    pushHealthTitle: "Phone Alerts Health",
    cronHealthLabel: "Cron Check",
    alertsOnBadge: "Alerts On",
    alertsOffBadge: "Alerts Off",
    notSetBadge: "Not Installed",
    sendTestAlertCta: "Send Test Alert",
    openSetupCta: "Open Phone Setup",
  },

  setupView: {
    title: "Set Up This Phone in 2 Minutes",
    subtitle: "Do these 4 steps on Ate's or family's phone before leaving home.",
    personLabel: "Setting up for",
    step1Title: "1. Open Personal Link",
    step1Body: (name: string) => `Link locked to ${name} so names never reset.`,
    copyLinkCta: "Copy Personal Link",
    copiedLinkCta: "Link Copied",
    step2Title: "2. Add to Home Screen",
    iosStepA: "Tap Share at the bottom of Safari.",
    iosStepB: "Tap Add to Home Screen.",
    iosStepC: "Open Maki Care from your Home Screen icon.",
    androidStepA: "Tap the Chrome menu in the top corner.",
    androidStepB: "Tap Install app or Add to Home Screen.",
    androidStepC: "Set Chrome battery to Unrestricted and keep phone alarms for meal times.",
    standaloneReady: "Running from Home Screen icon.",
    standaloneWaiting: "Open from the Home Screen icon to enable alerts.",
    step3Title: "3. Turn On Phone Alerts",
    step3Body: "Lets this phone ring for daily meal check-ins and litter alerts.",
    allowAlertsCta: "Allow Phone Alerts",
    alertsActiveText: "Phone alerts are active on this device.",
    alertsBlockedText:
      "This phone blocked alerts. Allow notifications in phone settings and try again.",
    step4Title: "4. Send a Test Ping",
    step4Body: "Check that this phone rings right now.",
    sendTestCta: "Send Test Ping",
    testPassedText: "Test alert sent. Check your notification shade.",
  },

  ownerSettings: {
    pinTitle: "Enter Owner 4-Digit PIN",
    pinSubtitle: "Only Jed can change schedules, people, or secret links.",
    pinMalformed: "Enter exactly 4 numbers.",
    pinWrong: "Wrong PIN. Try again.",
    pinLocked: "Too many wrong PIN tries. Wait 15 minutes and try again.",
    settingsTitle: "Owner Settings",
    lockCta: "Lock Settings",
    savedSettings: "Settings saved.",
    rotateWarning: "Rotating the link makes the old home link stop working.",
    peopleTitle: "Household People",
    peopleSubtitle: "Add helpers or family, pick badge colors, or hide people.",
    addPersonTitle: "Add New Person",
    addPersonCta: "Add Person",
    nameLabel: "Name",
    namePlaceholder: "e.g. Lola or Sitter",
    initialsLabel: "Initials",
    roleLabel: "Role",
    colorLabel: "Badge Color",
    removeCta: "Remove",
    removedPerson: "Person removed.",
    lastOwnerError: "Keep at least one active owner.",
    duplicateSlugError: "Each person needs a unique link name.",
    hasHistoryError: "This person has past care logs. Turn off Active instead.",
    colorNames: {
      helper: "Teal",
      mom: "Plum",
      dad: "Blue",
      sibling: "Amber",
      owner: "Ginger",
    },
  },
} as const;

export const PUSH_TEMPLATES = {
  mealShortfallCheckIn: (count: number, target: number) => ({
    title: `Maki Meals Check-in: ${count} of ${target}`,
    body: "If you fed Maki today, tap Mark Fed so everyone knows.",
  }),
  mealShortfallOwnerEscalation: (count: number, target: number) => ({
    title: `Maki Meals Short: ${count} of ${target}`,
    body: "Open Owner View to check today's log or send a Messenger nudge.",
  }),
  litterDueHelper: () => ({
    title: "Clean Maki's Litter Box",
    body: "It has been 2 days. Tap Mark Litter Cleaned when done.",
  }),
  litterEscalateOwner: () => ({
    title: "Maki Litter Box Is 1 Day Overdue",
    body: "Last clean was over 72 hours ago. Check Owner View.",
  }),
  supplyOwnerAlert: (itemLabel: string, level: "LOW" | "EMPTY") => ({
    title:
      level === "EMPTY"
        ? `Maki ${itemLabel} Is Empty`
        : `Maki ${itemLabel} Is Low`,
    body:
      level === "EMPTY"
        ? "Please arrange a refill today."
        : "Order a new supply soon before it runs out.",
  }),
  playFamilyNudge: (count: number, target: number) => ({
    title: `Maki Weekly Play: ${count} of ${target}`,
    body: "Have 10 minutes today? Let Maki stretch outside the room.",
  }),
  pushHealthOwnerAlert: (helperCount: number) => ({
    title: "Helper Phone Alerts Turned Off",
    body:
      helperCount === 0
        ? "Helper push device stopped working. Open Owner View for setup link."
        : "A household push device expired.",
  }),
  testPing: (name: string) => ({
    title: "Maki Alerts Work",
    body: `Test alert for ${name} arrived safely.`,
  }),
} as const;

export function buildMessengerNudgeText(params: {
  taskSummary: string;
  dashboardUrl: string;
}): string {
  return `Hi everyone! Quick check on Maki: ${params.taskSummary}. You can tap done here: ${params.dashboardUrl}`;
}
