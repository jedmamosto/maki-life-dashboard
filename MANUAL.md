# Maki Care User Manual

This manual covers daily tasks, common household scenarios, and error recovery in Maki Care.

## 1. Daily How-Tos

### Helper (Ate - Daily Helper)

1. Open your personal `?who=ate` link from your Home Screen icon.
2. First visit: If `Who is helping Maki today?` appears, tap `Ate`. No password is needed.
3. Log `10:00 AM Meal` and `7:00 PM Meal`: Feed Maki, then tap `Mark Fed` (or `Mark Fed Now` if late). You see `Saved: Maki fed at [time].` with a 10-second `Undo` bar.
4. Sunday 7:00 PM food check: After marking Sunday's `7:00 PM Meal` done, answer `Quick check: How much cat food is left?` (`Full`, `Half`, `Low`, or `Empty`).
5. Clean `Litter Box` (every 48 hours / 2 days): Clean the box, then tap `Mark Litter Cleaned`. Every 3rd clean asks `Quick check: How much cat litter is left?`.
6. Update `Supplies` anytime: Tap `Edit` on `Cat Food` or `Cat Litter`, then pick `Full`, `Half`, `Low`, or `Empty`. Marking `Low` or `Empty` sends a push alert to the owner.

### Family (Mom, Dad, Sibling)

1. Check before feeding: Look for `Fed by [Name] at [time]. Maki is all set.` so Maki does not get fed twice.
2. Handle `T+45m` backup alerts: After 45 minutes late, Family and Owner phones get `Check Maki's [time] Meal`. Check Maki's bowl or ask `Ate` first, then tap `Mark Fed Now`.
3. Log optional `Out-of-Room Play`: Take Maki out for 10 minutes, then tap `Log Play Time` (or `Log Extra Play` after 3 sessions). Play is an optional weekly goal and never lowers the `5 Core` Survivability status.

### Remote Owner (Jed)

1. Open the `Owner` tab (`/h/[token]/owner`).
2. Check clocks and alerts: Compare `House Time (Manila)` with `Your Time (Local)` and watch `Meal Alert Steps` (`T+0m`, `T+20m`, `T+45m`, `T+120m`).
3. Read `14-Day Care History`: Check `On-time meals` % and `Core streak` days. On mobile, switch between `Last 7 Days` and `Previous 7 Days`. Tap any date column or cell to see who logged each task.
4. Check `Phone Alerts Health`: Confirm each device shows `Alerts On`, tap `Send Test Alert`, or tap `Open Phone Setup`.
5. Send a nudge: Tap `Copy Messenger Nudge`, then paste the message into Messenger.
6. Change settings: Tap the gear icon (`/h/[token]/settings`) and enter your 4-digit Owner PIN (`Unlock Settings`). Update meal times, litter hours, weekly play goal, `Owner Alert Email`, people, `?who=` links, PIN, or secret home link. Tap `Lock Settings` when done (unlock expires after 2 hours).

## 2. Common Household Scenarios

### Feeding Early (Up to 90 Minutes Before Meal Time)

- Within 90 minutes before `10:00 AM` (`8:30 AM`+) or `7:00 PM` (`5:30 PM`+), the meal button reads `Mark Fed Early`.
- Tap `Mark Fed Early` after feeding Maki. The server skips all reminder alerts for that meal automatically.

### Two People Tap `Mark Fed` at the Same Time

- Only one active log can exist per meal slot.
- The second phone shows `Already Fed` (`[Name] already fed Maki at [time]. No extra food is needed.`).
- Do not feed Maki again. Tap `Refresh Status` to load the latest board.

### Accidental Meal Tap or Wrong Name on a Shared Phone

- Accidental tap today: Tap `Undo` on the bottom bar within 10 seconds, or tap `Undo Meal Log` on the meal card. Undoing re-arms reminders for that meal slot.
- Wrong name on a meal card: Tap `Change Name` on the done meal card and select who fed Maki.
- Switch person on a shared phone: Tap the person button in the top header (`Switch`), then pick your name before logging tasks.

## 3. Error and Failure Recovery Guide

### `Household Link Needed`

The URL is missing `/h/[token]`, has a typo, or uses an old token after `Rotate Home Link`. Ask the owner for the current home link in Messenger, open it in Safari or Chrome, or tap `Try Link Again`.

### `Open Outside Messenger`

You opened the link inside Messenger's in-app browser, which blocks push alerts. Tap the Messenger menu and pick `Open in Chrome` or `Open in Safari`, or open the `Maki Care` Home Screen icon. Tap `Keep Logging Here` if you only need to log one task right now.

### `Could Not Save Update`

Your phone lost internet or could not reach the server. Check Wi-Fi or mobile data, then tap `Try Again` (safe to retry without creating duplicate litter or play entries) or tap `Refresh Status`.

### `Too early for the [time] meal.`

You tapped outside the 90-minute early feeding window. Wait until `8:30 AM` for the `10:00 AM` meal or `5:30 PM` for the `7:00 PM` meal, then tap `Mark Fed Early`.

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
- Android: Install the app from Chrome, allow notifications in Android settings, set Chrome Battery to `Unrestricted`, keep `10:00 AM` and `7:00 PM` Clock alarms active, and re-run `Allow Phone Alerts` and `Send Test Ping` in `/h/[token]/setup`.

### `Copy blocked by browser. Copy the text above directly.`

Your browser blocked automatic clipboard access for `Copy Messenger Nudge` or `Copy Personal Link`. Copy the text inside the box that appears on screen and paste it into Messenger.

### `Wrong PIN. Try again.`

You entered an incorrect 4-digit Owner PIN (or `OWNER_DEFAULT_PIN` is unset in production with no saved PIN hash). Re-enter the correct PIN, or verify `OWNER_DEFAULT_PIN` in Vercel settings if no custom PIN was saved yet.

### `Too many wrong PIN tries. Wait 15 minutes and try again.`

Five wrong PIN tries in a row triggered the 15-minute lockout (`HTTP 429`). Wait 15 minutes before retrying the PIN. Normal Care Board logging stays unlocked during this time.
