# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Development server (defaults to :3000, increments if occupied)
npm run build        # Production build — must pass before committing
npm run lint         # ESLint check
npm run db:seed      # Seed historical data (Jun–Oct 2025) — idempotent via upsert
npm run db:seed:demo     # Seed demo property data (Mayfair Suites + read-only demo user)
npm run db:seed:mayfair  # Seed Mayfair Suites data only
npm run db:migrate   # Apply pending migrations (uses DIRECT_URL)
npm run db:studio    # Open Prisma Studio at localhost:5555
npm run db:seed:bahrain  # Seed Al Seef Residences demo (Bahrain, 20 units)
npm start                # Production server (after npm run build)
npx tsc --noEmit     # Type-check without building
```

**Schema changes** — `prisma migrate dev` does NOT work (shadow DB incompatibility with Supabase). Instead:
1. Edit `prisma/schema.prisma`
2. Create `prisma/migrations/[YYYYMMDDHHmmss]_[name]/migration.sql` manually with the raw SQL (follow existing files as templates)
3. `npx prisma db push` — syncs local dev DB
4. `npx prisma generate` — regenerates the client
5. Apply the same SQL in the Supabase SQL Editor for production

There are no automated tests. Validate changes with `npx tsc --noEmit` and `npm run build`.

## Architecture Overview

Next.js 14 App Router app. All source code lives in `src/`.

### Route groups
- `src/app/(auth)/` — unauthenticated pages (`/login`, `/signup`, `/forgot-password`, `/reset-password`, `/select-org`)
- `src/app/(dashboard)/` — all protected pages, share a sidebar layout (`layout.tsx`)
- `src/app/(portal)/` — token-based tenant portal (no auth, no sidebar); bypassed by middleware
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

Manager-only routes (OWNER is blocked): `/income`, `/expenses`, `/petty-cash`, `/tenants`, `/settings`, `/arrears`, `/recurring-expenses`, `/import`, `/insurance`, `/assets`, `/maintenance`, `/vendors`, `/airbnb`, `/forecast`, `/compliance`, `/asset-maintenance`.

Every API route calls one of these helpers from `src/lib/auth-utils.ts`:
- `requireAuth()` — any logged-in user
- `requireManager()` — ADMIN, MANAGER, or ACCOUNTANT (blocks OWNER)
- `requireAdmin()` — ADMIN only (org-admin or super-admin)
- `requireSuperAdmin()` — ADMIN role **and** `organizationId === null` (platform super-admin only)
- `requirePropertyAccess(propertyId)` — verifies current user may access a specific property; returns `{ ok: boolean, error?: Response }`
- `getAccessiblePropertyIds()` — returns property IDs the current user may see (ADMIN = all; OWNER = their owned properties; MANAGER/ACCOUNTANT = `PropertyAccess` records)

**Return type**: `requireAuth()` / `requireManager()` / `requireAdmin()` / `requireSuperAdmin()` all return `{ error: Response | null, session? }`. The `error` IS the full `Response` object — use `if (error) return error;`, never destructure a `status` from it. `requirePropertyAccess()` returns `{ ok, error? }` — use `if (!access.ok) return access.error!`.

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
| `audit.ts` | `logAudit({ userId, userEmail, action, resource, resourceId, before?, after? })` — logs CREATE/UPDATE/DELETE with JSON snapshots |
| `forecast-engine.ts` | `buildForecast(tenants, recurringExpenses, insurancePolicies, agreements, horizon)` — projects monthly cash flow for 3/6/12 months. Called by `GET /api/forecast?propertyId=&months=` |
| `property-context.tsx` | Client context providing `useProperty()` — selected property ID persisted to `sessionStorage` |

### Income ↔ Invoice link
When a `LONGTERM_RENT` income entry is created via `POST /api/income`, the route auto-finds an open invoice for that tenant/month and marks it PAID in the same `prisma.$transaction`. Reverse: marking an invoice PAID via `PATCH /api/invoices/[id]` creates an income entry if none exists (`invoiceId` on `IncomeEntry` prevents duplicates).

### Financial rules
- **Gross income** always excludes `DEPOSIT` type entries
- **Net profit** = Gross − Agent Commissions − Operating Expenses (sunk costs excluded from P&L)
- **Petty cash balance** is always recomputed from all entries, never stored
- **Management fee**: Riara One = flat amount per unit type (configured in `RIARA_MGMT_FEE` constant in `calculations.ts`); Alba Gardens = 10% of gross revenue (`ALBA_MGMT_FEE_RATE`)
- Expenses with `isSunkCost: true` appear in reports as "capital items" and are excluded from the P&L

### PDF generation
`@react-pdf/renderer` is server-only — declared in `serverComponentsExternalPackages` in `next.config.mjs`. The report route sets `export const maxDuration = 30` at the top of `src/app/api/report/route.ts` to handle slow PDF renders (`vercel.json` is otherwise empty). Three separate generators exist: `pdf-generator.ts` (property reports), `invoice-pdf.tsx` (tenant rent invoices), `owner-invoice-pdf.tsx` (owner fee invoices).

The `OrgBranding` type in `invoice-pdf.tsx` carries payment fields (`bankName`, `bankAccountName`, `bankAccountNumber`, `bankBranch`, `mpesaPaybill`, `mpesaAccountNumber`, `mpesaTill`, `paymentInstructions`, `vatRegistrationNumber`) sourced from the `Organization` model. Both PDF routes (`/api/invoices/[id]/pdf` and `/api/portal/[token]/invoices/[invoiceId]/pdf`) must query and pass these fields. Configured in **Settings → Branding → Payment Details**.

### PWA
`next-pwa` wraps the Next.js config. Service worker is disabled in development. Caching strategies (`next.config.mjs`): `/api/dashboard` → `StaleWhileRevalidate` (5 min); all other `/api/**` → `NetworkFirst` (60 s); `https://*.supabase.co/**` → `NetworkFirst` (24 h, cache name `supabase-cache`).

PWA app name is **GroundWorkPM** (`public/manifest.json`). Icons live in `public/icons/`: `icon-192.png`, `icon-512.png`, `icon-maskable.png` (512 × 512, navy `#132635` background, logo inside 80 % safe zone), `apple-touch-icon.png` (180 × 180, cream background). If the source logo changes, regenerate from `Logo/GroundWorkPM Logo.png` using Python Pillow (see git history for the script).

## Property & Domain Model

Three properties are seeded:
- **Riara One** (`PropertyType.LONGTERM`) — 5 units, long-term tenants, flat management fee
- **Alba Gardens** (`PropertyType.AIRBNB`) — 3 units, short-let, 10% management fee
- **Mayfair Suites** (`PropertyType.LONGTERM`) — 5 units, demo data Jan–Mar 2026

`IncomeEntry` has a `type` field (`LONGTERM_RENT`, `AIRBNB`, `DEPOSIT`, `SERVICE_CHARGE`, `UTILITY_RECOVERY`, `OTHER`) and optional `checkIn`/`checkOut`, `nightlyRate`, and `platform` (`AIRBNB`, `BOOKING_COM`, `DIRECT`, `AGENT`) for Airbnb bookings.

`ExpenseEntry` has a `scope` (`UNIT`, `PROPERTY`, `PORTFOLIO`) — the `propertyId` / `unitId` fields are populated based on scope.

## UI Conventions

- **Currency**: use `formatCurrency(amount, currency)` from `src/lib/currency.ts` — supports KES, USD, GBP, EUR, TZS, UGX, ZAR, AED, INR, CHF. `formatKSh()` is kept for backward compat (defaults to KES) — prefer `formatCurrency` for new code that receives a currency string
- **Colours**: `text-income` (green), `text-expense` (red), `text-gold` / `text-gold-dark` — defined in `tailwind.config.ts`
- **Fonts**: `font-display` (DM Serif Display), `font-mono` (DM Mono), `font-sans` (DM Sans)
- **Badge variants**: `"green" | "red" | "amber" | "gray" | "gold" | "blue"` — no `"purple"` or `"yellow"`
- **CurrencyDisplay sizes**: `"sm" | "md" | "lg" | "xl"` — no `"base"`
- Pages use `<Header>` + `<div className="page-container">` shell from the dashboard layout
- Month filtering uses `<MonthPicker>` component which has built-in prev/next arrows — do not add outer arrow buttons
- Vendor fields use `<VendorSelect>` (controlled: `value: string | null`, `onChange: (id: string | null) => void`) — never a plain text input for contractor/supplier fields
- **HelpTip**: `<HelpTip text="..." position="above|below" />` (`src/components/ui/HelpTip.tsx`) — small ℹ icon that shows a dark tooltip on hover. Default position is `"above"`; use `"below"` for elements near the top of the page (KPI cards, summary strips). Render inside label rows as `<span className="flex items-center gap-1.5"><span>Label</span><HelpTip text="..." /></span>`. The `Input`, `Select`, and `VendorSelect` components accept a `tooltip` prop that wires this up automatically.
- **Mobile table pattern**: pages with data tables use `md:hidden` stacked card list + `hidden md:block overflow-x-auto` desktop table. The `<main>` in `src/app/(dashboard)/layout.tsx` carries `overflow-x-hidden` to prevent any overflowing child from creating a page-level horizontal scroll (which shifts the fixed bottom nav). `MobileNav` bar items require `min-w-0` on each flex child and `truncate w-full` on each label `<span>` to prevent long labels pushing items off-screen on narrow devices.
- Components are organised under `src/components/` by feature: `dashboard/`, `expenses/`, `forecast/`, `guests/`, `income/`, `layout/`, `petty-cash/`, `report/`, `settings/`, `tenants/`, `ui/`

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

**Vendor Registry** — org-scoped vendor/contractor records (`VendorCategory`: `CONTRACTOR`, `SUPPLIER`, `UTILITY_PROVIDER`, `SERVICE_PROVIDER`, `CONSULTANT`, `OTHER`) with phone, email, KRA PIN, bank details, and `isActive` toggle. `vendorId` FK exists on `ExpenseEntry`, `MaintenanceJob`, `AssetMaintenanceLog`, `RecurringExpense`, and `Asset`. API: `GET/POST /api/vendors`, `GET/PATCH/DELETE /api/vendors/[id]` — DELETE returns 409 with `linkedCount` if records are linked (deactivate instead). The `VendorSelect` combobox component (`src/components/ui/VendorSelect.tsx`) uses a module-level cache (`vendorCache`) and supports inline quick-create; use it wherever a vendor field is needed rather than a plain text input.

**Recurring Expenses** — standing cost templates with frequency (`MONTHLY`, `QUARTERLY`, `BIANNUAL`, `ANNUAL`) and `nextDueDate`. `POST /api/recurring-expenses/apply` (body: `{ year, month }`) materialises all due entries as real `ExpenseEntry` rows and advances `nextDueDate`. API: `GET/POST /api/recurring-expenses`, `GET/PATCH/DELETE /api/recurring-expenses/[id]`.

**Standalone Maintenance Schedules** — property/unit-level (not asset-linked) recurring maintenance tasks. API: `GET/POST /api/maintenance/schedules`, `GET/PATCH/DELETE /api/maintenance/schedules/[scheduleId]`. Asset-linked schedules use a separate path: `/api/assets/[id]/schedules/[scheduleId]`. Auth: `requireAuth` for reads, `requireManager` for writes; 403 is returned if a non-manager tries to edit/delete an asset-linked schedule.

**Airbnb Guests** — `AirbnbGuest` records (independent of bookings) and `BookingGuest` join records that link guests to an `IncomeEntry`. API: `GET/POST /api/guests`, `GET/PATCH/DELETE /api/guests/[id]`, `GET/POST/DELETE /api/guests/[id]/documents`, `GET/POST /api/bookings/[entryId]/guests`, `DELETE /api/bookings/[entryId]/guests/[guestId]`.

**Agents** — commission-based letting agents. `Agent` model stores name, phone, email, and commission rate. `vendorId`-like FK on `IncomeEntry` (agent commissions deducted from net profit). API: `GET/POST /api/agents`, `GET/PATCH/DELETE /api/agents/[id]`.

**Compliance** — `GET /api/compliance` returns compliance status across insurance, lease renewals, and maintenance for accessible properties.

**RentHistory** — tracks rent escalations and adjustments over time, linked to `Tenant`. API: `GET/POST /api/tenants/[id]/rent-history`, `DELETE /api/tenants/[id]/rent-history?entryId=`.

**Tenant sub-routes** (not covered above):
- `POST /api/tenants/[id]/vacate` — marks tenant vacated, sets unit status to `VACANT`
- `POST /api/tenants/[id]/settle-deposit` — records deposit settlement with itemised deductions (`DepositSettlement` model)
- `GET /api/properties/[id]/reassign-preview?targetOrgId=` — dry-run org reassignment showing which users gain/lose membership (super-admin only)

**Owner Statement** — `GET /api/report/owner-statement?propertyId=&year=&month=` returns a per-unit income breakdown for owner-facing reports. Used by the `/report` page (OWNER role).

**Compliance Certificates** — `ComplianceCertificate` model stores per-property compliance docs (types: free-text string, e.g. "Fire Safety", "Lift Inspection"). Status is computed at query time: `EXPIRED` (days < 0), `EXPIRING_SOON` (days ≤ 30), `VALID`, `ONGOING` (no `expiryDate`). API: `GET/POST /api/compliance/certificates`, `GET/PATCH/DELETE /api/compliance/certificates/[id]`. Page: `/compliance/certificates`.

### Tenant Portal

Token-based read-only portal for tenants — no login required, shareable link. Lives in the `(portal)` route group (`src/app/(portal)/portal/[token]/page.tsx`).

- `portalToken` (UUID, unique) and `portalTokenExpiresAt` fields on `Tenant` model
- Middleware allows `/portal/*` without a session
- Shared auth helper: `src/lib/portal-auth.ts` → `validatePortalToken(token)` — returns the tenant with full unit/property/org includes, or `null` if missing/expired
- Portal API routes all live under `src/app/api/portal/[token]/`:
  - `GET /api/portal/[token]` — tenant info, unit, property, last 12 invoices, outstanding balance
  - `GET /api/portal/[token]/documents` — tenant documents with signed Supabase URLs
  - `GET /api/portal/[token]/invoices/[invoiceId]/pdf` — PDF download (validates invoice belongs to this tenant)
  - `GET/POST /api/portal/[token]/maintenance` — GET returns only `submittedViaPortal: true` jobs; POST creates a job with `submittedViaPortal: true`, `priority: MEDIUM`, `status: OPEN`
- Manager generates/revokes the link from the tenant detail page (`POST/DELETE /api/tenants/[id]/portal-token`)
- Maintenance jobs submitted via portal show a "Tenant Request" badge in the maintenance queue; filterable via `?portalOnly=true` query param on `GET /api/maintenance`

### SaaS Onboarding & Demo System

**Signup flow** (`/signup` → `/onboarding`):
- `POST /api/auth/signup` — creates User + Organization + UserOrganizationMembership in a single request (credentials-based). Redirects to `/onboarding` after auto sign-in.
- Google OAuth users land at `/onboarding` with no org yet (`session.user.organizationId === null`). `needsOrg: true` triggers org creation inline in Step 1 via `POST /api/onboarding/create-org`.
- `POST /api/onboarding/create-org` — creates Organization (30-day TRIAL), updates `User.organizationId`, creates `UserOrganizationMembership`. Uses sequential awaits (not callback-form `prisma.$transaction`) due to pgBouncer incompatibility. On failure, best-effort deletes the org to avoid orphaned data.
- Password reset: `POST /api/auth/forgot-password` sends a reset token; `POST /api/auth/reset-password` validates token and updates the password hash.

**Onboarding wizard** (`src/app/onboarding/page.tsx`) — 3 steps:
1. **Property** — org name (Google OAuth only), property name/type/currency/address. Calls `create-org` then `POST /api/properties`.
2. **Units** — add unit numbers/types/rent. Calls `POST /api/units` for each.
3. **Done** — optionally loads a sample demo property. Calls `POST /api/demo/seed` with `{ demoKey, organizationId }`, then `session.update()` to refresh JWT, then navigates to `/`.

**Demo seed system**:
- `src/lib/demo-definitions.ts` — registry of `DemoDefinition` objects with fields `key`, `name`, `country`, `currency`, `units`, `description`, `flag` (emoji). Adding an entry here automatically surfaces it in the onboarding demo picker and the Properties page empty state. Each new demo also needs a matching `case` in `POST /api/demo/seed` (route file) and a corresponding seed script (e.g. `npm run db:seed:bahrain`).
- `POST /api/demo/seed` — seeds a full demo property into the caller's active org. Body: `{ demoKey: string, organizationId?: string }`. The client always sends `organizationId` (the active session org) so the server never has to guess from a potentially stale JWT. After seeding, calls `grantAccess()` which bulk-inserts `PropertyAccess` rows for every `UserOrganizationMembership` member of the org (`skipDuplicates: true`) so all users see the property. Returns `{ ok: true, propertyId }` or `{ ok: false, reason: "already_seeded", propertyId }`. Idempotency: checks `_count.units > 0`; if property exists but has no units (partial timeout), deletes and re-seeds. Has `export const maxDuration = 60` (Vercel function timeout).
- Currently implemented demo: `"al-seef"` → Al Seef Residences (20-unit Bahrain tower, `seedAlSeef()` inside the route file).

**pgBouncer constraint**: Supabase uses pgBouncer in transaction pooling mode. This makes the callback-form `prisma.$transaction(async (tx) => {...})` incompatible — it silently commits partial work. Always use sequential `await` calls with manual cleanup, or the array-form `prisma.$transaction([op1, op2, ...])` for atomic operations.

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
