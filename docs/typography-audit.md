# Typography Audit — GroundWorkPM

_Audit date: 2026-07-31. Scope: everything under `src/` (461 `.ts`/`.tsx` files). Counts are from
ripgrep with word-boundary patterns that exclude colour classes (`text-gray-500` etc.) and CSS-var
false positives (`var(--font-sans)`). Unprefixed and responsive-prefixed counts are disjoint._

This document is the Phase-1 deliverable: the full inventory of current typography usage, how fonts
load today, the proposed token scale, and the complete old→new mapping.

---

## 1. How fonts are loaded today

- **`next/font/google`** only — no `<link>`, no `@font-face`, no `next/font/local`. One site:
  [src/app/layout.tsx:2](../src/app/layout.tsx).
  - `DM_Serif_Display` — **weight 400 only** (the face has no other weight) → `--font-display`
  - `DM_Mono` — weights **400/500 only** → `--font-mono`
  - `DM_Sans` — variable → `--font-sans`
  - All with `display: "swap"`, variables attached to `<html>`.
- `globals.css` applies `font-sans` on `body` (`@apply bg-cream text-header font-sans`).
- `tailwind.config.ts` maps `font-display` / `font-mono` / `font-sans` to the CSS vars. **There is
  no `fontSize`, `fontWeight`, `lineHeight`, or `letterSpacing` customisation anywhere** — every
  size in the app is a stock Tailwind class applied ad hoc.
- Two component classes exist in `globals.css`: `.section-header` (`font-display text-xl
  text-header`, **18 real uses** — live) and `.ksh-value` (`font-mono`, **0 uses** — dead).
- **Faux-bold bug**: `font-bold`/`font-semibold` are applied to DM Serif (400-only) and DM Mono
  (max 500) in e.g. `calendar/page.tsx:143`, `income/page.tsx:959,1340,1344`,
  `OwnerDashboard.tsx` totals, `TaxSummary.tsx:218`, and throughout the calculator — the browser
  synthesises those weights.

## 2. Inventory — sizes

### Named sizes, unprefixed (total 3,026)

| Class | Count | Example files |
|---|---:|---|
| `text-xs` | 1,499 | `(dashboard)/income/page.tsx` (113), `(dashboard)/tenants/[id]/page.tsx` (73), `(dashboard)/maintenance/page.tsx` (63) |
| `text-sm` | 1,209 | `(dashboard)/invoices/page.tsx` (63), `(portal)/portal/[token]/page.tsx` (54), `(dashboard)/report/page.tsx` (50) |
| `text-base` | 76 | portal page, `(marketing)/pricing`, `(dashboard)/report` |
| `text-lg` | 75 | `(marketing)/contact`, `calculator/AirbnbVsLtrCalculator.tsx`, `(dashboard)/invoices` |
| `text-2xl` | 72 | calculator, `(dashboard)/invoices` (stat tiles), `(approve)/approve/[token]` |
| `text-xl` | 61 | `(marketing)/terms` (15), `(marketing)/privacy` (11), `(marketing)/refund` (8) |
| `text-3xl` | 22 | calculator, `(marketing)/pricing`, `landing/WeeklyRhythm.tsx` |
| `text-4xl` | 9 | `landing/MarketingHero.tsx`, `landing/HomeHero.tsx`, `(marketing)/terms` |
| `text-5xl` | 2 | calculator, portal (emoji) |
| `text-6xl` | 1 | calculator breakeven headline |

`text-xs` + `text-sm` = **89.4%** of all named size usage. The app is a two-size UI with 31 stray sizes.

### Responsive-prefixed (total 56, marketing-dominated)

`md:text-4xl` 11 · `sm:text-3xl` 10 · `md:text-5xl` 6 · `md:text-xl` 4 · `md:text-lg` 4 ·
`sm:text-lg` 3 · `sm:text-2xl` 3 · `md:text-sm` 2 · `md:text-6xl` 2 · one each of `sm:text-base`,
`sm:text-7xl`, `sm:text-6xl`, `sm:text-5xl`, `sm:text-4xl`, `md:text-base`, `md:text-3xl`,
`lg:text-7xl` · `prose-h2:text-2xl`, `prose-h3:text-lg` (BlogPost) · `file:text-sm` (file input).
No `dark:`/`hover:` size variants exist.

