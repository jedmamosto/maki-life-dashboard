# Maki Care User Manual

This manual covers daily tasks, common household scenarios, and error recovery in Maki Care.

## 1. Daily How-Tos

### Helper (Ate - Daily Helper)

1. Open your personal `?who=ate` link from your Home Screen icon.
2. First visit: If `Who is helping Maki today?` appears, tap `Ate`. No password is needed.
3. Log `Meals Today`: Feed Maki first, then tap `Mark Fed` anytime (no early-feed lockout). Each tap logs a timestamped entry (`1 of 3`, `2 of 3`, `3 of 3`) and shows `Saved: Meal [count] of [target] at [time].` with a 10-second `Undo` bar. Extra meals can still be logged via `Log Extra Meal`.
4. Sunday food check: After reaching the daily meal goal on Sunday, answer `Quick check: How much cat food is left?` (`Full`, `Half`, `Low`, or `Empty`).
5. Clean `Litter Box` (every 48 hours / 2 days): Clean the box, then tap `Mark Litter Cleaned`. Every 3rd clean asks `Quick check: How much cat litter is left?`.
6. Update `Supplies` anytime: Tap `Edit` on `Cat Food` or `Cat Litter`, then pick `Full`, `Half`, `Low`, or `Empty`. Marking `Low` or `Empty` sends a push alert to the owner.

### Family (Mom, Dad, Sibling)

1. Check before feeding: Look at the timestamped entries inside `Meals Today` (`[Name] • [time]`) so Maki does not get fed twice unintentionally.
2. Log optional `Out-of-Room Play`: Take Maki out for 10 minutes, then tap `Log Play Time` (or `Log Extra Play` after 3 sessions). Play is an optional weekly goal and never lowers the Survivability core count.

### Remote Owner (Jed)

1. Open the `Owner` tab (`/h/[token]/owner`).
2. Check clocks and alerts: Compare `House Time (Manila)` with `Your Time (Local)` and watch `Meal Check-in Steps` (`Quiet / On Track`, `Check-in Sent`, `Owner Urgent`).
3. Read `14-Day Care History`: Check `Meal goal met` % and `Core streak` days. On mobile, switch between `Last 7 Days` and `Previous 7 Days`. Tap any date column or cell to view each meal timestamp and caregiver.
4. Check `Phone Alerts Health` & `Cron Check`: Confirm each device shows `Alerts On`, tap `Send Test Alert`, and confirm the last cron tick timestamp is recent.
5. Send a nudge: Tap `Copy Messenger Nudge`, then paste the message into Messenger.
6. Change settings: Tap the gear icon (`/h/[token]/settings`) and enter your 4-digit Owner PIN (`Unlock Settings`). Update `Daily Meal Goal`, `Daily Meal Check-in Time`, litter hours, weekly play goal, `Owner Alert Email`, people, `?who=` links, PIN, or secret home link. Tap `Lock Settings` when done (unlock expires after 2 hours).

## 2. Common Household Scenarios

### Feeding Anytime Without Schedule Lockouts

- Caregivers can tap `Mark Fed` at any time of day with no early-feed window restriction.
- Once `count >= dailyMealGoal`, the server automatically skips remaining daily check-in reminders for that day.

### Accidental Meal Tap or Wrong Name on a Shared Phone

- Accidental tap today: Tap `Undo` on the bottom bar within 10 seconds, or tap `Undo` next to the specific timestamped entry inside `Meals Today`. Undoing re-arms today's shortfall check-in if the count drops below the daily goal.
- Wrong name on a meal entry: Tap `Change Name` on that entry and select who fed Maki.
- Switch person on a shared phone: Tap the person button in the top header (`Switch`), then pick your name before logging tasks.

## 3. Error and Failure Recovery Guide

### `Household Link Needed`

The URL is missing `/h/[token]`, has a typo, or uses an old token after `Rotate Home Link`. Ask the owner for the current home link in Messenger, open it in Safari or Chrome, or tap `Try Link Again`.

### `Open Outside Messenger`

You opened the link inside Messenger's in-app browser, which blocks push alerts. Tap the Messenger menu and pick `Open in Chrome` or `Open in Safari`, or open the `Maki Care` Home Screen icon. Tap `Keep Logging Here` if you only need to log one task right now.

### `Could Not Save Update`

Your phone lost internet or could not reach the server. Check Wi-Fi or mobile data, then tap `Try Again` (safe to retry without creating duplicate litter or play entries) or tap `Refresh Status`.

### `Too early for the [time] meal.`

You tapped outside the 90-minute early feeding window. Wait until `8:30 AM` (`10:00 AM` meal), `12:30 PM` (`2:00 PM` meal), or `5:30 PM` (`7:00 PM` meal). Then tap `Mark Fed Early`.

### `You can only undo meals from today.`

You tried to undo a meal from an earlier Manila calendar day. Past meal logs stay locked in the app, and only today's meals can be undone.

### `Alerts Off`, `Not Installed`, or Blocked Push Alerts

This happens when:
- A phone shows `This phone blocked alerts. Allow notifications in phone settings and try again.`
- An iPhone browser shows `Open from the Home Screen icon to enable alerts.` or `This browser cannot run phone alerts.`
- A subscription expired (`410`), triggering `Helper Phone Alerts Turned Off` on the owner phone.
- Android battery optimization stopped Chrome background push delivery.

Fix by device:
- iPhone: Open the `?who=` link in Safari, tap `Share` -> `Add to Home Screen`, launch the Home Screen icon, then tap `Allow Phone Alerts` and `Send Test Ping` in `/h/[token]/setup`.
- Android: Install the app from Chrome, allow notifications in Android settings, and set Chrome Battery to `Unrestricted`. Keep `10:00 AM`, `2:00 PM`, and `7:00 PM` Clock alarms active, then re-run `Allow Phone Alerts` and `Send Test Ping` in `/h/[token]/setup`.

### `Copy blocked by browser. Copy the text above directly.`

Your browser blocked automatic clipboard access for `Copy Messenger Nudge` or `Copy Personal Link`. Copy the text inside the box that appears on screen and paste it into Messenger.

### `Wrong PIN. Try again.`

You entered an incorrect 4-digit Owner PIN (or `OWNER_DEFAULT_PIN` is unset in production with no saved PIN hash). Re-enter the correct PIN, or verify `OWNER_DEFAULT_PIN` in Vercel settings if no custom PIN was saved yet.

### `Too many wrong PIN tries. Wait 15 minutes and try again.`

Five wrong PIN tries in a row triggered the 15-minute lockout (`HTTP 429`). Wait 15 minutes before retrying the PIN. Normal Care Board logging stays unlocked during this time.
