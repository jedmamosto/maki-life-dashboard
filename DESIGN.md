---
version: "alpha"
system_version: "1.0.0"
name: "Maki Care Sunlit Kitchen"
description: "Warm linen, single-accent design tokens for Maki Life Dashboard"
colors:
  primary: "#B3480F"
  primary-strong: "#8F390A"
  coat: "#E87A2E"
  neutral-bg: "#FAF4EA"
  neutral-surface: "#FFFDF9"
  neutral-subtle: "#F3EAD9"
  neutral-border: "#E3D6C7"
  neutral-control: "#8A7365"
  neutral-text: "#241914"
  neutral-secondary: "#57443A"
  neutral-muted: "#6E584C"
  status-safe: "#1F6E4A"
  status-due: "#A84A08"
  status-overdue: "#B83227"
  nose-accent: "#A83344"
typography:
  h1:
    fontFamily: "var(--font-nunito), ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  h2:
    fontFamily: "var(--font-nunito), ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "var(--font-dm-sans), ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  sm: "8px"
  btn: "12px"
  card: "16px"
  sheet: "24px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "20px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.btn}"
    padding: "12px 16px"
  button-secondary:
    backgroundColor: "{colors.neutral-subtle}"
    textColor: "{colors.neutral-text}"
    rounded: "{rounded.btn}"
    padding: "12px 16px"
  card-surface:
    backgroundColor: "{colors.neutral-surface}"
    textColor: "{colors.neutral-text}"
    rounded: "{rounded.card}"
    padding: "16px"
---

# Maki Care Design System

## Overview

Sunlit Kitchen warm linen palette engineered for fast daily scanning (`operate` mode) on mobile phones and remote desktop browsers.

## Colors

Enforces the 90/10 neutral-to-accent rule:
- **Canvas & Surfaces**: Warm linen canvas (`--bg-canvas: #FAF4EA`), sunlit cards (`--bg-card: #FFFDF9`), quiet inset tracks (`--bg-subtle: #F3EAD9`), and 1px espresso hairlines (`--border-hairline: #E3D6C7`).
- **Ink Hierarchy**: Deep espresso (`--ink-primary: #241914`), warm umber (`--ink-secondary: #57443A`), muted clay (`--ink-tertiary: #6E584C`). All pairs exceed WCAG 2.1 AA (`>= 4.5:1`).
- **Single Primary Accent**: Maki tabby orange (`--brand-primary: #B3480F`, hover `#8F390A`) for primary CTAs and active navigation focus (`--ring-focus`).
- **Semantic Status**: Sage (`--sage-*`) for done/safe, Amber (`--amber-*`) for due/low, Coral (`--coral-*`) for overdue/empty/destructive. Soft pink nose (`--pink-*`) is restricted to small bonus-play badges and icons—never full-card fills.

## Typography

- **Families (max 2)**: `Nunito` (`--font-display`) for warm, rounded, non-classical headings, buttons, and numerals; `DM Sans` (`--font-sans`) for crisp scannable body copy and metadata.
- **Scale & Units**: All font sizes use `rem` units to honor OS/browser zoom. Display headings `>= 24px` use `tracking-[-0.02em]`. Metrics and clocks use `tabular-nums`.
- **Wrapping & Casing**: Sentence case everywhere (except proper nouns and `PIN`). No ALL-CAPS eyebrows. Headings and `<th>` use `text-wrap: balance`; paragraphs use `text-wrap: pretty` and `max-w-prose` where wide.

## Elevation & Shapes

- **Hairline Depth**: Prefer 1px hairline borders (`--border-hairline`) and subtle tonal fills over heavy shadows. Reserve `--shadow-hero` for the single active focal card.
- **Varied Radii Hierarchy**: Sheets/modals `24px` (`--radius-sheet`) -> Cards `16px` (`--radius-card`) -> Buttons/inputs `12px` (`--radius-btn`) -> Compact cells/tags `8px` (`--radius-sm`) -> Badges/avatars `9999px` (`--radius-pill`).
- **Asymmetric Motion**: Enter `180ms` (`--duration-enter`), exit `100ms` (`--duration-exit`), `--ease-kitchen`, respecting `prefers-reduced-motion`.

## Do's and Don'ts

- **DO**: Keep one focal centerpiece per viewport, flatten nested cards with hairline dividers, use native `<dialog>` for modals/sheets, and use inline SVG icons (`lucide-react` / `MakiCatIcon`).
- **DON'T**: Mix multiple focus-ring colors, flood secondary cards with saturated fills, use `px` font sizes, or hardcode cool slate grays on warm espresso surfaces.
