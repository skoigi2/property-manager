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

Roles: `ADMIN` (superuser), `MANAGER`, `ACCOUNTANT`, `OWNER`.

**Super-admin vs org-admin**: Both have `role = "ADMIN"` but differ by `organizationId`:
- Super-admin: `organizationId = null` — platform-level, sees all orgs and all data
- Org-admin: `organizationId = <id>` — scoped to one organisation

Use `requireSuperAdmin()` from `src/lib/auth-utils.ts` for super-admin-only routes. Never use `role === "ADMIN"` alone as a super-admin check — org-admins share that role.

Middleware (`src/middleware.ts`) enforces:
- Unauthenticated → `/login`
- OWNER role → `/report` only; accessing any manager-only route redirects back to `/report`
- ADMIN / MANAGER / ACCOUNTANT → full access

Manager-only routes (OWNER is blocked): `/income`, `/expenses`, `/petty-cash`, `/tenants`, `/settings`, `/arrears`, `/recurring-expenses`, `/import`, `/insurance`, `/assets`, `/maintenance`.

Every API route calls one of these helpers from `src/lib/auth-utils.ts`:
- `requireAuth()` — any logged-in user
- `requireManager()` — ADMIN, MANAGER, or ACCOUNTANT (blocks OWNER)
- `requireAdmin()` — ADMIN only (org-admin or super-admin)
- `requireSuperAdmin()` — ADMIN role **and** `organizationId === null` (platform super-admin only)
- `requirePropertyAccess(propertyId)` — verifies current user may access a specific property
- `getAccessiblePropertyIds()` — returns property IDs the current user may see (ADMIN = all; OWNER = their owned properties; MANAGER/ACCOUNTANT = `PropertyAccess` records)

### Multi-tenancy & Organisations

Users belong to organisations via the `UserOrganizationMembership` join table (unique on `[userId, organizationId]`). `User.organizationId` is the **currently active org** stored in the JWT — it is not the authoritative membership list; `UserOrganizationMembership` is the source of truth.

**JWT extras** (populated in `src/lib/auth.ts` `authorize()`):
- `session.user.organizationId` — active org ID (null for super-admin)
- `session.user.membershipCount` — count of org memberships (gates the org-switcher UI)

**Org-switching flow** (users who belong to multiple orgs):
1. Middleware redirects to `/select-org` after login when `membershipCount > 1` and no active org is set
2. `GET /api/auth/orgs` — returns the user's org memberships
3. `POST /api/auth/switch-org` — validates membership, updates `User.organizationId` in DB; client calls `session.update({ organizationId })` to refresh the JWT without a full re-login
4. Sidebar org-switcher (`src/components/layout/Sidebar.tsx`) exposes this inline for already-logged-in users

**Membership API routes**:
- `DELETE /api/organizations/[id]/members/[userId]` — removes user from org; if their active org was this one, switches them to another membership or nulls it
- `POST /api/organizations` — optionally creates a first ADMIN user and upserts their membership
- `POST /api/users` — always upserts a `UserOrganizationMembership` for the assigned org

**Property → org reassignment cascade** (`PATCH /api/properties/[id]` with `organizationId`, super-admin only):
- All `PropertyAccess` users gain membership in the target org
- Users whose only source-org property was this one lose their source-org membership and have their active org updated
- Must use array-form `prisma.$transaction([...])` — callback-form is incompatible with pgBouncer

**User list scoping**: `GET /api/users` explicitly excludes super-admin accounts (`role=ADMIN, organizationId=null`) from results returned to org-admins and managers.

### Data access pattern
All database access is through the Prisma singleton at `src/lib/prisma.ts`. API routes filter every query by `getAccessiblePropertyIds()` — never query without this guard.

`DATABASE_URL` uses Supabase transaction pooler (port 6543, pgBouncer). `DIRECT_URL` uses the direct connection (port 5432) and is required for `prisma migrate`.

### Key business logic (`src/lib/`)

