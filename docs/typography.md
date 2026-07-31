# Typography System

One face, eight sizes, three weights. The scale lives in `tailwind.config.ts` as `fontSize`
tuples — size, line height, letter-spacing and default weight are baked into each token, so
components never set `leading-*`, `tracking-*`, or a weight on a heading. Stock Tailwind sizes
(`text-sm`, `text-2xl`, `text-[13px]`, …) are **removed from the theme** and will not compile
into CSS — the token scale is the only way to size text.

## Faces

| Face | Class | Loaded via | Used for |
|---|---|---|---|
| **Inter** (variable) | `font-sans` (body default) | `next/font/google` in `src/app/layout.tsx` | Everything |
| **DM Serif Display** (400) | `font-display` | `next/font/google` | The "Groundwork PM" logo wordmark ONLY — never headings, never numbers |
| System mono stack | `font-mono` | none (no download) | API keys, tokens, IDs, reference codes, payload dumps. **Never money.** |

## The scale

| Token | px / line height | Spacing | Weight | Use for |
|---|---|---|---|---|
| `text-display` | 48 / 52 | −0.025em | 600 | Marketing hero H1 (desktop) only — `text-h1 md:text-display` |
| `text-h1` | 28 / 34 | −0.02em | 600 | Marketing section headings & page titles, auth headings, KPI/stat values |
| `text-h2` | 20 / 28 | −0.015em | 600 | In-app card & section headings (`.section-header`), large money |
| `text-h3` | 16 / 24 | −0.01em | 600 | Sub-headings, modal/drawer titles, the Header page title |
| `text-body-lg` | 16 / 24 | 0 | 400 | Marketing paragraphs & lead text |
| `text-body` | 14 / 20 | 0 | 400 | Default UI text — tables, forms, nav, buttons |
| `text-caption` | 12 / 16 | +0.01em | 400 | Secondary/meta text, timestamps, badges, helper text, dense cells |
| `text-label` | 11 / 14 | +0.05em | 500 | Uppercase micro-labels — table headers, eyebrows, section labels (pair with `uppercase`) |

## How to pick a token

1. **Is it a heading?** Page title → `h1` (or `h3` if it sits in the dark top bar). Card/section
   heading → `h2`. Sub-heading or modal title → `h3`. Never add a weight — 600 is baked in.
2. **Is it running text?** Dashboard UI → `body`. Marketing paragraph → `body-lg`.
   Emphasis inside body text = `font-medium` (500), not a bigger size.
3. **Is it small?** Meta/timestamps/badges/helper → `caption`. An UPPERCASE column header or
   eyebrow → `label uppercase` (spacing is baked in; no `tracking-*`).
4. **Is it a number someone will compare down a column?** Add `tabular-nums`, or use
   `<CurrencyDisplay>` which applies it (sizes: `sm`→body, `md`→body-lg, `lg`→h2, `xl`→h1).
   KPI/stat values are `text-h1 tabular-nums`.
5. **Is it a KPI tile value?** `text-h1 tabular-nums` (money via `CurrencyDisplay size="xl"`).

## Rules

- **Three weights: 400 / 500 / 600.** No `font-bold`, no `font-light`. Hierarchy comes from
  weight and colour, not size jumps.
- **No arbitrary values** — `text-[13px]` etc. won't compile. If no token fits, raise it; don't
  invent a size.
- **No `leading-*` / `tracking-*` in normal use.** Exceptions on record: `leading-none` on
  MobileNav labels, the Sidebar wordmark, and count badges (structural centring).
- **Serif = wordmark only.** `font-display` appears at the Sidebar/LandingNav/marketing-footer
  wordmarks and auth logo lockups (`font-display font-normal` — the face only ships 400).
- **Mono = references only.** Keys, tokens, audit IDs, case refs, account numbers. Money is Inter
  + `tabular-nums`, always.
- **Charts** (Recharts) can't use Tailwind classes — use `CHART_FONT` from
  [src/lib/chart-style.ts](../src/lib/chart-style.ts); that file is the one sanctioned home for
  inline font sizes.
- **Out of scope**: PDF generators (`@react-pdf/renderer` registers its own faces — still DM
  family; migrate in a later pass) and email templates (inline styles + web-safe stacks).

## Specimen

`/dev/typography` renders every token with its metrics plus a sample money table
(dev builds only — 404s in production).