### Arbitrary values (157 uses, 3 undeclared micro-sizes)

| Value | Count | Where (representative) |
|---|---:|---|
| `text-[10px]` | 96 | `dashboard/RentStatusTable.tsx` + `AlbaRevenueTable.tsx` (table micro-headers), `landing/DashboardPreview.tsx` (10), `layout/GlobalSearch.tsx`, `(dashboard)/income`, `(dashboard)/tenants`, `(marketing)/examples` |
| `text-[11px]` | 52 | `(dashboard)/calendar/page.tsx` (13), calculator (12), `settings/payment-accounts`, `ui/HistoryDrawer.tsx`, `ui/HelpTip.tsx` |
| `text-[9px]` | 9 | `ui/HelpTip.tsx`, `layout/Sidebar.tsx:297` (kbd hint), `(dashboard)/calendar`, `(dashboard)/arrears`, `(dashboard)/expenses`, `landing/ShiftSection.tsx` |

Also 5 arbitrary **colour** values `text-[#1a2332]` (`onboarding/page.tsx:486`,
`(auth)/select-org/page.tsx:56,63,97`, `(dashboard)/properties/page.tsx:145`) — should be
`text-header`; colour is out of scope for this migration but noted.

Arbitrary line heights: `leading-[1.05]` (`MarketingHero.tsx:11`), `leading-[1.07]`
(`HomeHero.tsx:11`). No `tracking-[…]` or `font-[…]` anywhere.

## 3. Inventory — weights (total 1,159)

| Class | Count | Example files |
|---|---:|---|
| `font-medium` | 836 | report, invoices, income pages |
| `font-semibold` | 271 | calculator, portal, forecast |
| `font-bold` | 36 | calculator, portal, report — several on DM Serif/DM Mono (faux-bold) |
| `font-normal` | 15 | ContactForm, expenses, HelpTip |
| `file:font-medium` | 1 | file input |

`font-thin/extralight/light/extrabold/black`: zero uses.

## 4. Inventory — families

| Class | True uses | Notes |
|---|---:|---|
| `font-sans` | 2,051 | Redundant everywhere — `body` already sets it |
| `font-display` | 268 (85 files) | See below |
| `font-mono` | 278 (57 files) | See below |
| `font-serif` | 0 | |

### Where DM Serif Display (`font-display`) is actually used

Emphatically **not** just the logo — it is the default heading face *and* a KPI-number face:

- **Wordmarks (the only intended survivors)**: `layout/Sidebar.tsx:241`, `landing/LandingNav.tsx`,
  `(marketing)/layout.tsx` footer, auth-page logo lockups (`login`, `signup`, `forgot-password`,
  `reset-password`).
- **App chrome**: `layout/Header.tsx:69` page title (`text-lg`), `ui/Modal.tsx` /
  `ui/HistoryDrawer.tsx` / `ui/EmptyState.tsx` titles, `.section-header` in `globals.css`.
- **Dashboard headings** (~35 pages): report, settings, compliance, properties, tenants, expenses,
  petty-cash, cases, automations, admin — clustered at `text-base`/`text-lg` (flat hierarchy).
- **KPI/stat values** (serif numerals): invoices (7 stat tiles `text-2xl`), arrears, airbnb,
  insurance, assets, maintenance, inbox (`text-3xl`), billing/upgrade prices
  (`text-3xl`/`text-4xl`), incl. **currency figures** at `insurance:480`, `assets:958`,
  `maintenance:1115`, `OwnerInvoicesTab:949,953`.
- **Marketing**: every landing/legal/pricing heading, `text-lg` → `lg:text-7xl` range.
- Blog: `prose-headings:font-display`.

