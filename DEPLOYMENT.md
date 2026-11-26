# Production Deployment Runbook

Deploy Maki Life Dashboard to Vercel Hobby (`sin1` Singapore) with Neon Postgres, Resend email alerts, and Upstash QStash schedules.

## Step 1: Generate VAPID Keys

Run the VAPID generator script from the repository root:

```bash
node scripts/generate-vapid.mjs
```

Save the printed values for `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`. Pick a contact address for `VAPID_SUBJECT` (for example, `mailto:you@example.com`).

## Step 2: Provision Neon Serverless Postgres and Push Schema

1. Create a Neon Serverless Postgres project (choose Singapore `ap-southeast-1` near Vercel `sin1`).
2. Copy the connection string into `DATABASE_URL`.
3. Set `DATABASE_URL` in your shell and push the Drizzle schema (`src/db/schema.ts` via `drizzle.config.ts`):

   ```bash
   DATABASE_URL="postgresql://..." npx drizzle-kit push
   ```

When `DATABASE_URL` is present, `src/db/index.ts` selects `PostgresCareRepository` automatically.

## Step 3: Configure Resend Email Escalations

1. Create an API key in Resend and copy it for `RESEND_API_KEY`.
2. Set `RESEND_FROM_EMAIL` to your verified sender (for sandbox tests, use `Maki Care <onboarding@resend.dev>`).
3. Set `OWNER_ALERT_EMAIL` to the address that receives `T+120m` overdue meal alerts and owner alerts.

## Step 4: Deploy to Vercel Hobby (`sin1` Singapore)

Create a Vercel Hobby project linked to this repository and set Function Region to `sin1` (Singapore).

Generate high-entropy secrets for `HOUSEHOLD_TOKEN` and `SESSION_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

Configure all required production environment variables in Vercel:

| Variable | Requirement | Purpose |
| :--- | :--- | :--- |
| `HOUSEHOLD_TOKEN` | Required (24+ random bytes) | Secret token in `/h/<HOUSEHOLD_TOKEN>`. Do not use the dev token. |
| `SESSION_SECRET` | Required (high-entropy secret) | HMAC key for `maki_household` and `maki_owner_pin` cookies. |
| `OWNER_DEFAULT_PIN` | Required (4 digits) | Initial Owner PIN. Production fails closed (`401`) if unset and no DB hash exists. |
| `DATABASE_URL` | Required | Neon Postgres connection string from Step 2. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Required | Public Web Push key from Step 1. |
| `VAPID_PRIVATE_KEY` | Required | Private Web Push key from Step 1. |
| `VAPID_SUBJECT` | Required | Contact URI such as `mailto:you@example.com`. |
| `QSTASH_CURRENT_SIGNING_KEY` | Required | Current QStash signing key from Step 5. |
| `QSTASH_NEXT_SIGNING_KEY` | Required | Next QStash signing key from Step 5. |
| `RESEND_API_KEY` | Required for email | Resend API key from Step 3. |
| `RESEND_FROM_EMAIL` | Required for email | Verified sender email from Step 3. |
| `OWNER_ALERT_EMAIL` | Required for email | Default owner escalation email from Step 3. |
| `NEXT_PUBLIC_APP_URL` | Required | Canonical HTTPS URL (`https://<your-domain>`, no trailing slash). |
| `ENABLE_TEST_HARNESS` | Must be `false` | Keeps `/api/test/reset` disabled in production. |

Deploy the app, then open `https://<your-domain>/api/health` and confirm HTTP `200` with `"status":"healthy"`.

## Step 5: Configure Upstash QStash (`CRON_TZ=Asia/Manila`)

1. Open Upstash Console -> QStash -> Signing Keys.
2. Copy `QSTASH_CURRENT_SIGNING_KEY` and `QSTASH_NEXT_SIGNING_KEY` into Vercel env vars, then redeploy.
3. Create a QStash schedule that sends `POST` requests to `https://<your-domain>/api/cron/tick`:

| Cron Expression | Purpose |
| :--- | :--- |
| `CRON_TZ=Asia/Manila 0 * * * *` | Runs hourly to evaluate the configurable daily meal shortfall check-in (`mealReminderTime`) + `+60m` owner email, litter 48h/72h checks, and Wed/Sat play nudges, while recording `lastCronTickAt` for Owner View health diagnostics. |

Match the schedule URL host with `NEXT_PUBLIC_APP_URL` because `/api/cron/tick` verifies `upstash-signature` against `${NEXT_PUBLIC_APP_URL}/api/cron/tick`.

## Step 6: 2-Minute Pre-Departure Phone Setup Runbook

Open `https://<your-domain>/h/<HOUSEHOLD_TOKEN>/setup` on the owner device to copy each caregiver's personal `?who=` link.

### iPhone (Family - iOS 16.4+, ideally 18.4+)

1. Open your personal `?who=` link (`https://<your-domain>/h/<HOUSEHOLD_TOKEN>?who=<slug>`) in Safari, not inside Messenger.
2. Open the **Phone Setup** tab (`/setup`).
3. Tap **Share** at the bottom of Safari, then tap **Add to Home Screen**.
4. Open **Maki Care** from the new Home Screen icon. Confirm the badge says `Running from Home Screen icon.`.
5. Tap **Allow Phone Alerts** and grant notification permission.
6. Tap **Send Test Ping** and verify the alert appears in the notification shade.

### Android (Helper)

1. Open your personal `?who=` link (`https://<your-domain>/h/<HOUSEHOLD_TOKEN>?who=<slug>`) in Chrome, not inside Messenger.
2. Open the **Phone Setup** tab (`/setup`).
3. Tap the Chrome menu, then tap **Install app** (or **Add to Home Screen**).
4. Open **Maki Care** from the Home Screen icon, tap **Allow Phone Alerts**, and tap **Send Test Ping**.
5. Open Android Settings -> Apps -> Chrome -> Battery, and choose **Unrestricted** (disable battery optimization).
6. Add three native Android Clock alarms at `10:00 AM`, `2:00 PM`, and `7:00 PM` as offline backups.
