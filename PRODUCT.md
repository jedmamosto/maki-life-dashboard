---
$type: Product
productmd: 1
version: "0.1.0"
register: product
surface_mode: operate
---

# Maki Care

Daily cat care board for Maki in Manila (`Asia/Manila`). Household helpers, family, and a remote owner track meals, litter cleans, supplies, and play without passwords.

## Users

- **Daily helper (Ate)**: Logs meals, litter cleans, and supplies on a phone with one tap. Needs plain English, large touch targets, and zero login friction.
- **Family (Mom, Dad)**: Helps with daily care and optional weekly out-of-room play. Sets up phones before trips.
- **Remote owner (Jed)**: Checks Maki's status across timezones, reviews 14-day compliance, sends Messenger nudges, and manages PIN-locked household settings.

## Problem

When the owner travels across timezones, family chat threads bury whether Maki was fed or the litter box was cleaned. Missed meals cause worry and repeated check-in messages.

## Product Purpose

- **Mission**: Give every caregiver a calm, 1-tap daily board and give the remote owner instant peace of mind.
- **Core Value Proposition**: Manila-anchored meal goals, 48-hour litter tracking, supply levels, and automated check-in alerts inside an installable Home Screen PWA.
- **Success Criteria**: Caregivers log a meal in under 3 seconds; owner confirms today's status in one glance.

## Brand Personality

Warm, calm, domestic, and reassuring. Like a sunlit kitchen checklist—never clinical, never scolding.

### Tone

CEFR A2 plain English. Active voice, sentences under 20 words, Sentence case across headings and buttons. Zero blame or guilt wording. Zero unicode emojis.

## Anti-references

- MUST NOT use unicode emojis, raw icon fonts, or Title Case / ALL-CAPS shouting.
- MUST NOT use guilt or blame phrasing ("forgot", "neglect", "trapped").
- MUST NOT crowd a viewport with competing focal cards or heavy drop shadows.
- MUST NOT default to dark mode without sunlit-room contrast verification.

## Design Principles

1. **One Clear Next Action**: Highlight at most one focal care card per viewport.
2. **Sunlit Warmth Over Noise**: Keep 90%+ of the canvas in warm linen neutrals; reserve orange tabby accent for primary actions.
3. **Resilient 5-State Clarity**: Explicitly handle Empty, Loading, Error, Partial, and Ideal states with recovery actions.
4. **Zero-Friction Phone Ergonomics**: Maintain `>= 44px` secondary targets and `>= 56px` primary CTAs.

## Accessibility & Inclusion

- **Target Standard**: WCAG 2.1 Level AA across all routes (`4.5:1` body text contrast, `3:1` UI controls).
- **Accommodations**: Full keyboard focus rings (`--ring-focus`), native `<dialog>` focus containment, `rem` typography, and `prefers-reduced-motion` support.

## Boundaries

- Single-household secret-link app; not a multi-tenant pet-sitting marketplace.
- No passwords or user accounts; owner settings use a 4-digit PIN gate.

## Stack

- [AGENTS.md](AGENTS.md): Next.js runtime rules and verification conventions.
- [DESIGN.md](DESIGN.md): Sunlit Kitchen design tokens, typography, and component rules.
