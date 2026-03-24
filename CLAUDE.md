# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Development server (defaults to :3000, increments if occupied)
npm run build        # Production build — must pass before committing
npm run lint         # ESLint check
npm run db:seed      # Seed historical data (Jun–Oct 2025) — idempotent via upsert
npm run db:migrate   # Apply pending migrations (uses DIRECT_URL)
npm run db:studio    # Open Prisma Studio at localhost:5555
npx tsc --noEmit     # Type-check without building
```

After any schema change: `npx prisma migrate dev --name <name>` then `npx prisma generate`.

There are no automated tests. Validate changes with `npx tsc --noEmit` and `npm run build`.

## Architecture Overview

Next.js 14 App Router app. All source code lives in `src/`.

### Route groups
- `src/app/(auth)/` — unauthenticated pages (`/login`)
- `src/app/(dashboard)/` — all protected pages, share a sidebar layout (`layout.tsx`)
- `src/app/api/` — Route Handlers only; no server components fetch data directly

### Auth & access control
Auth is **NextAuth v5 with JWT strategy** (`src/lib/auth.ts`). The JWT callback adds `role` to the token; the session callback exposes it as `session.user.role`.

Middleware (`src/middleware.ts`) enforces:
- Unauthenticated → `/login`
- OWNER role → `/report` only (all other routes redirect back to `/report`)
- MANAGER / ACCOUNTANT → full access

Every API route calls one of these helpers from `src/lib/auth-utils.ts`:
- `requireAuth()` — any logged-in user
- `requireManager()` — MANAGER or ACCOUNTANT only
- `getAccessiblePropertyIds()` — returns property IDs the current user may see (OWNER = their owned properties; MANAGER/ACCOUNTANT = `PropertyAccess` records)

### Data access pattern
All database access is through the Prisma singleton at `src/lib/prisma.ts`. API routes filter every query by `getAccessiblePropertyIds()` — never query without this guard.

`DATABASE_URL` uses Supabase transaction pooler (port 6543, pgBouncer). `DIRECT_URL` uses the direct connection (port 5432) and is required for `prisma migrate`.

### Key business logic (`src/lib/`)

| File | Purpose |
|---|---|
| `calculations.ts` | `calcUnitSummary`, `calcPettyCashBalance`, `calcPettyCashTotal`, `calcManagementFee`, `calcOccupancyRate`. Constants: `RIARA_MGMT_FEE` (flat per unit type), `ALBA_MGMT_FEE_RATE` (10%) |
| `date-utils.ts` | `getLeaseStatus` (OK/WARNING/CRITICAL/TBC), `daysUntilExpiry`, `getMonthRange` |
| `validations.ts` | Zod schemas for all form inputs — `incomeEntrySchema`, `expenseEntrySchema`, `pettyCashSchema`, `tenantSchema` |
| `pdf-generator.ts` | Server-only. Calls `@react-pdf/renderer`'s `renderToBuffer`. Used only in `POST /api/report` |
| `property-context.tsx` | Client context providing `useProperty()` — selected property ID persisted to `sessionStorage` |

### Income ↔ Invoice link
When a `LONGTERM_RENT` income entry is created via `POST /api/income`, the route auto-finds an open invoice for that tenant/month and marks it PAID in the same `prisma.$transaction`. Reverse: marking an invoice PAID via `PATCH /api/invoices/[id]` creates an income entry if none exists (`invoiceId` on `IncomeEntry` prevents duplicates).

### Financial rules
- **Gross income** always excludes `DEPOSIT` type entries
- **Net profit** = Gross − Agent Commissions − Operating Expenses (sunk costs excluded from P&L)
- **Petty cash balance** is always recomputed from all entries, never stored
- **Management fee**: Riara One = flat KSh (6,000 / 1-bed, 8,800 / 2-bed); Alba Gardens = 10% of gross revenue
- Expenses with `isSunkCost: true` appear in reports as "capital items" and are excluded from the P&L

### PDF generation
`@react-pdf/renderer` is server-only — declared in `serverComponentsExternalPackages` in `next.config.mjs`. The report route function has `maxDuration: 30` in `vercel.json` to handle slow PDF renders.

### PWA
`next-pwa` wraps the Next.js config. Service worker is disabled in development. `/api/dashboard` uses `StaleWhileRevalidate`; all other API routes use `NetworkFirst`.

## Property & Domain Model

Two properties are seeded:
- **Riara One** (`PropertyType.LONGTERM`) — 5 units, long-term tenants, flat management fee
- **Alba Gardens** (`PropertyType.AIRBNB`) — 3 units, short-let, 10% management fee

`IncomeEntry` has a `type` field (`LONGTERM_RENT`, `AIRBNB`, `DEPOSIT`, `SERVICE_CHARGE`, `UTILITY_RECOVERY`, `OTHER`) and optional `checkIn`/`checkOut` for Airbnb bookings.

`ExpenseEntry` has a `scope` (`UNIT`, `PROPERTY`, `PORTFOLIO`) — the `propertyId` / `unitId` fields are populated based on scope.

## UI Conventions

- **Currency**: always `formatKSh()` from `src/lib/currency.ts` — uses `Intl.NumberFormat('en-KE')` with "KSh" prefix
- **Colours**: `text-income` (green), `text-expense` (red), `text-gold` / `text-gold-dark` — defined in `tailwind.config.ts`
- **Fonts**: `font-display` (DM Serif Display), `font-mono` (DM Mono), `font-sans` (DM Sans)
- **Badge variants**: `"green" | "red" | "amber" | "gray" | "gold" | "blue"` — no `"purple"` or `"yellow"`
- **CurrencyDisplay sizes**: `"sm" | "md" | "lg" | "xl"` — no `"base"`
- Pages use `<Header>` + `<div className="page-container">` shell from the dashboard layout
- Month filtering uses `<MonthPicker>` component which has built-in prev/next arrows — do not add outer arrow buttons

### Document Storage

`TenantDocument` records are stored in the database; the actual files live in a Supabase Storage bucket called `tenant-documents`. The storage helper is `src/lib/supabase-storage.ts` — it lazy-initialises the Supabase client on first use so that builds succeed even when the env vars are absent.

API routes: `POST/GET /api/documents/[tenantId]` and `DELETE /api/documents/[tenantId]/[docId]`.

### Lease Renewal Workflow

`Tenant` model has `renewalStage` (`RenewalStage` enum: `NONE → NOTICE_SENT → TERMS_AGREED → RENEWED`), `proposedRent`, `proposedLeaseEnd`, and `renewalNotes`. When `PATCH /api/tenants/[id]/renewal` receives `renewalStage: "RENEWED"`, it copies `proposedRent` → `monthlyRent` and `proposedLeaseEnd` → `leaseEnd`.

### Email Draft Generator

`EmailDraftModal` is a pure client-side component with no API calls. It generates pre-filled templates (rent reminder, payment receipt, renewal offer, expiry notice) from tenant data, with copy-to-clipboard and `mailto:` deep link. Available from the tenant detail page header and the Renewal tab.

## Environment Variables

```
DATABASE_URL                  # Supabase transaction pooler (port 6543, &pgbouncer=true)
DIRECT_URL                    # Supabase direct connection (port 5432) — migrations only
NEXTAUTH_SECRET               # NextAuth secret
AUTH_SECRET                   # Same value as NEXTAUTH_SECRET
NEXTAUTH_URL                  # App URL (http://localhost:3000 for dev)
NEXT_PUBLIC_SUPABASE_URL      # Supabase project URL (for document storage)
SUPABASE_SERVICE_ROLE_KEY     # Supabase service role key (server-only, never exposed to browser)
```
