import type { CaregiverRole, SupplyKey, SupplyLevel } from "./types";

/**
 * Centralized CEFR A2 caregiver copy and notification templates.
 * All user-facing strings obey: Sentence case, active SVO, <= 20 words per sentence,
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
  brandBoardNav: "Care board",
  brandSetupNav: "Phone setup",

  accessGate: {
    title: "Household link needed",
    body: "This Maki link is missing or wrong. Ask Jed for the home link in Messenger.",
    retryLabel: "Try link again",
  },

  webViewBanner: {
    title: "Open outside Messenger",
    body: "Alerts cannot work inside Messenger. Open the Maki icon on your Home Screen instead.",
    openHint: "Tap the menu and pick Open in Chrome or Safari.",
    dismissLabel: "Keep logging here",
  },

  avatarPicker: {
    title: "Who is helping Maki today?",
    subtitle: "Tap your name once. This phone remembers.",
    reassurance: "No password needed. You can switch later.",
    rememberLabel: "Remember me on this phone",
    switchTitle: "Switch person",
    switchSubtitle: "Pick who is using this phone right now.",
    closeLabel: "Close",
    changeNameLabel: "Change name",
    switchTriggerSuffix: "Switch",
    roles: {
      helper: "Daily helper",
      family: "Family",
      owner: "Owner view",
    } satisfies Record<CaregiverRole, string>,
  },

  survivability: {
    safeTitle: "Maki is safe",
    dueTitle: "Maki needs care",
    overdueTitle: "Care is late",
    coreLabelSuffix: "core",
    mealsProgressPrefix: "Meals today:",
    allSetToday: "Meals and litter are on track today.",
  },

  meals: {
    title: "Meals today",
    goalDoneBadge: "Goal met",
    states: {
      UPCOMING: "In progress",
      DUE_NOW: "Check-in due",
      OVERDUE: "Short",
      DONE: "Goal met",
    },
    emptyBody: (target: number) =>
      `Tap below each time you feed Maki. Today's goal is ${target} meals.`,
    progressBody: (count: number, target: number) =>
      `${count} of ${target} meals logged today. Tap below after the next meal.`,
    goalMetBody: (target: number) =>
      `Maki had ${target} meals today. You can still log extra meals below.`,
    overdueBody: (count: number, target: number, helperName: string) =>
      `Only ${count} of ${target} meals logged. Check Maki's bowl or ask ${helperName}.`,
    markFedCta: "Mark fed",
    extraMealCta: "Log extra meal",
    savingCta: "Saving meal...",
    undoCta: "Undo",
    changeNameCta: "Change name",
    priorDayUndoError: "You can only undo meals from today.",
    savedToast: (timeLabel: string, count: number, target: number) =>
      `Saved: Meal ${count} of ${target} at ${timeLabel}.`,
    foodPiggybackQuestion: "Quick check: How much cat food is left?",
  },

  litter: {
    title: "Litter box",
    cadenceHint: "Clean every 2 days",
    states: {
      UPCOMING: "Upcoming",
      DUE_NOW: "Due now",
      OVERDUE: "Overdue",
      DONE: "Clean",
    },
    neverLogged: "Not logged yet. Clean the litter box and tap below.",
    upcomingBody: (lastLabel: string, nextLabel: string) =>
      `Last cleaned ${lastLabel}. Next clean ${nextLabel}.`,
    dueBody: "It has been 2 days. Tap below after cleaning the box.",
    overdueBody: (hoursLate: number) =>
      `Litter clean is ${hoursLate} hours late. Tap below when done.`,
    markCleanedCta: "Mark litter cleaned",
    savingCta: "Saving clean...",
    savedToast: "Saved: Litter box marked clean.",
    litterPiggybackQuestion: "Quick check: How much cat litter is left?",
  },

  supplies: {
    title: "Supplies",
    foodLabel: "Cat food",
    litterLabel: "Cat litter",
    editLabel: "Edit",
    levels: {
      FULL: "Full",
      HALF: "Half",
      LOW: "Low",
      EMPTY: "Empty",
    } satisfies Record<SupplyLevel, string>,
    itemName: (key: SupplyKey) =>
      key === "CAT_FOOD" ? "Cat food" : "Cat litter",
    updatedSaved: (label: string, level: SupplyLevel) =>
      `${label} marked ${level.toLowerCase()}.`,
  },

  play: {
    title: "Out-of-room play",
    bonusNote: "Optional weekly bonus goal.",
    emptyBody: "Take Maki out of the room for 10 minutes to play.",
    goalMetBody: (target: number) =>
      `Great work. Maki had ${target} out-of-room sessions this week.`,
    goalDoneBadge: "Goal done",
    cta: "Log play time",
    extraCta: "Log extra play",
    savingCta: "Saving play...",
    savedToast: "Saved: Play time logged for Maki.",
  },

  syncStates: {
    loadingDashboard: "Loading Maki's meals and supplies from home.",
    offlineTitle: "Could not save update",
    offlineBody:
      "Your phone could not reach the server. Check your internet and tap Try again.",
    tryAgainCta: "Try again",
    refreshCta: "Refresh status",
  },

  ownerView: {
    title: "Owner view",
    houseTimeLabel: "House time (Manila)",
    localTimeLabel: "Your time (Local)",
    escalationLabel: "Meal check-in steps",
    nudgeCardTitle: "Send a quick nudge",
    copyNudgeCta: "Copy Messenger nudge",
    copiedNudgeCta: "Copied for Messenger",
    clipboardFallbackNote: "Copy blocked by browser. Copy the text above directly.",
    timelineTitle: "Today's care timeline",
    historyTitle: "14-day care history",
    last7Label: "Last 7 days",
    prev7Label: "Previous 7 days",
    pushHealthTitle: "Phone alerts health",
    cronHealthLabel: "Cron check",
    alertsOnBadge: "Alerts on",
    alertsOffBadge: "Alerts off",
    notSetBadge: "Not installed",
    sendTestAlertCta: "Send test alert",
    openSetupCta: "Open phone setup",
  },

  setupView: {
    title: "Set up this phone in 2 minutes",
    subtitle: "Do these 4 steps on Ate's or family's phone before leaving home.",
    personLabel: "Setting up for",
    step1Title: "1. Open personal link",
    step1Body: (name: string) => `Link locked to ${name} so names never reset.`,
    copyLinkCta: "Copy personal link",
    copiedLinkCta: "Link copied",
    step2Title: "2. Add to Home Screen",
    iosStepA: "Tap Share at the bottom of Safari.",
    iosStepB: "Tap Add to Home Screen.",
    iosStepC: "Open Maki Care from your Home Screen icon.",
    androidStepA: "Tap the Chrome menu in the top corner.",
    androidStepB: "Tap Install app or Add to Home Screen.",
    androidStepC: "Set Chrome battery to Unrestricted and keep phone alarms for meal times.",
    standaloneReady: "Running from Home Screen icon.",
    standaloneWaiting: "Open from the Home Screen icon to enable alerts.",
    step3Title: "3. Turn on phone alerts",
    step3Body: "Lets this phone ring for daily meal check-ins and litter alerts.",
    allowAlertsCta: "Allow phone alerts",
    alertsActiveText: "Phone alerts are active on this device.",
    alertsBlockedText:
      "This phone blocked alerts. Allow notifications in phone settings and try again.",
    step4Title: "4. Send a test ping",
    step4Body: "Check that this phone rings right now.",
    sendTestCta: "Send test ping",
    testPassedText: "Test alert sent. Check your notification shade.",
  },

  ownerSettings: {
    pinTitle: "Enter owner 4-digit PIN",
    pinSubtitle: "Only Jed can change schedules, people, or secret links.",
    pinMalformed: "Enter exactly 4 numbers.",
    pinWrong: "Wrong PIN. Try again.",
    pinLocked: "Too many wrong PIN tries. Wait 15 minutes and try again.",
    unlockCta: "Unlock settings",
    settingsTitle: "Owner settings",
    lockCta: "Lock settings",
    scheduleTitle: "Meal times and goals",
    dailyMealGoalLabel: "Daily meal goal",
    mealReminderTimeLabel: "Daily meal check-in time",
    litterIntervalLabel: "Litter interval (hours)",
    weeklyPlayGoalLabel: "Weekly play goal",
    ownerEmailLabel: "Owner alert email",
    saveScheduleCta: "Save schedule and email",
    savedSettings: "Settings saved.",
    rotateTitle: "Create a new home link",
    rotateWarning: "Rotating the link makes the old home link stop working.",
    rotateStartCta: "Rotate home link",
    rotateConfirmCta: "Yes, create new link",
    cancelCta: "Cancel",
    changePinTitle: "Change 4-digit owner PIN",
    updatePinCta: "Update PIN",
    peopleTitle: "Household people",
    peopleSubtitle: "Add helpers or family, pick badge colors, or hide people.",
    savePeopleCta: "Save people",
    copyLinkCta: "Copy link",
    addPersonTitle: "Add new person",
    addPersonCta: "Add person",
    nameLabel: "Name",
    namePlaceholder: "e.g. Lola or Sitter",
    initialsLabel: "Initials",
    roleLabel: "Role",
    colorLabel: "Badge color",
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
    title: `Maki meals check-in: ${count} of ${target}`,
    body: "If you fed Maki today, tap Mark fed so everyone knows.",
  }),
  mealShortfallOwnerEscalation: (count: number, target: number) => ({
    title: `Maki meals short: ${count} of ${target}`,
    body: "Open Owner view to check today's log or send a Messenger nudge.",
  }),
  litterDueHelper: () => ({
    title: "Clean Maki's litter box",
    body: "It has been 2 days. Tap Mark litter cleaned when done.",
  }),
  litterEscalateOwner: () => ({
    title: "Maki litter box is 1 day overdue",
    body: "Last clean was over 72 hours ago. Check Owner view.",
  }),
  supplyOwnerAlert: (itemLabel: string, level: "LOW" | "EMPTY") => ({
    title:
      level === "EMPTY"
        ? `Maki ${itemLabel.toLowerCase()} is empty`
        : `Maki ${itemLabel.toLowerCase()} is low`,
    body:
      level === "EMPTY"
        ? "Please arrange a refill today."
        : "Order a new supply soon before it runs out.",
  }),
  playFamilyNudge: (count: number, target: number) => ({
    title: `Maki weekly play: ${count} of ${target}`,
    body: "Have 10 minutes today? Let Maki stretch outside the room.",
  }),
  pushHealthOwnerAlert: (helperCount: number) => ({
    title: "Helper phone alerts turned off",
    body:
      helperCount === 0
        ? "Helper push device stopped working. Open Owner view for setup link."
        : "A household push device expired.",
  }),
  testPing: (name: string) => ({
    title: "Maki alerts work",
    body: `Test alert for ${name} arrived safely.`,
  }),
} as const;

export function buildMessengerNudgeText(params: {
  taskSummary: string;
  dashboardUrl: string;
}): string {
  return `Hi everyone! Quick check on Maki: ${params.taskSummary}. You can tap done here: ${params.dashboardUrl}`;
}
