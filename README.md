# Maki Life Dashboard

Maki Life Dashboard tracks daily cat care in Manila (`Asia/Manila`). Caregivers log meals, litter cleans, supplies, and play without passwords or user accounts.

## Overview

- Care Board (`/h/[token]`): Tracks 10:00 AM and 7:00 PM meals, 48-hour litter cleans, food and litter supplies, and the weekly 3-session play goal.
- Remote Owner View (`/h/[token]/owner`): Shows Manila house time, local browser time, 4 meal escalation stages (`T+0m`, `T+20m`, `T+45m`, `T+120m`), today's timeline, a 14-day history grid, push health, and PIN-locked settings.
- Declarative PWA Web Push (`/h/[token]/setup`): Sends RFC 8030 declarative payloads and standard service worker alerts to installed Home Screen apps on iOS and Android.
- 1-Tap Messenger Copy Bridge: Copies a pre-filled Messenger check-in message with the household dashboard link.

## Local Quickstart

The app runs locally with zero database setup. When `DATABASE_URL` is unset, the server stores state in `.data/maki-care.json`.

1. Install packages:

   ```bash
   npm install
   ```

2. Optional: Copy `.env.example` to `.env.local` to customize tokens, push keys, or Postgres:

   ```bash
   cp .env.example .env.local
   ```

3. Start the development server:

   ```bash
   npm run dev
   ```

4. Open the default local URLs:
   - Care Board: `http://localhost:3000/h/maki-dev-household-token-change-in-prod`
   - Owner View: `http://localhost:3000/h/maki-dev-household-token-change-in-prod/owner`
   - Phone Setup: `http://localhost:3000/h/maki-dev-household-token-change-in-prod/setup`

Default development Owner PIN: `1234` (active only outside production when no PIN hash is saved).

## Verification Commands

Run these checks after modifying code:

```bash
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
```

- `npm run typecheck`: Checks TypeScript types (`tsc --noEmit`).
- `npm run lint`: Runs ESLint (`eslint`).
- `npm test`: Runs Vitest unit and API tests (`vitest run`).
- `npm run test:e2e`: Runs Playwright browser tests (`playwright test`) against port `3100` using `.data/e2e-care.json`.
- `npm run build`: Builds the production Next.js app (`next build`).

## Guides

- User Manual: Read [MANUAL.md](./MANUAL.md) for daily caregiver how-tos, common scenarios, and error recovery.
- Production Setup: Read [DEPLOYMENT.md](./DEPLOYMENT.md) for production provisioning, QStash cron schedules, and the 2-minute pre-departure phone checklist.