### Where DM Mono (`font-mono`) is actually used — three distinct roles

1. **Money/numeric (the majority)** — `report/page.tsx` (60), `OwnerDashboard.tsx` (17),
   `tenants/[id]` (14), income (12), OwnerInvoicesTab (12), properties (11), invoices (9),
   forecast (8), plus every money table. `CurrencyDisplay` hard-codes `font-mono tabular-nums`, but
   is bypassed in most tables which hand-write `font-mono text-sm`. Only 11 of 278 mono uses add
   `tabular-nums` (the rest rely on DM Mono being fixed-width).
2. **Marketing "eyebrow" labels** — `text-[10px]/xs font-mono uppercase tracking-widest` in
   `SpreadsheetComparison`, `ShiftSection`, `WeeklyRhythm`, `InboxMock`, `AutomationCards`,
   `DashboardPreview`, `(marketing)/examples`.
3. **Genuine monospace content (~20 files — the legitimate survivors)**: `settings/api` (API keys),
   `settings/audit` (IDs/diffs), `settings/calendar` (ICS token URL), `settings/payment-accounts`
   (account numbers), `admin/hints` (hint keys), `import/page.tsx` (row refs),
   `ProofVerifyDrawer` (payload dump), `OwnerEmailDraftModal` (`<pre>`), `ConfirmDialog`
   (type-to-confirm), case reference codes (`cases/shared.tsx`, Kanban/Grouped/Calendar views),
   `ui/Input.tsx` currency prefix, `ui/SeedProgress.tsx` counter.
   Plus Recharts Y-axis ticks via `fontFamily: "var(--font-mono)"` in `RevenueChart.tsx` /
   `ForecastChart.tsx`.

**Inconsistency worth naming**: the same currency value renders in DM Mono in a table and DM Serif
in the KPI tile above it.

## 5. Inventory — line height & tracking

| Class | Count | Typical context |
|---|---:|---|
| `leading-relaxed` | 61 | marketing paragraphs, calculator copy |
| `leading-tight` | 27 | headings, property cards, MobileNav drawer labels |
| `leading-none` | 17 | MobileNav labels, Sidebar wordmark, count badges |
| `leading-snug` | 16 | landing mock components |
| `tracking-wide` | 332 | **`text-xs` uppercase labels — the unnamed "label" style** (invoices 23, tenants/[id] 21, report 21) |
| `tracking-widest` | 18 | marketing eyebrows, MobileNav drawer headers |
| `tracking-wider` | 5 | GlobalSearch, pricing, examples |
| `tracking-normal` | 4 | ContactForm, HelpTip |
| `tracking-tight` | 2 | both hero H1s |

## 6. Inline-style typography

291 hits total; **280 (96%) are in the out-of-scope PDF generators**. The 11 non-PDF:

- `RevenueChart.tsx` / `ForecastChart.tsx` — Recharts tick/tooltip/legend styles (10/11/12px,
  Y-axis in `var(--font-mono)`). SVG requires inline styles; both charts duplicate the same values.
- `global-error.tsx` — `system-ui` fallback, intentionally outside the font provider. Correct as-is.

## 7. `tabular-nums`

11 uses in 2 files (`ui/CurrencyDisplay.tsx:49` + 10 in the calculator). Every other money column
depends on DM Mono's fixed width instead of an explicit numeral policy.

---

## 8. Decisions

### 8.1 Primary face: Inter (case for not switching to an alternative)

Inter is the right default here and no alternative earns an override: this UI lives at 11–14px
(89% of usage), where Inter's hinting and x-height are best-in-class; it ships first-class
`tabular-nums` OpenType support (needed for every money column once DM Mono goes); and it is the
native face of the target register — Linear and Vercel's dashboard both shipped on it. Geist is the
closest contender but differentiates mostly at display sizes this app barely uses; IBM Plex and
Public Sans both read warmer/wider and drift from the Linear/Stripe reference. Loaded via
`next/font/google` (variable, `display: "swap"`, automatic metric-compatible fallback → no layout
shift).