| File | Purpose |
|---|---|
| `calculations.ts` | `calcUnitSummary`, `calcPettyCashBalance`, `calcPettyCashTotal`, `calcManagementFee`, `calcOccupancyRate`. Constants: `RIARA_MGMT_FEE` (flat per unit type), `ALBA_MGMT_FEE_RATE` (10%) |
| `date-utils.ts` | `getLeaseStatus` (OK/WARNING/CRITICAL/TBC), `daysUntilExpiry`, `getMonthRange` |
| `validations.ts` | Zod schemas for all form inputs — `incomeEntrySchema`, `expenseEntrySchema`, `pettyCashSchema`, `tenantSchema` |
| `pdf-generator.ts` | Server-only. Property report PDF via `@react-pdf/renderer`. Used only in `POST /api/report` |
| `invoice-pdf.tsx` | Server-only. Tenant rent invoice PDF |
| `owner-invoice-pdf.tsx` | Server-only. Owner fee invoice PDF (letting, mgmt, renewal fees, etc.) |
| `excel-export.ts` | SheetJS multi-sheet Excel export for income/expenses |
| `import-templates.ts` | XLSX download template generators for bulk import |
| `audit.ts` | `logAudit(action, resource, resourceId, before?, after?)` — logs CREATE/UPDATE/DELETE with JSON snapshots |
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
`@react-pdf/renderer` is server-only — declared in `serverComponentsExternalPackages` in `next.config.mjs`. The report route function has `maxDuration: 30` in `vercel.json` to handle slow PDF renders. Three separate generators exist: `pdf-generator.ts` (property reports), `invoice-pdf.tsx` (tenant rent invoices), `owner-invoice-pdf.tsx` (owner fee invoices).

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

### Owner Invoice System

Owner invoices bill the landlord for management services. Types: `LETTING_FEE`, `PERIODIC_LETTING_FEE`, `RENEWAL_FEE`, `MANAGEMENT_FEE`, `VACANCY_FEE`, `SETUP_FEE_INSTALMENT`, `CONSULTANCY_FEE`.

Auto-generation endpoints (all `POST`, return 409 if invoice already exists for the period):
- `/api/owner-invoices/generate-mgmt-fee` — creates invoice with per-unit line items
- `/api/owner-invoices/generate-letting-fee` — new tenancy letting fee
- `/api/owner-invoices/generate-renewal-fee` — lease renewal fee
- `/api/owner-invoices/generate-vacancy-fee` — vacancy penalty invoice
- `/api/owner-invoices/bundle-airbnb` — bundles multiple Airbnb income entries into one invoice

PDF: `GET /api/owner-invoices/[id]/pdf` (uses `owner-invoice-pdf.tsx`).

### Import / Export (Handover)

- `GET /api/properties/[id]/export` — exports full property data as a ZIP containing an XLSX workbook (sheets: summary, units, tenants, income, expenses, petty-cash, owner-invoices, documents)
- `POST /api/import/handover` — imports a property from a handover ZIP; validates and upserts all sheets, creates an audit log entry on completion

### Management Agreement & KPIs

Each property has a `ManagementAgreement` record (`GET/PUT /api/properties/[id]/agreement`) storing:
- KPI targets: occupancy rate, rent collection rate, expense ratio, tenant turnover, days to lease, renewal rate, maintenance completion
- SLA response hours (emergency vs. standard)
- Operational config: repair authority limit, vacancy fee threshold (months), rent remittance day, management fee invoice day, landlord payment days
- Setup fee instalment tracking

### Additional Models

**InsurancePolicy** — per-property insurance records (types: `BUILDING`, `PUBLIC_LIABILITY`, `CONTENTS`, `OTHER`) with premium frequency, coverage amounts, broker details, and document uploads. API: `GET/POST /api/insurance`, `GET/POST/DELETE /api/insurance/[id]/documents`.

**Asset Register** — asset inventory with serial numbers, warranty dates, and replacement value. Linked to maintenance schedules (frequency-based) and maintenance logs (which can be tied to expense entries). API: `/api/assets`, `/api/assets/[id]/schedules`, `/api/assets/[id]/schedules/[scheduleId]/log`.

**BuildingConditionReport** — property inspection records with a JSON `items` array. API: `GET/POST /api/properties/[id]/condition-reports`.

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