### 8.2 DM Serif Display → wordmark only

Retained at weight 400 as `--font-display`, used **only** for the "Groundwork PM" wordmark
(Sidebar, LandingNav, marketing footer, auth logo lockups). All 260+ other uses stripped.

### 8.3 DM Mono → dropped from `next/font`; recommendation: don't keep the download

Money should not be mono (per brief) — it moves to Inter + `tabular-nums`. What remains for mono is
API keys, tokens, IDs, reference codes and payload dumps (~20 files). That content does not justify
shipping a webfont: `font-mono` is remapped to the system stack
`ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace`. One font download
removed, zero visual risk for reference codes.

### 8.4 Tabular numerals as a system rule

`tabular-nums` (Tailwind core utility) is baked into `CurrencyDisplay` and required on every
numeric column / KPI value. Documented in `docs/typography.md`; not a per-table one-off.

### 8.5 Weights: 400 / 500 / 600

Inter variable covers all three in one file. `font-bold` (36) → `font-semibold`. No exception
needed for the logo (DM Serif is 400). This also fixes the existing faux-bold rendering.

## 9. The scale — 8 tokens (`tailwind.config.ts` `fontSize` tuples, full replacement)

`theme.fontSize` is **replaced**, not extended — after migration `text-sm`/`text-2xl`/arbitrary
values are not generated at all, so the old scale cannot creep back.

| Token | px | Line height | Letter-spacing | Weight | Use for |
|---|---|---|---|---|---|
| `text-display` | 48 | 52px (1.08) | −0.025em | 600 | Marketing hero H1 (desktop) only |
| `text-h1` | 28 | 34px | −0.02em | 600 | Marketing section headings/page titles, auth headings, KPI/stat values (+`tabular-nums`), hero on mobile |
| `text-h2` | 20 | 28px | −0.015em | 600 | In-app card/section headings, large money (`CurrencyDisplay lg`) |
| `text-h3` | 16 | 24px | −0.01em | 600 | Sub-headings, modal/drawer titles, Header page title |
| `text-body-lg` | 16 | 24px | 0 | 400 | Marketing paragraphs/lead text, `CurrencyDisplay md` |
| `text-body` | 14 | 20px | 0 | 400 | Default UI text, tables, forms, nav |
| `text-caption` | 12 | 16px | +0.01em | 400 | Meta text, timestamps, badges, helper text, dense cells |
| `text-label` | 11 | 14px | +0.05em | 500 | Uppercase micro-labels: table headers, eyebrows (pair with `uppercase`) |

Design intent: `caption` keeps today's dominant 12px density unchanged (MobileNav, badges, tables);
`label` names the 332-use `text-xs tracking-wide uppercase` pattern and absorbs all 157 arbitrary
9–11px values; heading hierarchy comes from baked weight 600 + colour, with a compressed size ramp
(hero 60→48, marketing sections 30/36→28, KPI tiles 24→28 in Inter 600).

## 10. Old → new mapping (complete)

Responsive prefixes map mechanically (`md:text-4xl` follows the `text-4xl` rule as `md:<new>`);
pairs that land on the same token collapse to one class.

| Old | New | Rule where context-dependent |
|---|---|---|
| `text-xs` | `text-label` / `text-caption` | `label` when the element also has `uppercase` and/or `tracking-wide/wider/widest`; `caption` otherwise. Deterministic from existing classes. |
| `text-sm` | `text-body` | uniform |
| `text-base` | `text-h3` / `text-body-lg` | heading (has `font-display`/`font-semibold`) → `h3`; running text → `body-lg` |
| `text-lg` | `text-h3` / `text-h2` / `text-body-lg` | modal/card/Header titles → `h3`; money (`CurrencyDisplay lg`, property-card rent) → `h2`; marketing lead paragraphs → `body-lg` |
| `text-xl` | `text-h2` | uniform (incl. `.section-header`) |
| `text-2xl` | `text-h1` (default) / `text-h2` | KPI values, auth/page titles → `h1`; minor card headings that read oversized → `h2` |
| `text-3xl` | `text-h1` | uniform |
| `text-4xl` | `text-h1`; hero base becomes `text-h1 md:text-display` | |
| `text-5xl` / `text-6xl` | `text-display` (calculator); portal emoji → `text-h1` | |
| `sm:/md:/lg:text-{3xl..7xl}` | `md:text-display` (hero) or dropped (sections become single-size `text-h1`) | |
| `text-[9px]` | `text-label` | |
| `text-[10px]` | `text-label` (uppercase/tracking/table-header context) / `text-caption` | |
| `text-[11px]` | `text-caption` | |
| `file:text-sm` | `file:text-body` | |
| `prose-h2:text-2xl`, `prose-h3:text-lg` | `prose-h2:text-h2`, `prose-h3:text-h3` | |
| `font-bold` | `font-semibold` (drop entirely on heading tokens) | |
| `font-normal` | drop | |
| `font-medium` / `font-semibold` | keep; drop `font-semibold` where a heading token bakes 600 | |
| `font-display` | delete except wordmark set (§8.2) | |
| `font-mono` | delete (money → token + `tabular-nums`); `text-label` (marketing eyebrows); keep for code/token allow-list (§4.3) | |
| `font-sans` | delete (body default) | |
| `prose-headings:font-display` | delete | |
| `leading-relaxed/tight/snug` | drop (baked in tokens) | |
| `leading-none` | keep only structural: MobileNav labels, Sidebar wordmark, count badges | |
| `leading-[1.05]`/`[1.07]` | drop (`display` bakes 1.08) | |
| `tracking-wide/wider/widest` | drop — element becomes `text-label` | |
| `tracking-tight/normal` | drop | |
| Recharts inline ticks | keep inline (SVG), families → `var(--font-sans)`, values hoisted to a shared constant | |
| `.section-header` | redefine as `@apply text-h2 text-header` (18 call sites keep working) | |
| `.ksh-value` | delete (0 uses) | |

### Fixed-API components (props unchanged, internals remapped)

- **CurrencyDisplay**: `font-mono tabular-nums` → `tabular-nums font-medium`; sizes `sm→text-body`,
  `md→text-body-lg`, `lg→text-h2`, `xl→text-h1`.
- **Badge**: `text-xs font-medium font-sans` → `text-caption font-medium` (12px unchanged).
- **MobileNav**: `text-xs` → `text-caption`, `truncate w-full` + `leading-none` kept → 360px
  truncation preserved; drawer headers → `text-label uppercase`.

## 11. Out of scope

- All 7 PDF generators + `src/components/report/pdf/PdfStyles.ts` (280 inline typography rules) —
  `@react-pdf/renderer` registers its own fonts. **Flag**: they still render DM-family faces and
  should follow in a later pass so PDFs match the app.
- `src/lib/notifications/email-templates.ts` — email clients need inline styles/web-safe stacks.
- `.claude/worktrees/**` — stale checkouts; excluded from every codemod.
- Arbitrary colour values (`text-[#1a2332]` ×5) — colour cleanup, not typography.

## 12. Open questions / judgment calls made

1. **Marketing restraint** (biggest visual change): hero 60/72→48, sections 30/36→28, serif→Inter.
   Judged from the before/after shots; fallback is bumping only `display`.
2. **KPI values → 28px Inter 600** (up from serif 24px); `h2` at 20px was considered and rejected
   as too quiet.
3. **Landing mock-UI components** (`DashboardPreview`, `ShiftSection`, `InboxMock`,
   `SpreadsheetComparison`, `WeeklyRhythm`) deliberately fake a shrunken app at 9–10px; mapping to
   `label`/`caption` enlarges them slightly. Accepted to honour no-arbitrary-values.
4. **`text-base`/`text-lg` heading-vs-body split** is per-site judgment; sites where the call was
   genuinely 50/50 are listed in `docs/typography-comparison.md` alongside the screenshots.
