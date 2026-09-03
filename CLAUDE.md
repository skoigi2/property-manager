# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Delivery workflow (READ FIRST)

Production deploys ship from `main`. **The user's current policy (stated 2026-05) is to commit and push directly to `main` — no `claude/*` feature branches, no PRs.** Pushing `main` is the deploy trigger; the user merges nothing.

Rules for every session:

1. **Commit straight to `main` and push when work is complete.** Don't wait for a separate "push" instruction — staging, a descriptive commit, and `git push origin main` are the final step of every task.
   ```bash
   git checkout main && git pull
   git add <only the files relevant to this task>
   git commit -m "<short summary>"
   git push origin main
   ```
   Do **not** run `gh pr create` or create `claude/*` branches unless the user explicitly asks. (Older commits used a branch-and-PR flow; that is superseded.)

2. **Stage selectively.** This working tree carries unrelated marketing/logo/asset changes that must stay unstaged — never `git add -A`. Add only the source files your task touched.

3. **End-of-task checklist:** `npm run build` passes → commit → push `main` → tell the user what shipped and (if a schema change) which migration SQL to run in Supabase prod.

> If you ever find work that looks missing, check `git log origin/main` first; with the direct-to-main flow there should be no unmerged `claude/*` branches to hunt through.

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
# Note: additional demos (sandton-heights, belsize-court) seed via the
# in-app onboarding picker / POST /api/demo/seed — no dedicated npm script.
npm start                # Production server (after npm run build)
npx tsc --noEmit     # Type-check without building
npm test             # Vitest unit tests (src/**/*.test.ts) — financial libs covered
npm run test:watch   # Vitest watch mode
```

**Schema changes** — `prisma migrate dev` does NOT work (shadow DB incompatibility with Supabase). Instead:
1. Edit `prisma/schema.prisma`
2. Create `prisma/migrations/[YYYYMMDDHHmmss]_[name]/migration.sql` manually with the raw SQL (follow existing files as templates)
3. `npx prisma db push` — syncs local dev DB
4. `npx prisma generate` — regenerates the client
5. Apply the same SQL in the Supabase SQL Editor for production

Unit tests live in `src/lib/__tests__/` (Vitest, pure-function coverage of `calculations.ts`, `tax-engine.ts`, `date-utils.ts`, `subscription.ts`). GitHub Actions CI (`.github/workflows/ci.yml`) runs `prisma generate` → `tsc --noEmit` → `npm test` on every push to main. Validate changes with `npm test`, `npx tsc --noEmit`, and `npm run build`. When touching financial logic, add/extend a test.

## Architecture Overview

Next.js 14 App Router app. All source code lives in `src/`.

### Route groups
- `src/app/(auth)/` — unauthenticated pages (`/login`, `/signup`, `/forgot-password`, `/reset-password`, `/select-org`)
- `src/app/(dashboard)/` — all protected pages, share a sidebar layout (`layout.tsx`)
- `src/app/(marketing)/` — public pages outside the dashboard chrome (`/blog`, `/pricing`, `/contact`, `/privacy`, `/terms`, `/refund`)
- `src/app/(portal)/` — token-based tenant portal (no auth, no sidebar); bypassed by middleware
- Top-level routes outside any group: `/onboarding`, `/invite/[token]`, plus `robots.ts` and `sitemap.ts`. The landing page `/` lives inside `(marketing)` as `src/app/(marketing)/page.tsx` so it inherits the shared nav + footer from `(marketing)/layout.tsx`
- `src/app/api/` — Route Handlers only; no server components fetch data directly

### Auth & access control
Auth is **NextAuth v5 with JWT strategy** (`src/lib/auth.ts`). The JWT callback adds `role` to the token; the session callback exposes it as `session.user.role`.

Roles (`UserRole` enum): `ADMIN` (superuser), `MANAGER`, `ACCOUNTANT`, `OWNER`, `CARETAKER` (on-site staff — see below).

**`role` vs `orgRole`**: `session.user.role` is the global `User.role` and is used **only** for super-admin detection. `session.user.orgRole` is the membership role for the active org (`UserOrganizationMembership.role`, falling back to `User.role`) and is what **every** authority decision keys on — API helpers, middleware, the dashboard layout, Sidebar, MobileNav and page-level gates. The invitation flow writes only the membership role, so `User.role` can lag; never branch UI on it.

**Super-admin vs org-admin**: Both have `role = "ADMIN"` but differ by `organizationId`:
- Super-admin: `organizationId = null` — platform-level, sees all orgs and all data
- Org-admin: `organizationId = <id>` — scoped to one organisation

Use `requireSuperAdmin()` from `src/lib/auth-utils.ts` for super-admin-only routes. Never use `role === "ADMIN"` alone as a super-admin check — org-admins share that role.

**Allow-lists, never deny-lists.** Every route helper is an allow-list keyed on `orgRole` (`src/lib/roles.ts`: `MANAGER_ROLES`, `ESTABLISHED_ROLES`, `OPS_ROLES`, `isRoleAllowed`). A role that is not named is denied, so a new enum value reaches nothing until a route opts it in. Do not write `orgRole !== "OWNER"`-style checks.

Middleware (`src/middleware.ts`) enforces (on `orgRole`):
- Unauthenticated → `/login`
- OWNER role → `/report` only; accessing any manager-only route redirects back to `/report`
- CARETAKER role → allow-list `CARETAKER_PATHS` (`/expenses`, `/maintenance`, `/vendors`, `/help/tutorials`, plus `/select-org`, `/onboarding`, `/invite`); anything else redirects to `/maintenance`
- ADMIN / MANAGER / ACCOUNTANT → full access

Manager-only routes (OWNER is blocked) per `src/middleware.ts`: `/income`, `/expenses`, `/petty-cash`, `/tenants`, `/settings`, `/arrears`, `/recurring-expenses`, `/import`, `/insurance`, `/assets`, `/maintenance`, `/airbnb`, `/forecast`, `/vendors`, `/cases`, `/automations`. (Note: `/compliance`, `/asset-maintenance`, `/calendar`, `/billing`, `/upgrade` are reachable by all authenticated roles.)

Every API route calls one of these helpers from `src/lib/auth-utils.ts`:
- `requireAuth()` — any logged-in user of an **established** role (ADMIN / MANAGER / ACCOUNTANT / OWNER). Excludes CARETAKER.
- `requireSession()` — any signed-in user of **any** role, CARETAKER included. Opt-in only: `src/lib/__tests__/route-guards.test.ts` fails when a route file uses it (or `requireOpsStaff*` / `requireExpenseMutation`) without being in `CARETAKER_ROUTE_ALLOWLIST`. That test is the documented caretaker route allow-list.
- `requireManager()` — ADMIN, MANAGER, or ACCOUNTANT (allow-list; denies OWNER and CARETAKER). Never add CARETAKER here.
- `requireOpsStaff()` / `requireOpsStaffWrite()` — manager tier **plus CARETAKER** (`OPS_ROLES`); used by the expenses / maintenance / vendors routes a caretaker may reach.
- `requireRoles(allowed)` / `requireRolesWrite(allowed)` — generic allow-list gate the others are built on.
- `requireAdmin()` — ADMIN only (org-admin or super-admin)
- `requirePermissionWrite(action)` — `requireManagerWrite` **plus** the granular role map in `src/lib/permissions.ts`. ACCOUNTANT is denied `FINANCIAL_DELETE` (deleting income/expenses/petty-cash/invoices/owner-invoices, incl. the bulk delete actions), `TENANT_LIFECYCLE` (tenant delete, vacate, settle-deposit, checkout finalize), and `ORG_SETTINGS` (settings POST, tax-config create/update/delete). CARETAKER is denied `EXPENSE_EDIT_OTHERS`, `EXPENSE_BULK`, `TENANT_LIFECYCLE`, `ORG_SETTINGS`. Returns 403 with `code: "PERMISSION_DENIED"`. Use this instead of `requireManagerWrite` for new destructive/lifecycle mutations.
- `requireExpenseMutation(id, "edit" | "delete" | "attach")` (`src/lib/expense-access.ts`) — the **only** way to mutate an `ExpenseEntry` by id (PUT, DELETE, receipt upload/delete). Does auth (`requireOpsStaffWrite`), existence, property access / org scoping, the ACCOUNTANT `FINANCIAL_DELETE` denial, and the CARETAKER rules: own rows only (`ExpenseEntry.createdByUserId === session.user.id`; `NULL` = nobody's row), and 409 `PETTY_CASH_CONFIRMED` once the linked petty-cash OUT row is APPROVED. Pure rules in `src/lib/expense-rules.ts` (`decideExpenseMutation`).
- `requireAuthWrite()` / `requireManagerWrite()` / `requireAdminWrite()` — same auth check **plus the subscription write-gate** (`requireActiveSubscription`, 402 when the org is locked). **Use these in every mutating handler (POST/PATCH/PUT/DELETE) on org-scoped resources**; keep the base helpers for GETs so locked orgs can still read their data. Exemptions (must keep working while locked): auth flows, billing/stripe, webhooks, cron, portal/approvals token routes, invitations, onboarding, demo seed, admin, organizations, and `POST /api/report` (PDF render = read in spirit).
- `requireSuperAdmin()` — ADMIN role **and** `organizationId === null` (platform super-admin only)
- `requirePropertyAccess(propertyId)` — verifies current user may access a specific property; returns `{ ok: boolean, error?: Response }`
- `getAccessiblePropertyIds()` — returns property IDs the current user may see (ADMIN = all; OWNER = their owned properties; MANAGER/ACCOUNTANT/CARETAKER and any future role = `PropertyAccess` records only — fails closed)

### CARETAKER (on-site staff)

Property-scoped operations role for caretakers. Consumes a **caretaker seat** (`CARETAKER_LIMITS` in paddle.ts, a separate pool from `TEAM_LIMITS`: TRIAL/STARTER=2, GROWTH=10, PRO=∞; `canAddUser(orgId, role)` picks the pool). Creating or inviting one **requires ≥1 property** (no grant-all default).

Reachable surfaces (everything else is denied by the allow-lists above): `/expenses`, `/maintenance`, `/vendors`, `/help/tutorials`; APIs per `CARETAKER_ROUTE_ALLOWLIST` in `src/lib/__tests__/route-guards.test.ts`. Rules:
- **Expenses**: sees amounts; creates (property/unit scope only — PORTFOLIO is 400); edits/deletes/attaches receipts on **own rows only** (`createdByUserId`, stamped at every `ExpenseEntry` create site incl. maintenance `log_expense`). No bulk, no delete-all, no change history.
- **Petty cash**: may tick `paidFromPettyCash`; the linked OUT row is created **PENDING** (`resolvePettyCashOutStatus` in `src/lib/petty-cash-status.ts`; managers' rows stay APPROVED) and the float holder confirms on `/petty-cash` (`notifyPettyCashPending` emails them). Once APPROVED the caretaker's expense is locked (409); a caretaker edit of a PENDING/REJECTED row resubmits it. **Rejecting** a linked OUT row reverts the expense to unpaid and emails the creator. The caretaker never sees a balance: `/petty-cash`, `GET /api/petty-cash`, dashboard, report, `/api/hints` and `/api/inbox` are all denied, and `hintTypesVisibleTo("CARETAKER")` (`src/lib/hint-visibility.ts`) suppresses `LOW_PETTY_CASH` in both hint surfaces for Phase 2.
- **Vendors** (org-scoped): full-field create (bank details, tax id) with the full record echoed back; **trimmed read** `{ id, name, category, phone, isActive }` on `GET /api/vendors` and `/[id]` (`src/lib/vendor-projection.ts`); no PATCH/DELETE/statements. `POST /api/vendors` now returns 409 `DUPLICATE_VENDOR` on a normalised name match for **all roles** unless `allowDuplicate: true` (the Vendors page and `VendorSelect` quick-create offer "Use existing / Create anyway"), and writes a `Vendor` audit row (`bankdetails`/`taxid` are redacted by `SENSITIVE_KEY_PATTERNS`).
- **Maintenance**: create, update (status / vendor / priority / `log_expense`), assign vendor; no delete, no schedule writes, no `/cases` (the "Open case" link is hidden).
- **`GET /api/properties`** returns a caretaker projection (name/type/currency + `units {id, unitNumber, type, status}`); OWNER/ACCOUNTANT no longer receive property bank fields or owner/manager emails either.
- Phase 2 (not built): tenant complaints via `CaseThread` `caseType = COMPLAINT`, a tenants-lite directory read, a maintenance-filtered inbox, per-group search.

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
| `audit.ts` | `logAudit({ userId, userEmail, action, resource, resourceId, before?, after? })` — logs CREATE/UPDATE/DELETE with JSON snapshots |
| `blog-posts.ts` | Static blog post metadata for marketing pages |
| `calculations.ts` | `calcUnitSummary`, `calcPettyCashBalance`, `calcPettyCashTotal`, `calcOccupancyRate`, `calcLateInterest`, `calcExpensePayment` (derived paid/outstanding/status per expense) |
| `management-fee.ts` | `calcPropertyManagementFee` — single fee-precedence chain (per-unit `ManagementFeeConfig` → property rate/flat → agreement rate → 0) used by owner statements, report P&L, and mgmt-fee invoicing |
| `date-utils.ts` | `getLeaseStatus` (OK/WARNING/CRITICAL/TBC), `daysUntilExpiry`, `getMonthRange` |
| `email.ts` | Resend wrapper. Every send goes through `sendAndLog()` which writes an `EmailLog` row. Exports `sendPasswordReset`, `sendOrgInvitation`, `sendContactEmail`, `sendNewUserAlert`, `sendWelcome` (founder — mentions the trial, links `/onboarding`), `sendTeamWelcome` (invitee joining an existing org — names the org + role, links `/dashboard`; used by the invited-signup path and sign-in auto-join), `sendNotificationEmail` |
| `excel-export.ts` | SheetJS multi-sheet Excel export for income/expenses |
| `forecast-engine.ts` | `buildForecast(tenants, recurringExpenses, insurancePolicies, agreements, horizon)` — projects monthly cash flow for 3/6/12 months. Called by `GET /api/forecast?propertyId=&months=` |
| `import-templates.ts` | XLSX download template generators for bulk import |
| `invoice-pdf.tsx` | Server-only. Tenant rent invoice PDF |
| `owner-invoice-pdf.tsx` | Server-only. Owner fee invoice PDF (letting, mgmt, renewal fees, etc.) |
| `paddle.ts` | Paddle pricing-tier mapping + `PROPERTY_LIMITS`. Used by checkout, webhook handler, and subscription gating |
| `pdf-generator.ts` | Server-only. Property report PDF via `@react-pdf/renderer`. Used only in `POST /api/report` |
| `portal-auth.ts` | `validatePortalToken(token)` — returns the tenant (with unit/property/org includes) for a portal token, or `null` if missing/expired. Every portal API route's first call |
| `property-context.tsx` | Client context providing `useProperty()` — selected property ID persisted to `sessionStorage` |
| `receipt-pdf.tsx` | Server-only. Simplified one-page payment receipt PDF for paid invoices. Used by `/api/portal/[token]/invoices/[invoiceId]/receipt` |
| `setup-progress.ts` | `computeSetupProgress(propertyId)` — derives a 0–100% configuration score and per-step ✅/⚠ checklist from live DB state (units, tenants, portal tokens, recurring expenses, insurance, vendors, agreement, org branding, first entry). Items with `applicable: false` (e.g. tenants/portal for AIRBNB) are excluded from the %. Used by the dashboard `SetupChecklist` widget and the Properties-page progress badge |
| `stripe.ts` | Lazy Stripe SDK singleton — used by `/api/stripe/status` and billing flows |
| `supabase-storage.ts` | Lazy Supabase client. `uploadToStorage(path, buffer, contentType)`, `deleteFromStorage(path)`, `getSignedUrl(path, expiresIn=3600)`. Bucket: `tenant-documents` |
| `subscription.ts` | Subscription / pricing-tier helpers (property cap checks, trial state) |
| `tax-engine.ts` | Pure tax calculation helpers (VAT/WHT/GST/TDS/Tourism Levy etc.) driven by per-org / per-property `TaxConfiguration` records |
| `validations.ts` | Zod schemas for all form inputs — `incomeEntrySchema`, `expenseEntrySchema` (incl. `amountPaid`/`dueDate`/`vatAmount`/`paymentMethod`/`paymentReference`/`paymentDate`/`notes`), `pettyCashSchema`, `tenantSchema`, `manualEmailSchema` |

### Global search

`GET /api/search?q=` (`requireManager`, min 2 chars) searches tenants, properties, invoices, vendors, cases, and maintenance jobs (5 per group), scoped by `getAccessiblePropertyIds()` + org for vendors. UI: `src/components/layout/GlobalSearch.tsx` — Cmd/Ctrl+K palette mounted in the dashboard layout (hidden for OWNER), with a Sidebar trigger that dispatches the `gw:open-global-search` window event.

### Public API & Webhooks

Org-scoped read-only public API under `/api/v1/` (`properties`, `tenants`, `invoices` — cursor-paginated), authenticated via `Authorization: Bearer gwpm_…`. Keys are sha256-hashed at rest (`ApiKey` model, raw value shown once); `authenticateApiKey()` in `src/lib/api-auth.ts`. Webhooks: `WebhookEndpoint` model + `dispatchWebhookEvent(orgId, event, data)` in `src/lib/webhooks.ts` (HMAC `X-GWPM-Signature`, fire-and-forget with `void`, failure counters). Events: `invoice.paid` (invoices PATCH), `maintenance.created` (maintenance POST) — extend `WEBHOOK_EVENTS` + add a dispatch call site. Management: `/api/api-keys`, `/api/webhook-endpoints` (admin-only) + `/settings/api` page (admin-only sidebar entry).

### Operational Inbox

`/inbox` (`src/app/(dashboard)/inbox/`) is the prioritized action queue for managers — first item in both the desktop sidebar and the mobile bottom nav (`MobileNav.tsx`). OWNER role is blocked at the middleware (`managerOnlyPaths`) and falls through to `/report`.

The aggregator lives in `src/lib/inbox.ts` (`buildInbox(propertyIds)`) and runs every source query as one `Promise.all` (reads only — no `prisma.$transaction`). It produces `InboxItem[]` (each with `severity: URGENT|WARNING|INFO`, `daysOverdue`, deep-link `href`, and `actions[]`) plus `counts: { urgent, today, thisWeek }`.

Sources covered:
1. Overdue `Invoice` rows (status `SENT`/`OVERDUE`, `dueDate < now`)
2. `Tenant.leaseEnd` within 30 days (severity via `getLeaseStatus`)
3. `MaintenanceJob` with `priority=URGENT, status=OPEN`
4. `MaintenanceJob` with `submittedViaPortal=true, status=OPEN, acknowledgedAt=null` (deduped against #3, max severity wins)
5. `ComplianceCertificate` expiring ≤30 days
6. `InsurancePolicy.endDate` ≤30 days
7. `ArrearsCase` with `stage != RESOLVED` and `updatedAt < now-7d` (URGENT for `LEGAL_NOTICE`/`EVICTION`)
8. Pending approvals — `TODO`

API: `GET /api/inbox` — `requireManager()` + `getAccessiblePropertyIds()` then delegates to `buildInbox`. Returns `{ items, counts }`. The Sidebar polls this every 60 s to render the red urgent-count badge next to the Inbox nav item.

The bulk "Send reminders" action **actually emails tenants**: `POST /api/inbox/send-reminders` `{ invoiceIds }` (≤50) sends each overdue-invoice tenant a rent-payment reminder (invoice number, outstanding amount, days overdue), writes a `CommunicationLog` row per send, and reports tenants without an email address back as failures — it never silently logs-without-sending.

### Income ↔ Invoice link
When a `LONGTERM_RENT` income entry is created via `POST /api/income`, the route auto-finds an open invoice for that tenant/month and marks it PAID in the same `prisma.$transaction`. Reverse: marking an invoice PAID via `PATCH /api/invoices/[id]` creates an income entry if none exists (`invoiceId` on `IncomeEntry` prevents duplicates).

**Invoice bulk actions & late fees** (invoices page has checkbox multi-select on the desktop table):
- `POST /api/invoices/bulk-send` `{ ids }` (≤50) — emails each PDF via the shared `emailInvoiceToTenant`; per-invoice failures reported, not aborting the batch.
- `POST /api/invoices/bulk-mark-paid` `{ ids, paidAt? }` (≤100) — PAID + income-entry creation + `clearHints` + case auto-advance + `invoice.paid` webhook per invoice, mirroring the single PATCH.
- **Late fee** (`Invoice.lateFeeAmount` + `lateFeeAppliedAt`, migration `20260728090000_invoice_late_fee`): manager-triggered via `GET/POST/DELETE /api/invoices/[id]/late-fee` — fee = `calcLateInterest(outstanding, agreement.latePaymentInterestRate, daysOverdue)`, folded into `totalAmount` and shown as a "Late Payment Fee" PDF line. The PATCH total recompute preserves it. UI: "Apply late fee…" in the row's status dropdown (`LateFeeModal`).
- **Unpay** (`POST /api/invoices/[id]/unpay`, `requirePermissionWrite("FINANCIAL_DELETE")`): properly reverses an accidental mark-paid — status returns to SENT/OVERDUE, `paidAt`/`paidAmount` clear, and the linked `IncomeEntry` rows are deleted in the same transaction so books don't double-count. For a PAID invoice the row's status dropdown shows only "Revert to unpaid…" (never raw status flips, which would strand the income entry).
- **Pagination**: `GET /api/invoices?limit=&cursor=` (opt-in — with `limit` the response becomes `{ invoices, nextCursor, total }`; without it the legacy full array is returned for existing callers like the tenant-detail `?tenantId=` fetch). Order has an `id` tiebreak for stable cursors. The invoices page loads 200 at a time with a "Load more" footer.

### Rent roll & arrears aging in reports
- `GET /api/report/rent-roll?propertyId=` — lease-snapshot rows (every unit incl. vacant + active tenant terms); exported client-side by `exportRentRoll` in `excel-export.ts` via the "Rent Roll (Excel)" button on `/report`.
- `buildAgingSnapshot(propertyIds)` in `src/lib/arrears-aging.ts` is the shared 30/60/90 bucket engine — used by `GET /api/arrears/aging` (the `/arrears` page) and both report builders, which attach `ReportData.arrearsAging` (top-15 debtors) rendered as an "Arrears Aging" section in the `/report` P&L preview and the report PDF.

### Financial rules
- **Money columns are `Decimal @db.Decimal(14, 2)`** (Postgres `numeric(14,2)` — exact). The app still works in plain `number` everywhere: the Prisma singleton (`src/lib/prisma.ts`) converts Decimal→number at the boundary via two extensions — the **generated** result extension `src/lib/prisma-decimal-extension.ts` (fixes the TS types per field) and a query-level deep converter in `src/lib/money.ts` (covers `aggregate`/`groupBy` at runtime). **When adding a money column**: declare it `Decimal @db.Decimal(14, 2)` in the schema AND add its `needs/compute` entry to the model's block in `prisma-decimal-extension.ts` — otherwise its client type leaks as `Decimal`. Rates/percentages/`sizeSqm` stay `Float`. Financial libs (`calculations.ts`, `tax-engine.ts`) take structural `{ field: number }` params, never raw Prisma model types.
- **Gross income** always excludes `DEPOSIT` type entries
- **Net profit** = Gross − Agent Commissions − Operating Expenses (sunk costs excluded from P&L)
- **Petty cash balance** is always recomputed from all entries, never stored
- **Petty cash ↔ Expenses policy**: spending belongs on the Expenses page (with `paidFromPettyCash`, which auto-creates the linked OUT row) — a manual petty-cash OUT never reaches the P&L. The Petty Cash page enforces this softly: an OUT-entry nudge with "Record as expense instead" (deep-links `/expenses?prefill=petty&…`), an "unaccounted cash out" banner summing unlinked approved OUTs (all-time) with a show-only-these mode, "From expense"/"Not in P&L" badges per row, and `POST /api/petty-cash/[id]/convert-to-expense` (creates a fully-paid CASH expense from the row and links it WITHOUT going through `POST /api/expenses`, which would mint a second OUT row). Expenses bulk API also supports `action: "mark_paid"` (raw-SQL column-copy settle, line items included), and the expenses GET includes a null-property/unit OR arm so true PORTFOLIO expenses appear in the list (only when no `propertyId` filter is set).
- **Org scoping for property-less financial rows**: `ExpenseEntry.organizationId` + `PettyCash.organizationId` (nullable, indexed — migration `20260729150000_org_scope_expenses_petty_cash`, which also backfills via property/unit/allocation links) are the scoping handle for rows with no property to resolve through (PORTFOLIO expenses, unassigned petty cash). **Every create site must stamp it** from `session.user.organizationId` (or the resolved property's org) — expenses/petty POST + PUT-side petty create, convert-to-expense, recurring apply, checkout finalize, maintenance log-expense, asset logs, and the expenses/petty-cash/handover importers all do. Read/mutate rules: property-linked rows use property access as before; property-less rows require `organizationId ∈ {session org, null}` — legacy null-org rows are **grandfathered visible**, super-admin (session org null) sees all, and another org's row returns 404 (not 403) so it looks nonexistent. Applied in expenses GET/PUT/DELETE + bulk, petty-cash GET/PATCH/DELETE + convert.
- **Expense payment status / outstanding balance** are derived via `calcExpensePayment`, never stored (see Domain Model). `amount` is always **net of VAT**; `vatAmount` is separate. The report's Tax Summary reads `expenseTaxItems(expenses)` (tax-engine.ts): line items when present, else a synthetic ADDITIVE item from a plain expense's `vatAmount` — a single-amount expense's VAT must reach the summary too. **`paidFromPettyCash: true` means paid in full** — `calcExpensePayment` treats the flag as settled (covers legacy rows), and both expense routes stamp `amountPaid = amount`, `paymentMethod ?? CASH`, `paymentDate ?? date` (line items: each line paid in full) so exports agree. Line-item `paymentStatus` is **derived** server-side via `calcLinePaymentStatus(amount, amountPaid)`, never trusted from the client.
- **Expense scope decides the targets**: `resolveExpenseTargets(scope, {unitId, unitIds, propertyId})` in `src/lib/expense-scope.ts` (pure) drops ids that don't belong to the scope (a property picked before switching to UNIT must not persist); `checkExpenseTargets()` in `src/lib/expense-targets.ts` then verifies the units exist, **refuses a split across two properties** (400), and checks property access (403). Both `POST /api/expenses` and `PUT /api/expenses/[id]` go through it; `expenseEntrySchema` (`superRefine`) additionally requires a unit for UNIT scope / a property for PROPERTY scope, a positive amount, an explicitly picked category, `amountPaid ≤ amount`, and no payment date without an amount paid. The Expenses form surfaces the server's `error` string verbatim via `readApiError` — return plain strings for user-facing failures.
- **Management fee**: every surface derives the fee through one precedence chain — `calcPropertyManagementFee` in `src/lib/management-fee.ts`: per-unit `ManagementFeeConfig` rows (flat, else `ratePercent% × monthlyRent`; unconfigured units get **no** fee) → `Property.managementFeeRate` (% × period gross) → `Property.managementFeeFlat` (per month) → `ManagementAgreement.managementFeeRate` (% × period gross) → **0**. "No management fee" is a first-class state — nothing is hardcoded. Applied in owner statements, both report P&L builders, and `POST /api/owner-invoices/generate-mgmt-fee` (which mirrors the same precedence for line items and 400s when nothing is configured). The forecast applies the agreement rate itself. The legacy `RIARA_MGMT_FEE` constant has been deleted.
- Expenses with `isSunkCost: true` appear in reports as "capital items" and are excluded from the P&L
- **Revenue recognition is CASH basis**: the P&L, dashboards and owner statements sum `IncomeEntry.grossAmount` filtered on `IncomeEntry.date` (the receipt date). Invoices are billing artifacts, never a revenue source; there is no deferred/unearned/accrued income model.
- **Payment frequency**: `Tenant.paymentFrequency` (MONTHLY/QUARTERLY/BIANNUAL/ANNUAL) drives schedule-aware billing via `scheduledExpectedForMonth` in `src/lib/rent-schedule.ts` — period payers owe the full period amount on billing months anchored to lease start and nothing in between. Applied in invoice generation, the Income collection + arrears views, dashboard arrears alerts, the tenant ledger, report rent-collection, and owner statements. New "expected rent" surfaces must go through it, never raw `monthlyRent × months`.
- **Deposits — contractual vs received**: `Tenant.depositAmount` is the CONTRACTUAL deposit; what is actually held is the sum of `DEPOSIT` income entries linked to the tenant — `calcDepositPosition` in `src/lib/deposit.ts` (`POST /api/income` auto-links the active tenant for DEPOSIT entries, like rent). Checkout draft/finalize and deposit settlement refund from the receipts sum when a trail exists (snapshot in `CheckoutProcess.depositReceived`, base stored in `DepositSettlement.depositHeld`) and fall back to the contractual amount with an "unverified" warning when none is recorded. DEPOSIT entries remain excluded from gross income.

### PDF generation
`@react-pdf/renderer` is server-only — declared in `serverComponentsExternalPackages` in `next.config.mjs`. The report route sets `export const maxDuration = 30` at the top of `src/app/api/report/route.ts` to handle slow PDF renders (`vercel.json` is otherwise empty). Four generators exist: `pdf-generator.ts` (property reports), `invoice-pdf.tsx` (tenant rent invoices), `owner-invoice-pdf.tsx` (owner fee invoices), `receipt-pdf.tsx` (paid-invoice receipts surfaced via the tenant portal).

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

**ExpenseCategory** (extended for property ops): `SERVICE_CHARGE, MANAGEMENT_FEE, WIFI, WATER, ELECTRICITY, CLEANER, CONSUMABLES, MAINTENANCE, REINSTATEMENT, CAPITAL, SECURITY, GARBAGE_COLLECTION, LANDSCAPING, PEST_CONTROL, POOL, GENERATOR, ELEVATOR, HVAC, GAS, INSURANCE, PROPERTY_TAX, LEGAL_FEES, LICENSE_PERMIT, MARKETING, BANK_CHARGES, STAFF_WAGES, OTHER`. The same list applies to `RecurringExpense.category` — when adding a category, update the enum + every hard-coded list (expenses page, recurring-expenses page + its POST/PATCH zod schemas, the import route/page `VALID_EXPENSE_CATEGORIES`, and `import-templates.ts`).

**Expense payment / outstanding-balance fields** (single-amount expenses; line items carry their own per-item payment + tax): `amountPaid` (Float, default 0), `dueDate`, `vatAmount` (net `amount` stays pre-VAT — VAT is tracked separately, never folded into `amount`), `paymentMethod` (`PaymentMethod` enum), `paymentReference`, `paymentDate`, `notes`. Payment **status + outstanding balance are derived, never stored** — use `calcExpensePayment(expense)` from `calculations.ts`, which sums line-item `amountPaid` when present, else uses expense-level `amountPaid`, returning `{ total, paid, outstanding, status: PAID|PARTIAL|UNPAID }`. The Expenses page surfaces a Balance + Due column, an overdue (past `dueDate`) banner, and the add/edit form's payment block; an expense with `dueDate < today` and a balance owing is "overdue".

## UI Conventions

- **Currency**: use `formatCurrency(amount, currency)` from `src/lib/currency.ts` — supports KES, USD, GBP, EUR, TZS, UGX, ZAR, AED, INR, CHF. `formatKSh()` is kept for backward compat (defaults to KES) — prefer `formatCurrency` for new code that receives a currency string
- **Colours**: `text-income` (green), `text-expense` (red), `text-gold` / `text-gold-dark` — defined in `tailwind.config.ts`
- **Fonts**: Inter for everything (`font-sans`, body default — never re-declare it). `font-display` (DM Serif Display) is the **logo wordmark only**; `font-mono` is a system stack for API keys/tokens/reference codes only — never money. See the Typography section below.
- **Badge variants**: `"green" | "red" | "amber" | "gray" | "gold" | "blue"` — no `"purple"` or `"yellow"`
- **CurrencyDisplay sizes**: `"sm" | "md" | "lg" | "xl"` — no `"base"`
- Pages use `<Header>` + `<div className="page-container">` shell from the dashboard layout
- Month filtering uses `<MonthPicker>` component which has built-in prev/next arrows — do not add outer arrow buttons. Clicking the month label opens a jump-to-month popover (year-paged 12-month grid + "Current month" shortcut); `max` disables future months in both the arrow and the grid.
- **Period exports** use `<ExportRangeDialog>` (`src/components/ui/ExportRangeDialog.tsx`) — presets (selected month / previous / YTD / last 12 months / all history) + custom from–to months. Wired on Expenses, Income (both refetch the range via the APIs' `from`/`to`/`limit` params — YYYY-MM-DD, cap 20 000) and Petty Cash (client-side slice; `exportPettyCash` in excel-export.ts renders a ledger XLSX with opening-balance row + running balance, APPROVED entries only move the balance).
- **Month state is shared across pages** via `useSharedMonth()` (`src/lib/use-shared-month.ts`, sessionStorage-backed) — Dashboard / Income / Expenses / Airbnb / Petty-cash all use it, so navigating between them keeps the working month. Use it (not a local `useState`) for any new month-scoped page.
- **Property scope**: `property-context.tsx` cold-loads to the **"All properties" portfolio view** for multi-property orgs (single-property orgs scope to their property so the SetupChecklist shows); the explicit "All" choice persists via a `__ALL__` sentinel. The context also exposes `mixedCurrencies` — true in portfolio scope when properties use different currencies (Header shows a "⚠ Mixed currencies" chip; totals are a raw cross-currency sum). The dashboard adds an "All properties" tab (combined rent + short-let tables with a Property column, `showProperty` prop on `RentStatusTable`/`AlbaRevenueTable`) ahead of the per-property tabs in portfolio mode.
- `ConfirmDialog` accepts `typeToConfirm="DELETE"` for catastrophic actions (used by the Expenses "Delete all" flow) — the confirm button stays disabled until the phrase is typed.
- `useCachedFetch` returns an `error` flag (last fetch failed; cached data stays visible) — surface a retry affordance like the dashboard's "Refresh failed — retry" chip instead of ignoring it.
- Vendor fields use `<VendorSelect>` (controlled: `value: string | null`, `onChange: (id: string | null) => void`) — never a plain text input for contractor/supplier fields
- **HelpTip**: `<HelpTip text="..." position="above|below" />` (`src/components/ui/HelpTip.tsx`) — small ℹ icon that shows a dark tooltip on hover. Default position is `"above"`; use `"below"` for elements near the top of the page (KPI cards, summary strips). Render inside label rows as `<span className="flex items-center gap-1.5"><span>Label</span><HelpTip text="..." /></span>`. The `Input`, `Select`, and `VendorSelect` components accept a `tooltip` prop that wires this up automatically.
- **Mobile table pattern**: pages with data tables use `md:hidden` stacked card list + `hidden md:block overflow-x-auto` desktop table. The `<main>` in `src/app/(dashboard)/layout.tsx` carries `overflow-x-hidden` to prevent any overflowing child from creating a page-level horizontal scroll (which shifts the fixed bottom nav). `MobileNav` bar items require `min-w-0` on each flex child and `truncate w-full` on each label `<span>` to prevent long labels pushing items off-screen on narrow devices.
- Components are organised under `src/components/` by feature: `dashboard/`, `expenses/`, `forecast/`, `guests/`, `income/`, `landing/` (marketing-page sections like MarketingHero / InboxMock / SpreadsheetComparison / Pricing — used by `(marketing)/page.tsx`), `layout/`, `petty-cash/`, `report/`, `settings/`, `tenants/`, `ui/`

### Typography

Single token scale, defined as `fontSize` tuples in `tailwind.config.ts` (size + line height + letter-spacing + default weight baked in). **Stock Tailwind sizes are removed from the theme** — `text-sm`, `text-2xl`, `text-[13px]` etc. do not compile; use only these 8 tokens:

`text-display` (48, marketing hero desktop) · `text-h1` (28, page titles + KPI values) · `text-h2` (20, card/section headings — also `.section-header`) · `text-h3` (16, sub-headings/modal titles) · `text-body-lg` (16/400, marketing paragraphs) · `text-body` (14, default UI text) · `text-caption` (12, meta/badges/helper) · `text-label` (11/500, uppercase micro-labels — pair with `uppercase`)

Rules (full doc: [docs/typography.md](docs/typography.md), specimen at `/dev/typography` in dev):
- **Three weights only: 400 / 500 / 600** (`font-normal` / `font-medium` / `font-semibold`). Never `font-bold` or lighter-than-400. Heading tokens bake 600 — don't add a weight to them.
- **Serif is logo-only**: `font-display` may appear only on the "Groundwork PM" wordmark (Sidebar, LandingNav, marketing footer, auth lockups — with `font-normal`, the face ships 400 only).
- **Mono is references-only**: `font-mono` (system stack, no webfont) for API keys, tokens, audit IDs, case refs, account numbers. Money is never mono — numeric columns and KPI values use Inter + `tabular-nums` (`CurrencyDisplay` applies it automatically).
- **No arbitrary font sizes, no `leading-*` / `tracking-*`** in normal use (spacing lives in the tokens; `leading-none` is grandfathered only in MobileNav labels, the Sidebar wordmark, and count badges). Charts use `CHART_FONT` from `src/lib/chart-style.ts` — the one sanctioned home for inline font sizes.
- PDF generators and email templates are exempt (own font registration / web-safe stacks).

### Document Storage

`TenantDocument` records are stored in the database; the actual files live in a Supabase Storage bucket called `tenant-documents`. The storage helper is `src/lib/supabase-storage.ts` — it lazy-initialises the Supabase client on first use so that builds succeed even when the env vars are absent.

API routes: `POST/GET /api/documents/[tenantId]` and `DELETE /api/documents/[tenantId]/[docId]`.

### Expense Receipts & Documents

`ExpenseDocument` rows (category `RECEIPT/INVOICE/QUOTE/CONTRACT/PHOTO/OTHER`, label = caption, `checksum` sha256 unique per `(expenseId, checksum)` for content-hash dedupe → 409, `uploadedByEmail/Name`) attach files to an `ExpenseEntry`; files live under `expenses/<expenseId>/` in the `tenant-documents` bucket. API: `GET/POST /api/expenses/[id]/documents` (multipart, one file per request, ≤10 MB, images JPG/PNG/HEIC/WebP + PDF + legacy Word docs; empty-MIME HEIC falls back to extension check), `DELETE .../documents/[docId]`; expense DELETE cleans storage best-effort.

UI (`src/components/expenses/`): `ExpenseDocumentUpload` is a multi-file queue uploader — drag-drop, browse (multiple), phone-camera capture (`capture="environment"`), blob previews, per-file caption + category, client-side compression (canvas re-encode to JPEG for >1.5 MB JPG/PNG/WebP, max 2200 px; HEIC passes through), per-file XHR progress bars, inline per-file errors with retry. Two modes: `expenseId` set → immediate upload; unset (Add Expense form) → files queue and the page calls `ref.uploadAllTo(newExpenseId)` after the expense POST succeeds. `ExpenseDocumentList` renders a thumbnail-card gallery (signed-URL previews, download, styled delete confirm) with a full-screen lightbox (arrow-key/chevron nav, PDF via iframe). Mounted in the row doc-panel (desktop table AND mobile cards), and in the Add/Edit expense form; the row paperclip badge falls back to `_count.documents` from the list API before docs are fetched.

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

### Bulk row importers (`/import` page)

The Data Import page (`src/app/(dashboard)/import/page.tsx`) hosts tabbed, row-based importers, each a `<ImportSection>` (download template → upload XLSX → client-side validate → POST rows). Templates come from `src/lib/import-templates.ts`; routes live under `src/app/api/import/<entity>/`. Tabs: tenants, rent-history, income, expenses, **recurring**, petty-cash, units, maintenance, vendors, handover.

Shared importer conventions (mirror these when adding/editing one):
- **`supportsUpsert`** prop renders an "Update existing records" toggle and sends `mode: "upsert"`; the route returns `{ imported, updated, skipped, errors }`. Without it, matches are skipped (create-only). Tenants, rent-history, **expenses, petty-cash, recurring** support upsert.
- **Match/dedupe key is a content fingerprint and MUST be property-scoped** (the cross-property collision bug: two properties with the same date/amount/etc. must not collide). Expenses: `date(day)+category+amount+property+description`. Petty-cash: `date+type+description+amount+property`. Recurring: `description+category+amount+property+frequency`. **Caveat:** a fingerprint upsert can only refresh *secondary* fields — changing any fingerprint field (amount/date/category/description) makes the row look new and creates a duplicate.
- **Stable-ID round-trip (expenses only, so far):** to let users edit *any* field without duplicating, the expenses template carries an optional **`ID`** column. `GET /api/import/expenses/export` downloads existing expenses pre-filled into the template (IDs populated); the `ImportSection` "Export existing" button (`onExportExisting` prop + `downloadRowsAsWorkbook` in import-templates.ts) drives this. In `mode: "upsert"` the route matches an `ID` to an accessible expense **before** the fingerprint and updates *every* field in place (`updatedIds` dedupes repeats; an unknown ID falls through to create with a warning). Replicate this pattern (ID column + export endpoint + ID-first match) for other importers that need true edit-and-resync.
- **Resolve names → ids in the route** (don't just accept them): `propertyName`→`propertyId` (case-insensitive), `vendorName`→`vendorId` (org-scoped active vendors), `unitNumber`→`unitId`. Unmatched names are **non-fatal** — the row imports unlinked with a warning pushed to `errors`. (Historical bug: a column existed in the template but the route ignored it — e.g. Vendor Name on expenses, Property Name on petty-cash — leaving rows unlinked. Always wire the column through.)
- **Performance:** pre-load existing rows + reference data once and match in memory; bulk `createMany` + chunked `update`s — never one query per row. Set `export const maxDuration = 60`. On DB failure return a real JSON error (`{ error, detail, hint }`) instead of letting it 500 into a generic "Network error".
- **Expenses importer** columns include the full payment block: `Amount Paid, Due Date, VAT Amount, Payment Method` (free-text "Mpesa"/"Cheque" normalised to the enum), `Payment Reference, Payment Date, Notes`.
- **Petty-cash importer** links `Property Name` and captures `Receipt Ref`.
- **Recurring-expenses importer** (`/api/import/recurring-expenses`) loads `RecurringExpense` templates (Description, Category, Amount, Scope, Frequency, Next Due Date, Property Name, Unit Number, Vendor Name, Active) so standing costs feed `buildForecast()` — frequency free-text is normalised to the enum.

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

**Recurring Expenses** — standing cost templates with frequency (`MONTHLY`, `QUARTERLY`, `BIANNUAL`, `ANNUAL`), `nextDueDate`, and optional `vendorId`. `POST /api/recurring-expenses/apply` (body: `{ year, month }`) materialises all due entries as real `ExpenseEntry` rows (carrying `vendorId`), advances `nextDueDate`, and **clears the `RECURRING_EXPENSE_DUE` inbox hint** for each applied item. API: `GET/POST /api/recurring-expenses`, `GET/PATCH/DELETE /api/recurring-expenses/[id]`; bulk import via `/api/import/recurring-expenses`. These feed the cash-flow forecast (`buildForecast`) and the `RECURRING_EXPENSE_DUE` smart-reminder.

**Standalone Maintenance Schedules** — property/unit-level (not asset-linked) recurring maintenance tasks. API: `GET/POST /api/maintenance/schedules`, `GET/PATCH/DELETE /api/maintenance/schedules/[scheduleId]`. Asset-linked schedules use a separate path: `/api/assets/[id]/schedules/[scheduleId]`. Auth: `requireAuth` for reads, `requireManager` for writes; 403 is returned if a non-manager tries to edit/delete an asset-linked schedule.

**Airbnb Guests** — `AirbnbGuest` records (independent of bookings) and `BookingGuest` join records that link guests to an `IncomeEntry`. API: `GET/POST /api/guests`, `GET/PATCH/DELETE /api/guests/[id]`, `GET/POST/DELETE /api/guests/[id]/documents`, `GET/POST /api/bookings/[entryId]/guests`, `DELETE /api/bookings/[entryId]/guests/[guestId]`.

**Agents** — commission-based letting agents. `Agent` model stores name, phone, email, and commission rate. `vendorId`-like FK on `IncomeEntry` (agent commissions deducted from net profit). API: `GET/POST /api/agents`, `GET/PATCH/DELETE /api/agents/[id]`.

**Compliance** — `GET /api/compliance` returns compliance status across insurance, lease renewals, and maintenance for accessible properties.

**RentHistory** — tracks rent escalations and adjustments over time, linked to `Tenant`. API: `GET/POST /api/tenants/[id]/rent-history`, `DELETE /api/tenants/[id]/rent-history?entryId=`.

**Communication Log** — per-tenant log of outbound emails (`CommunicationLog` model). Fields: `type` (`CommunicationType` enum: `EMAIL`), `subject`, `body?`, `templateUsed?`, `loggedByEmail`, `loggedByName?`, `sentAt`, `followUpDate?`, `followUpCompleted`. API: `GET/POST /api/tenants/[id]/communication-log`, `PATCH/DELETE /api/tenants/[id]/communication-log/[entryId]`. Exposed as a "Comms" tab on the tenant detail page (`src/components/tenants/CommunicationLogTab.tsx`). `EmailDraftModal` auto-logs a fire-and-forget POST when manager clicks "Open in mail app" or "Copy body" — requires `tenantId` prop.

**Tenant sub-routes** (not covered above):
- `POST /api/tenants/[id]/vacate` — marks tenant vacated, sets unit status to `VACANT`
- `POST /api/tenants/[id]/settle-deposit` — records deposit settlement with itemised deductions (`DepositSettlement` model)
- `GET /api/properties/[id]/reassign-preview?targetOrgId=` — dry-run org reassignment showing which users gain/lose membership (super-admin only)

**Owner Statement** — logic lives in `src/lib/owner-statement.ts` (`buildOwnerStatements(propertyIds, year, month)`), shared by `GET /api/report/owner-statement` (the `/report` OwnerDashboard), `GET /api/report/owner-statement/pdf?propertyId=&year=&month=` (per-property PDF via `src/lib/owner-statement-pdf.tsx`, also linked from each PropertyCard), and the `OWNER_MONTHLY_REPORT` cron automation (which emails the same PDF as an attachment — `sendNotificationEmail` accepts `attachments`).

**Compliance Certificates** — `ComplianceCertificate` model stores per-property compliance docs (types: free-text string, e.g. "Fire Safety", "Lift Inspection"). Status is computed at query time: `EXPIRED` (days < 0), `EXPIRING_SOON` (days ≤ 30), `VALID`, `ONGOING` (no `expiryDate`). API: `GET/POST /api/compliance/certificates`, `GET/PATCH/DELETE /api/compliance/certificates/[id]`. Page: `/compliance/certificates`.

**Arrears Cases** — `ArrearsCase` (per tenant, with stage `INFORMAL_REMINDER → FORMAL_NOTICE → DEMAND_LETTER → LEGAL_ACTION → SETTLED/CLOSED`) plus `ArrearsEscalation` history rows. API under `/api/arrears`. Page: `/arrears`.

**Tax Configuration** — `TaxConfiguration` model: per-org tax rules (label, rate, applicability) with optional per-property override. API: `/api/tax-configs`. Calculations live in `src/lib/tax-engine.ts`. Surfaced in invoice/income flows when applicable.

**Per-unit Management Fee Override** — `ManagementFeeConfig` model lets a unit deviate from the property-level fee (`ratePercent` or `flatAmount` with `effectiveFrom`). Read in `calculations.ts` ahead of the property defaults.

**Audit Logs** — `AuditLog` rows are written by `src/lib/audit.ts` and exposed at `GET /api/audit-logs` (requireManager, org-scoped; filters: `resource`, `resourceId`, `userId`). UI: `/settings/audit`, plus the record-level `HistoryDrawer` component (`src/components/ui/HistoryDrawer.tsx` — Clock button on expense rows shows per-record change history with field-level diffs).

**Agents (commissions)** — separate from `Vendor`. API: `GET/POST /api/agents`, `GET/PATCH/DELETE /api/agents/[id]`. Tied to `IncomeEntry.agentCommission`.

### Calendar

Combined property-event view. Page: `/calendar` — **manager-only** (in `managerOnlyPaths`). It was previously reachable by OWNER while every API behind it was `requireManager()`, which gave owners a shell that could never load. An owner-facing calendar needs owner-appropriate deep links first (events currently link to `/tenants`, `/invoices`, `/cases` etc., all manager-only).

**Relationship to the Inbox**: `/inbox` is the queue you work ("what do I do now"); `/calendar` is when things land. The calendar deliberately does **not** re-render the overdue queue — it reports the count, previews three, and links to `/inbox`, which owns the per-item actions. If you add overdue handling, add it there, not here.

**Aggregator**: `buildCalendarEvents(propertyIds, from, to)` in [src/lib/calendar-events.ts](src/lib/calendar-events.ts) — same shape as `buildInbox()`: one `Promise.all`, reads only, no request state. Every calendar surface goes through it, so the in-app view and the ICS feed can't drift. Twelve `EventType`s: `LEASE_EXPIRY`, `LEASE_START`, `RENT_DUE` (Invoice.dueDate, excludes DRAFT/CANCELLED), `MAINTENANCE_DUE` (recurring schedule), `MAINTENANCE_VISIT` (`MaintenanceJob.scheduledDate`, excludes DONE/CANCELLED), `INSURANCE_RENEWAL`, `COMPLIANCE_EXPIRY`, `RECURRING_EXPENSE`, `RENT_REMITTANCE`, `MGMT_FEE_INVOICE`, `APPROVAL_DEADLINE` (`ApprovalRequest.expiresAt`), `CASE_SLA` (computed via `computeCaseSlaDueDate`, filtered in memory since it isn't a column).

Each event carries a **stable `id` (`{TYPE}-{refId}`) that doubles as the ICS UID — never randomise it**, or every feed refresh duplicates entries instead of updating them. `isOverdue` marks past-dated events that are still open obligations; synthesised agreement dates (remittance / mgmt fee) are never overdue because completion can't be verified. `feedSummary` is the PII-minimal string for the feed; `title` (which may contain a tenant name) is in-app only. Deep links use the app-wide `?focus=<id>` convention (see [use-focus-scroll.ts](src/lib/use-focus-scroll.ts)) wherever the target list page supports it.

**Views**: Month (grid + side list), Week (7 all-day columns — no time axis, because every event is all-day), Agenda (list only). Choice persists in sessionStorage. Week view spans month boundaries, so it fetches an explicit `from`/`to` range rather than the month the grid happens to show.

**Empty state**: when a range returns zero events the route also returns `sources` — `getCalendarSourceStatus(propertyIds)`, seven counts naming which *configuration* sources hold no data (tenants, invoices, agreement, maintenance schedules, insurance, compliance, recurring). The UI lists the unconfigured ones with deep links, so "nothing is due" and "you never set this up" stop looking identical. Transactional sources (maintenance jobs, approvals, cases) are deliberately excluded — having none is normal. Note a configured `ManagementAgreement` synthesises remittance + mgmt-fee events in *every* month, so once one exists the calendar is rarely empty at all.

**Assignment**: `CalendarEvent.assigneeId` is populated only where an owner genuinely exists — `CASE_SLA` (thread assignee), `MAINTENANCE_VISIT` (via its linked case), `APPROVAL_DEADLINE` (the requesting manager). Leases, rent, insurance and compliance are property-scoped obligations with no assignee, so the "Assigned to me" filter legitimately hides them; its empty state says so rather than looking broken.

**Snooze**: `CalendarEventSnooze { userId, eventId, until }` (migration `20260730090000_calendar_event_snooze`) — per-user "not now", keyed on the stable `CalendarEvent.id`, which is another reason that id must never be randomised. `until` null = hidden until restored. Filtered in the page route only; the ICS feed intentionally ignores snoozes (a snooze is a UI-level "not now", not a statement that the obligation vanished). `?includeSnoozed=true` reveals them; `snoozedCount` drives the restore affordance.

**API**: `GET /api/calendar?year=&month=&propertyId=` or `?from=&to=` (YYYY-MM-DD, max 62 days, explicit range wins) returns `{ events, overdueEvents, overdueTotal, sources, snoozedCount }`. `POST/DELETE /api/calendar/snooze`. Overdue is a second aggregator call over a trailing 90-day window filtered to `isOverdue`, capped at 50 rows (`overdueTotal` reports the true count). The 90-day bound applies uniformly to every source.

**ICS feed** (subscribe-by-URL):
- `CalendarFeedToken { userId, token @unique, propertyIds[], label, lastAccessedAt, revokedAt }` — migration `20260729180000_calendar_feed_token`. **Deliberately has no expiry column**: a silently-expiring subscription is worse than none. Revoke + rotate explicitly.
- `validateCalendarFeedToken(token)` in [calendar-feed-auth.ts](src/lib/calendar-feed-auth.ts) mirrors `portal-auth.ts`. Scope is resolved **live** on every fetch via `getAccessiblePropertyIdsForUser(userId)`, so losing PropertyAccess narrows an existing feed; `propertyIds` is intersected with live access and can never widen it.
- `getAccessiblePropertyIds()` is now a thin session wrapper over the shared `resolveAccessiblePropertyIds()`; use `getAccessiblePropertyIdsForUser(userId)` for any surface that authenticates with its own token instead of a session.
- `GET /api/calendar/feed/[token]` — public (middleware's matcher excludes `/api` wholesale, so **no allow-list entry is needed or possible for API paths**; the `/api/*` entries in `isPublicPage` are vestigial). Fixed rolling `now−90d…now+365d` window, query params ignored. Headers: `text/calendar; charset=utf-8`, `Cache-Control: private, max-age=1800` (never `public` — the token is in the URL), `X-Robots-Tag: noindex`. Rate-limited 60/IP/hour. Revocation is server-side immediate, but subscribers may serve from their own HTTP cache for up to 30 min.
- `GET /api/calendar/export` — same aggregator + serializer, session auth, attachment disposition. Snapshot, not a subscription.
- Management: `GET/POST /api/calendar-feeds`, `DELETE /api/calendar-feeds/[id]` (soft-revoke, `logAudit` with the token redacted to last 4). UI: `/settings/calendar`.

**`src/lib/ics.ts`** is a hand-rolled RFC 5545 serializer (no dependency). If you touch it, keep: CRLF endings, **75-octet** folding measured in UTF-8 bytes (not characters — otherwise multi-byte chars corrupt at the fold), TEXT escaping for `\ ; ,` and newlines, `DTSTAMP` on every VEVENT, all-day `DTSTART;VALUE=DATE` with an **exclusive** `DTEND` (+1 day), and unescaped `URL` values. Covered by [src/lib/__tests__/ics.test.ts](src/lib/__tests__/ics.test.ts) — extend it rather than eyeballing output.

### Cases (cross-cutting workflow)

A **Case** is a unified workspace per operational issue: status + timeline + comments + attachments in one place. The schema sits *on top of* existing entities — it doesn't replace them.

- `CaseThread` carries the workflow state: `caseType` (`MAINTENANCE | LEASE_RENEWAL | ARREARS | COMPLIANCE | GENERAL`), `subjectId` (id of the underlying record, e.g. `MaintenanceJob.id`), `status` (`OPEN | IN_PROGRESS | AWAITING_APPROVAL | AWAITING_VENDOR | AWAITING_TENANT | RESOLVED | CLOSED`), `stage` (free text), `waitingOn` (`MANAGER | OWNER | TENANT | VENDOR | NONE`), `assignedToUserId`, `lastActivityAt`, `stageStartedAt` (SLA anchor).
- `CaseEvent` is the unified timeline. `kind` ∈ `COMMENT | STATUS_CHANGE | STAGE_CHANGE | ASSIGNMENT | EMAIL_SENT | DOCUMENT_ADDED | VENDOR_ASSIGNED | APPROVAL_REQUESTED | APPROVAL_GRANTED | APPROVAL_REJECTED | EXTERNAL_UPDATE`. Stores actor, `body`, `meta` (JSON), `attachmentUrls` (Supabase Storage paths in the `case-attachments` bucket).

**Phase 1 only backs `caseType = MAINTENANCE`.** `MaintenanceJob.caseThreadId` is the back-link. `POST /api/maintenance` auto-creates a CaseThread + initial `COMMENT` event. `PATCH /api/maintenance/[id]` mirrors status / vendor / priority changes onto the linked thread (status remapped via `mapMaintenanceStatusToCase` in `src/lib/cases.ts`).

**Status mapping (maintenance → case)**: `OPEN→OPEN`, `IN_PROGRESS→IN_PROGRESS`, `AWAITING_PARTS→AWAITING_VENDOR`, `DONE→RESOLVED`, `CANCELLED→CLOSED`. WaitingOn at backfill: `OPEN → MANAGER`, `IN_PROGRESS` (no vendor) → `MANAGER`, `IN_PROGRESS` (with vendor) / `AWAITING_PARTS` → `VENDOR`, `DONE`/`CANCELLED` → `NONE`.

**API** (all under `src/app/api/cases/`):
- `GET /api/cases` — filters: `status`, `propertyId`, `waitingOn`, `caseType`, `assignedToMe=true`
- `POST /api/cases` — manual creation (rarely used; cases are usually auto-created)
- `GET /api/cases/[id]` — case with events ordered ASC + signed attachment URLs
- `PATCH /api/cases/[id]` — status/stage/waitingOn/assignment changes mint corresponding CaseEvents in one array-form transaction
- `POST /api/cases/[id]/events` — comments + multipart attachments (uploaded via `uploadCaseAttachment` in `src/lib/supabase-storage.ts`)

All writes use `requireManager()` + `requirePropertyAccess(case.propertyId)` and call `logAudit({ resource: "CaseThread" | "CaseEvent", ... })`.

**Backfill**: `npm run cases:backfill` (scripts/backfill-cases.ts) — idempotent, creates a CaseThread for every `MaintenanceJob` lacking `caseThreadId`. Sets `stageStartedAt = job.updatedAt` so SLA clocks don't immediately flag every backfilled case as breached.

**Time formatting**: Case timeline + list use `formatRelative` / `formatRelativeWithTooltip` from `src/lib/relative-time.ts` ("5m ago" / "2h ago" / "3d ago" up to 7 days, then explicit date). The rest of the app keeps the existing explicit `formatDate` convention — do not touch financial / audit / invoice dates.

**View duality**: `/maintenance` is the domain-specific view; `/cases` is the cross-cutting workflow view. **They co-exist indefinitely.** A dismissible banner on `/maintenance` (`localStorage` key `cases-banner-dismissed`) deep-links to `/cases?caseType=MAINTENANCE`; each JobCard shows an "Open case →" link when `caseThreadId` is set. From the case detail page (`caseType=MAINTENANCE`) a "View as maintenance job →" link returns to the maintenance view.

**Supabase storage**: requires a `case-attachments` bucket — must be created manually in Supabase Studio for both dev and prod (private bucket, signed URLs only).

**Communication is dual-written into the timeline.** When a `CaseThread` is linked, `sendAndLog()` writes both an `EmailLog` (with `caseThreadId`) *and* a `CaseEvent` of kind `EMAIL_SENT` (snippet = subject + first 200 chars of stripped body). The same is true for `POST /api/tenants/[id]/communication-log`: pass `caseThreadId` to dual-write into the case timeline. `sendNotificationEmail`'s `meta` arg now accepts `caseThreadId`, so cron-driven notifications (lease expiry, overdue invoice, urgent maintenance, compliance, insurance) automatically land on the case timeline when a linked thread exists. Vendor emails (`VendorEmailModal`) skip `CommunicationLog` (tenant-only) but still write `EmailLog` + a `CaseEvent` (via the `/api/cases/[id]/events` COMMENT path with an embedded snippet).

### In-case approvals

Replaces ad-hoc WhatsApp owner sign-offs. `POST /api/cases/[id]/approvals` (manager-only) creates an `ApprovalRequest` row (UUID `token`, default 72h / max 168h `expiresAt`), emits an `APPROVAL_REQUESTED` `CaseEvent`, sets the thread's `waitingOn = OWNER`, and emails the approver a magic-link `${origin}/approve/${token}` via `sendNotificationEmail`.

- **`/approve/[token]` page** is public (no auth — middleware allow-list, alongside `/portal/*`). The page renders via `GET /api/approvals/[token]` which is **idempotent** so email link-preview scanners don't consume the token. The approver types their name (captured as `respondedByName`) before clicking Approve / Reject. `POST /api/approvals/[token]` records the decision, emits `APPROVAL_GRANTED` / `APPROVAL_REJECTED`, sets `waitingOn = NONE`, and sends a confirmation email back to the approver with a "This wasn't me" link that POSTs `action: "DISPUTE"` → `status = DISPUTED`, restores `waitingOn = MANAGER`, notifies the requesting manager.
- The response endpoint is rate-limited (20 reqs / IP / hour, in-memory via [src/lib/rate-limit.ts](src/lib/rate-limit.ts)). Tokens are UUIDs (effectively unguessable); rate limit is defense-in-depth.
- Auth helper [src/lib/approval-auth.ts](src/lib/approval-auth.ts) mirrors [src/lib/portal-auth.ts](src/lib/portal-auth.ts). Tokens are redacted to last 4 chars in audit logs (`redactToken()`).
- The Operational Inbox shows `APPROVAL_PENDING` items for pending requests older than 24h (severity escalates to URGENT after 3 days).
- Statuses: `PENDING → APPROVED | REJECTED | EXPIRED`; `APPROVED | REJECTED → DISPUTED` (one-way). Once not PENDING, the token is dead for further APPROVE/REJECT but still accepts `DISPUTE` once.

### Case workflows + stages

Each `caseType` maps to an ordered workflow defined in [src/lib/case-workflows.ts](src/lib/case-workflows.ts). The source of truth on a case is `currentStageIndex` (Int) — `stage` (String?) is the rendered label and is recomputed on every advance / regress. `workflowKey` (e.g. `MAINTENANCE_V1`) namespaces stage keys so workflows can be revised without colliding with the legacy `Tenant.renewalStage` enum (which remains tenant-scoped).

Stage transitions:
- `POST /api/cases/[id]/advance` (manager) — `{ to?: number, toKey?: string, note?: string }`. Must be forward-only. Emits `STAGE_CHANGE`, sets `stageStartedAt = now`, recomputes `waitingOn` from the new stage's `requiresAction`, and clears any `SLA_BREACH` hint for the case.
- `POST /api/cases/[id]/regress` (manager) — `{ reason: string }`. One step back, reason mandatory. Same transaction shape.
- `POST /api/cases/[id]/sla` (manager) — `{ stageSlaHours?: Record<string, number | null> }` OR `{ slaHours?: number }` (legacy single value applied to the current stage).
- `POST /api/cases/[id]/link-invoice` (manager) — sets `Invoice.caseThreadId` so subsequent `PAID` flips trigger the `MAINTENANCE.invoiced` auto-advance.

Auto-advance triggers (best-effort, fired *after* the parent transaction commits, never throws — see `tryAutoAdvance` in case-workflows.ts):
- Vendor assigned at `MAINTENANCE.triaged` → `quote_requested`
- Approval granted at `MAINTENANCE.approval_requested` → `approved`
- Maintenance status `DONE` → `MAINTENANCE.completed`; `CANCELLED` → `closed`
- Invoice `PAID` (only when `Invoice.caseThreadId` is set) → `MAINTENANCE.invoiced`

Auto-advance fires only on records that carry an explicit `caseThreadId` link — no heuristic inference. `Invoice.caseThreadId` is the new column added in this phase; existing rent invoices have it null and don't trigger auto-advance. Use the **Link invoice** button on the Case detail page to retroactively attach.

### Case SLAs (per-stage)

Per-stage SLAs live in `CaseThread.stageSlaHours` (JSON map of `stageKey → hours`). Defaults come from `case-workflows.ts`; MAINTENANCE cases override `triaged` and `quote_requested` with `ManagementAgreement.kpiEmergencyResponseHrs` / `kpiStandardResponseHrs` depending on the job's `isEmergency`.

**Pause logic**: when `waitingOn` flips to `OWNER` / `TENANT` / `VENDOR`, the SLA clock is paused (`lastWaitingPauseAt = now`); on return to `MANAGER` / `NONE` the paused duration accumulates into `waitingPausedSeconds`. The cron's `checkCaseSlaBreaches` computes `elapsed = (now - stageStartedAt - waitingPausedSeconds*1000)` against `stageSlaHours[currentStageKey]` and emits a `SLA_BREACH` `ActionableHint` (`WARNING`, escalating to `URGENT` after 2× the budget). The hint clears automatically when the case advances.

Backfill: `npm run cases:backfill-stages` populates `workflowKey` + `stageSlaHours` (idempotent). `npm run cases:backfill-invoice-links --dry-run` reports linkable invoice-to-case candidates.

### Status ↔ Stage coupling (terminal reasons)

`CaseThread.status` and `CaseThread.currentStageIndex` are coupled at terminal points but distinguish "workflow completed" from "workflow bypassed":

- **Status → stage**: flipping `status` to `RESOLVED` / `CLOSED` does **not** mutate `currentStageIndex` (historical record preserved). Instead the PATCH route sets `terminalReason`:
  - `currentStageIndex >= workflow.naturalCompletionIndex` → `COMPLETED_NORMALLY`
  - otherwise → `BYPASSED` and records `bypassedAtStage = <current stage key>`
  - Each workflow declares its own `naturalCompletionIndex` in [src/lib/case-workflows.ts](src/lib/case-workflows.ts) (MAINTENANCE=8 / "completed", LEASE_RENEWAL=6 / "documents_signed", ARREARS=3 / "legal_action", COMPLIANCE=4 / "certificate_received", GENERAL=1 / "in_progress").
- **Stage → status**: advancing to a stage with `terminalStatus` (e.g. `MAINTENANCE.closed`) snaps `status` to that value AND sets `terminalReason=COMPLETED_NORMALLY`.
- **Regress** out of a terminal stage clears `terminalReason` + `bypassedAtStage` and sets `status=IN_PROGRESS`.

The `StageTracker` UI renders BYPASSED cases with an amber "Bypassed at: *[stage]*" banner; stages past the bypass point appear faded with a dashed border + strikethrough label. The right-panel Stage display shows "Bypassed (was at: *[stage]*)" instead of the workflow label.

`enum CaseTerminalReason { COMPLETED_NORMALLY, BYPASSED, CANCELLED }` — `CANCELLED` is reserved for explicit cancellation (different from passive bypass); the current PATCH path always emits `BYPASSED` for non-natural terminals, but the visual + bookkeeping treats both the same way.

Backfill: `npm run cases:backfill-terminal-reasons` populates `terminalReason` for existing terminal cases without mutating `currentStageIndex`. Idempotent (skips rows where `terminalReason IS NOT NULL`). Writes a per-run report to `scripts/backfill-output-<timestamp>.md`.

### Automations (toggleable workflows + alert/reminder gating)

`/automations` (`src/app/(dashboard)/automations/page.tsx`, manager-only) is the single control surface for **everything the app does automatically on the daily cron** — workflow automations that open Cases, the email alerts managers receive, and the proactive Inbox reminders. It is **not** a custom workflow builder; it's a fixed registry of predefined templates an org can toggle on/off.

**Registry** — `src/lib/automation-registry.ts` is the single source of truth (`AUTOMATION_DEFS`). Three `AutomationCategory` values:
- `WORKFLOW` (default **off**, opt-in) — auto-creates a `CaseThread` when the condition fires: `LEASE_RENEWAL_90D`, `ARREARS_7D`, `COMPLIANCE_30D`, `INSURANCE_30D` (→ COMPLIANCE workflow; there is no INSURANCE case type), `URGENT_MAINTENANCE` (assigns a manager + starts SLA on the already-auto-created maintenance case). Plus `AUTO_INVOICE_GENERATION` (no case): each cron run generates the current month's rent invoices as DRAFT via the shared `generateInvoicesForTenants` (`src/lib/invoice-generation.ts`, also used by `POST /api/invoices/bulk`), emails each PDF via `emailInvoiceToTenant` (`src/lib/invoice-email.ts`, shared with `POST /api/invoices/[id]/send`) which flips DRAFT→SENT only on successful send, then emails managers a per-property summary. Idempotent per `(tenantId, YYYY-MM)` via the `AutomationExecution` ledger — a deleted auto-invoice is NOT re-created; tenants without an email keep a DRAFT for manual delivery.
- `NOTIFICATION` (default **on**) — the 5 long-standing manager email alerts (lease/invoice/compliance/insurance/urgent-maintenance). Toggling off silences that email org-wide. Plus `OWNER_MONTHLY_REPORT` (default **off**, opt-in): emails the property owner a previous-month income/expense statement on the agreement's `rentRemittanceDay` (clamped 1–28; falls back to property managers when no owner user is linked). Checker: `checkOwnerMonthlyReports` in checkers.ts, deduped per `propertyId:period` via `NotificationLog` (`OWNER_MONTHLY_REPORT` NotificationType).
- `REMINDER` (default **on**) — the 6 hint-only Inbox nudges (vacant unit, deposit unsettled, recurring-expense due, low petty cash, negative cashflow, case SLA breach).

**Models** (all additive; see migrations `20260531120000_add_automations`, `20260601120000_automation_property_overrides`, `20260601140000_notification_preferences`):
- `AutomationTemplate (organizationId, key, enabled, …)` — per-org toggle, unique on `(organizationId, key)`. Self-seeds lazily via `ensureAutomationTemplates(orgId)` (called from the GET route and the cron), so no data migration is needed for existing orgs.
- `AutomationExecution (automationKey, subjectId)` — write-once dedup ledger, unique on `(automationKey, subjectId)`. Workflow automations also guard against an already-open case of the same `(caseType, subjectId)`.
- `AutomationPropertyOverride (automationKey, propertyId, enabled)` — optional per-property override; **wins over the org toggle** when present, absence = inherit. Unique on `(automationKey, propertyId)`.
- `NotificationPreference (userId, category, emailEnabled)` — per-user email opt-out, sparse (row exists only when changed), unique on `(userId, category)`. Categories `NOTIFICATION` | `WORKFLOW` only (reminders are never emailed). Default = opted-in.

**The gate** — `isAutomationEnabled(orgId, key, propertyId?)` checks a per-property override first, then the org toggle, falling back to the registry `defaultEnabled`. `wantsEmail(userId, category)` checks the user's preference (default true; `userId === null` = the org-email fallback recipient, always receives). Both use a per-run cache cleared by `resetAutomationCache()` at the **top of every cron run** so a warm serverless instance never serves a stale toggle. The 11 cron checkers each early-exit per item via `isAutomationEnabled(orgId, "<KEY>", propertyId)`; the two per-recipient send loops (`sendToManagers` in checkers.ts → NOTIFICATION; the workflow case-email loops in `src/lib/automations.ts` → WORKFLOW) skip recipients who opted out.

**Engine** — `runAutomations()` in `src/lib/automations.ts` is added to the cron's `Promise.allSettled([...])` (surfaced as `automations` in the summary). For each active org it runs a workflow when the org toggle is on **or any property override enables it**, then `createCaseFromAutomation()` re-checks per property, dedupes, creates the `CaseThread` + initial `CaseEvent` (`actorName: "system"`), records the `AutomationExecution`, notifies managers, and `logAudit`s (`userId: "system"` — `AuditLog.userId` is a plain string, not a FK).

**Recipients** — `getPropertyManagers(propertyId, orgId)` returns `{ userId, email, name }[]` = org-admins + managers with `PropertyAccess`, **falling back to the org's contact email** (`Organization.email`, `userId: null`) when no manager is found, so alerts are never silently dropped. `GET /api/automations` also resolves and returns the per-property recipient list for the UI's "Notifies N recipients" / "no recipients" display.

**API**: `GET /api/automations` (templates + display metadata + org properties + overrides + resolved recipients), `PATCH /api/automations/[id]` (org toggle), `PUT /api/automations/[id]/overrides` (`{ propertyId, enabled }`; `enabled: null` clears → inherit; guarded by `requirePropertyAccess`), `GET`/`PUT /api/notification-preferences` (self-only).

**UI**: the `/automations` page groups cards into Workflow / Email notifications / Smart reminders, with a **grid/table view toggle** (persisted to `localStorage`), a "Customise per property" expander (Inherit/On/Off segmented control per property), and per-automation recipient lines. Per-user email opt-outs live on a **dedicated `/settings/notifications` page** (`NotificationPrefsPanel`, in the Settings sidebar group + mobile nav) — *not* a tab inside General settings.

**Adding a new automation**: add a def to `AUTOMATION_DEFS`; for a NOTIFICATION/REMINDER, gate the matching checker with `isAutomationEnabled`; for a WORKFLOW, add a handler in `automations.ts` + wire it into `HANDLERS`/`runAutomations`.

### Smart Reminders (ActionableHints)

The cron at `GET /api/cron/notifications` does two things per run: (1) sends emails through the existing dedup-gated path (`NotificationLog`), and (2) **upserts an `ActionableHint` row** keyed by `(hintType, refId)` so the cron is fully idempotent and the same hint surfaces every run until the underlying condition clears. **Every checker is gated by an Automations toggle** (see the Automations section) — disabling a notification/reminder for an org (or a specific property) makes the corresponding checker skip it.

**HintTypes** (`HintType` enum):
- Existing email-paired: `INVOICE_OVERDUE`, `LEASE_EXPIRY_30D`, `LEASE_EXPIRY_7D`, `URGENT_OPEN_4H`, `COMPLIANCE_EXPIRY_*`, `INSURANCE_EXPIRY_*`
- New hint-only: `VACANT_OVER_30D`, `DEPOSIT_NOT_SETTLED`, `RECURRING_EXPENSE_DUE`, `LOW_PETTY_CASH`, `NEGATIVE_CASHFLOW_FORECAST`, `SLA_BREACH` (and reserved: `RENT_INCREASE_DUE`, `INSPECTION_OVERDUE`)

**Status transitions**: `ACTIVE → ACTED_ON | DISMISSED | EXPIRED`. Dismissed hints auto-expire after 30 days (the cron itself runs the cleanup).

**Auto-clearing**: when the underlying record changes such that the condition no longer applies, the relevant route calls `clearHints(refId, hintType?)` from [src/lib/hints.ts](src/lib/hints.ts) (flips matching ACTIVE hints to `ACTED_ON`). Currently wired:
- `PATCH /api/invoices/[id]` (PAID/CANCELLED) → clears `INVOICE_OVERDUE`
- `PATCH /api/tenants/[id]/renewal` (RENEWED) → clears both `LEASE_EXPIRY_*`
- `PATCH /api/maintenance/[id]` (status != OPEN) → clears `URGENT_OPEN_4H`
- `POST /api/recurring-expenses/apply` → clears `RECURRING_EXPENSE_DUE` for each applied item

Two checkers also **self-clear inside the cron** (no mutation route resolves them): `checkRecurringExpensesDue` deactivates any ACTIVE `RECURRING_EXPENSE_DUE` whose recurring expense is no longer due (applied/paused/deleted/date-advanced), and `checkNegativeCashflowForecast` deactivates `NEGATIVE_CASHFLOW_FORECAST` for properties no longer forecast-negative — both via an `updateMany(... refId notIn <currently-firing set>)` sweep at the end of the checker.

Adding a checker that should auto-clear means: (a) `upsertHint` in the checker, and (b) either call `clearHints(refId, hintType)` from the route that resolves the condition, or add a `notIn` sweep in the checker when there is no such route.

**Operational Inbox integration**: `buildInbox()` merges `ActionableHint(status=ACTIVE)` rows alongside computed inbox items, de-duplicating where `(InboxType, refId)` collide (the hint wins, since it carries the suggested action). Each hint-sourced row shows a small "✨ Suggested" badge plus per-user Dismiss / Snooze (1h / 1d / 1w) controls. Snoozes live in `HintSnooze (hintId, userId, until)` and the inbox API filters them out for the current user.

**Hint UI controls**:
- `POST /api/hints/[id]/dismiss` — sets `DISMISSED` for everyone (manager-level decision)
- `POST /api/hints/[id]/snooze` body `{ until: "1h" | "1d" | "1w" | <iso-date> }` — per-user only
- `POST /api/hints/[id]/act` — optimistic flip to `ACTED_ON` after the client fires the underlying action endpoint
- `GET /api/hints` — list ACTIVE hints scoped to accessible properties; super-admin sees everything (with `?includeAllStatuses=true`)

**Super-admin debug page**: `/admin/hints` lists raw hint rows with status/severity filters.

**Idempotency contract**: never seed an ActionableHint with a non-deterministic `refId`. The `(hintType, refId)` pair is the upsert key. The recurring-expense checker uses `recurringExpense.id`; the maintenance-job checker uses `job.id`; the petty-cash checker uses `property.id`; etc.

### Move-In Checklist / Unit Condition Report

Page: `/units/[id]/condition-report/new` — a mobile-optimised stepper that walks the manager room-by-room through a structured grid (Perfect / Good / Fair / Poor) with inline photo capture (`<input type="file" capture="environment">` opens the rear camera on phone). Default rooms/features come from `src/lib/condition-report-template.ts` and can be edited inline.

Models:
- **`ConditionReport`** — unit + property + optional tenant. `reportType` is `MOVE_IN | MID_TERM | MOVE_OUT`. `items` is a JSON array with shape `{ id, room, feature, status, notes, photoIds[] }` — **identical** to what move-out reports will use, so a future diff helper can match by `(room, feature)`. Auto-vault stores `tenantDocumentId` once finalized.
- **`ConditionReportPhoto`** — one row per uploaded photo, points at a path inside the existing `tenant-documents` Supabase bucket under the prefix `condition-reports/<reportId>/...`.

This is **separate** from `BuildingConditionReport` (property-level annual inspection) — incompatible items shapes, different audience.

API (manager-only):
- `GET/POST /api/units/[id]/condition-reports` — list / create draft.
- `GET/PATCH/DELETE /api/condition-reports/[id]` — read / update / discard a draft (read-only once `tenantDocumentId` is set).
- `POST /api/condition-reports/[id]/photos` — multipart image upload (max 8 MB; jpeg/png/webp/heic). Returns `{ id, url }`. Photo uploads are fire-and-forget on the client; finalize is gated until all are done.
- `DELETE /api/condition-reports/[id]/photos/[photoId]`.
- `POST /api/condition-reports/[id]/finalize` — generates the PDF, uploads it to `tenants/<tenantId>/...` in the same Supabase bucket, creates a `TenantDocument` with `category=CONDITION_REPORT`, sets `tenantDocumentId` + `pdfGeneratedAt`. `MOVE_IN` / `MOVE_OUT` require a tenant; `MID_TERM` is allowed without one (no vault step). Idempotent — re-finalize returns 409.
- `GET /api/condition-reports/[id]/pdf` — preview / re-download (`maxDuration = 60`).

PDF: `src/lib/move-in-report-pdf.tsx` (`generateConditionReportPdf()`) — server-only `@react-pdf/renderer` document. Page 1 is the items table grouped by room with coloured status pills + signature blocks; page 2 onward is a Photo Appendix where each image is captioned `Room — Feature`. Photos are fetched via `getSignedUrl()` (1h) and embedded by URL.

`DocumentCategory` enum gained a `CONDITION_REPORT` value so vaulted reports show up cleanly on the tenant's Documents tab.

### Tenant Checkout / Move-Out Workflow

Replaces the paper "Tenant Check-Out Form". Page: `/tenants/[id]/checkout` (full-page form mirroring the 9-section PDF — condition report, rent balance, itemised deductions, keys returned, utility transfers, refund instructions, notes — plus a sticky live-settlement box).

Models:
- **`CheckoutProcess`** — one per tenant (`tenantId @unique`). Lifecycle via `CheckoutStatus` enum (`IN_PROGRESS → COMPLETED | DISPUTED`). Stores damage flags, rent balance, snapshot of `originalDeposit` / `totalDeductions` / `balanceToRefund`, `keysReturned` JSON, `utilityTransfers` JSON, `refundMethod` (`RefundMethod` enum), `refundDetails` JSON, `expenseEntryId` backref.
- **`CheckoutDeduction`** — itemised line items keyed to `CheckoutProcess` (cascade), categorised by `CheckoutDeductionCategory`.

API routes (manager-only, scoped via accessible properties):
- `GET  /api/tenants/[id]/checkout` — prefill: tenant, unit, property, deposit, computed outstanding invoice balance (sum of unpaid `Invoice` rows), existing `CheckoutProcess` if any.
- `POST /api/tenants/[id]/checkout` — upserts an `IN_PROGRESS` process; replaces deductions atomically.
- `POST /api/tenants/[id]/checkout/finalize` — atomic close-out: marks process `COMPLETED`, optionally creates an `ExpenseEntry` (category `REINSTATEMENT`, scope `UNIT`) when `damageFound && damageKeptByLandlord`, mirrors a `DepositSettlement` row for legacy reporting (skipped if one exists), sets `Tenant.isActive = false` + `vacatedDate`, sets `Unit.status = VACANT` + `vacantSince`. Two `AuditLog` entries (Tenant, CheckoutProcess) written after the transaction.
- `GET  /api/checkouts/[id]/pdf` — serves the signature PDF (`maxDuration = 30`); sets `pdfGeneratedAt` on first hit.

PDF generator: `src/lib/checkout-pdf.tsx` (`generateCheckoutPdf()`) — server-only `@react-pdf/renderer` document mirroring the 9-section form with dual signature blocks. Currency via `formatCurrency` using the property's currency.

The "Checkout" button lives in the tenant detail header. Once finalized the checkout page renders read-only with a "Download PDF" link.

### Email Logging & Super-admin Composer

Every email the app sends goes through `sendAndLog()` in `src/lib/email.ts`, which writes an `EmailLog` row (kind, from/to, subject, full body, `resendId`, `status`, `errorMessage`, optional `organizationId` / `userId` / `inReplyToId`). `EmailKind` covers: `PASSWORD_RESET`, `ORG_INVITATION`, `CONTACT_FORM`, `CONTACT_AUTOREPLY`, `NEW_USER_ALERT`, `WELCOME`, `NOTIFICATION`, `MANUAL`.

Super-admin only:
- Page: `/admin/emails` (`src/app/(dashboard)/admin/emails/page.tsx`) — browses the log with filters, opens detail in a sandboxed iframe, and exposes Reply / Forward / New email via `EmailComposer` (`src/components/admin/EmailComposer.tsx`)
- API: `GET /api/admin/emails` (list, paginated by `cursor`), `GET /api/admin/emails/[id]` (detail with `replies` + `inReplyTo`), `POST /api/admin/emails` (manual send, kind `MANUAL`, links via `inReplyToId`)
- Sidebar nav link added in `src/components/layout/Sidebar.tsx` next to "Organisations"
- Validation: `manualEmailSchema` in `src/lib/validations.ts`

Inbound replies are NOT handled — Resend Inbound (MX + webhook) is not configured. Replies sent from the composer go out via Resend; recipient replies go to whatever address is set in `Reply-To` (default `support@groundworkpm.com`).

### Billing (Paddle + Stripe)

`pricingTier` on `Organization` (`TRIAL → STARTER → GROWTH → PRO`, see `PricingTier` enum) drives capacity gating. Billing helpers:
- `src/lib/paddle.ts` — price-id → tier mapping, `PROPERTY_LIMITS` + `TEAM_LIMITS` per tier
- `src/lib/stripe.ts` — lazy Stripe SDK singleton
- `src/lib/subscription.ts` — gating helpers (`canAddProperty`, `canAddUser`, `requireActiveSubscription`, trial state)

Routes:
- `POST /api/webhooks/paddle` — Paddle subscription events (idempotent via `paddleEventId`)
- `POST /api/billing/cancel` — initiates cancellation
- `GET /api/stripe/status` — returns Stripe subscription state
- Pages: `/billing`, `/upgrade`

### Pricing & gating (capacity only)

There are **only three capacity gates** in the codebase, plus a subscription-state write-lock:

| Gate | Cap | Enforcement |
|---|---|---|
| Property count | TRIAL=2 · STARTER=2 · GROWTH=10 · PRO=∞ | `PROPERTY_LIMITS` in paddle.ts → `canAddProperty()` → POST /api/properties |
| Team-member count (ADMIN/MANAGER/ACCOUNTANT/OWNER) | TRIAL=1 · STARTER=1 · GROWTH=10 · PRO=∞ | `TEAM_LIMITS` in paddle.ts → `canAddUser(orgId, role)` → POST /api/users, POST /api/invitations, invite accept/approve |
| Caretaker seats (CARETAKER) | TRIAL=2 · STARTER=2 · GROWTH=10 · PRO=∞ | `CARETAKER_LIMITS` in paddle.ts → same `canAddUser(orgId, "CARETAKER")` pool split |
| Write-lock | trial-expired / cancelled / expired / past-due → HTTP 402 | `require*Write()` helpers (auth-utils) / `requireActiveSubscription()` on every mutating route |

**There is no per-feature gating.** Every other capability — Airbnb tracking, tax rules, cashflow forecast, asset register, insurance, compliance, audit log, multi-org, etc. — is universally available to any active org regardless of tier. This is intentional and is the foundation of the `/pricing` page's "Why no feature gates?" positioning. Marketing copy on `/pricing` MUST reflect this rule until any per-feature gate is added in code — do not advertise gates that don't exist. See [docs/pricing-gating-roadmap.md](docs/pricing-gating-roadmap.md) for the candidate list of features that could plausibly be gated in future.

When adding a new gate: mirror the existing two — cap map in paddle.ts, helper in subscription.ts, guard at the API route returning HTTP 402 with a `code` field, then update `/pricing/page.tsx` to surface the new gate as a real tier-differentiated matrix row.

### Web Analytics

`@vercel/analytics` is mounted in `src/app/layout.tsx` (`<Analytics />` next to `<Toaster />`). Page-view tracking activates once Web Analytics is enabled in the Vercel project dashboard; nothing fires locally.

### Tenant Portal

Token-based **self-service** portal for tenants — no login required, shareable link. Lives in the `(portal)` route group (`src/app/(portal)/portal/[token]/page.tsx`). Tenant submissions are limited to messages, maintenance requests, and proof-of-payment evidence; no portal route mutates `Invoice.status` or financial records directly.

- `portalToken` (UUID, unique) and `portalTokenExpiresAt` fields on `Tenant` model
- Middleware allows `/portal/*` without a session
- Shared auth helper: `src/lib/portal-auth.ts` → `validatePortalToken(token)` — returns the tenant with full unit/property/org includes, or `null` if missing/expired
- Portal page is mobile-first with **5 tabs**: Overview / Balance / Files / Messages / Request

**Portal API routes** (all under `src/app/api/portal/[token]/`):
- `GET /api/portal/[token]` — tenant info, unit, property, last 12 invoices, outstanding balance
- `GET /api/portal/[token]/documents` — tenant documents grouped by `DocumentCategory`, with signed Supabase URLs (per-doc try/catch so a single bad path doesn't 500 the whole route)
- `GET /api/portal/[token]/ledger` — `{ summary: { totalInvoiced, totalPaid, outstanding }, events, nextCursor }`. `events` unions `INVOICE_ISSUED` rows from `Invoice` and `PAYMENT_RECEIVED` rows from `IncomeEntry`, sorted desc with cursor pagination (`?cursor=&limit=`)
- `GET /api/portal/[token]/invoices/[invoiceId]/pdf` — full invoice PDF
- `GET /api/portal/[token]/invoices/[invoiceId]/receipt` — simplified one-page receipt PDF (`src/lib/receipt-pdf.tsx`); only valid for `status === "PAID"` invoices
- `POST /api/portal/[token]/invoices/[invoiceId]/proof` — **hybrid proof of payment**: accepts `multipart/form-data` with optional `file` (image/PDF, ≤10 MB) and/or `text` (≤2000 chars). Sets `Invoice.status = "PENDING_VERIFICATION"`, populates `proofOfPaymentUrl` (storage path) / `proofOfPaymentText` / `proofOfPaymentType` (`FILE` | `TEXT` | `BOTH`) / `proofSubmittedAt`. Notifies managers via `sendNotificationEmail` with HTML-escaped body
- `GET/POST /api/portal/[token]/messages`, `GET/POST /api/portal/[token]/messages/[threadId]` — two-way tenant ↔ manager threads. Categories: `LEASE_QUERY`, `PAYMENT_NOTIFICATION`, `PERMISSION_REQUEST`, `GENERAL`. Tenant POST → email to ADMIN/MANAGER recipients
- `GET/POST /api/portal/[token]/maintenance` — GET returns only `submittedViaPortal: true` jobs; POST creates a job with `submittedViaPortal: true`, `priority: MEDIUM`, `status: OPEN`

**Manager-side routes** (require `requireManager()` + property-access guard):
- `POST /api/invoices/[id]/verify-proof` — body `{ action: "approve" | "reject", paidAmount?, paidAt?, paymentMethod? }`. On approve: sets `PAID`, ensures matching `IncomeEntry` (creates with `paymentMethod`), and persists the proof to the tenant's `TenantDocument` vault as a `PAYMENT_RECEIPT`, then clears the invoice's proof fields. On reject: deletes the storage file and reverts `status` to `SENT` or `OVERDUE`. Surfaces inline via `ProofVerifyDrawer`
- `GET /api/invoices/[id]/verify-proof` — drawer fetches a 5-minute signed URL on demand (never embed signed URLs in emails)
- `GET /api/tenants/[id]/messages`, `GET/POST/PATCH /api/tenants/[id]/messages/[threadId]` — manager view, reply, mark `RESOLVED`. PATCH body `{ status }`. Opening a thread auto-flips `SENT → READ`

**Manager UI**:
- Tenant detail page (`src/app/(dashboard)/tenants/[id]/page.tsx`) has a **"Portal Msgs"** tab rendering `PortalMessagesTab` (`src/components/tenants/PortalMessagesTab.tsx`) — two-pane on desktop, single-pane on mobile
- `PENDING_VERIFICATION` invoice badge ("Check Proof", amber) is clickable and opens `ProofVerifyDrawer` (`src/components/invoices/ProofVerifyDrawer.tsx`) — inline image / PDF iframe preview, copy-on-click text panel, paid-amount + payment-method controls
- Manager generates/revokes the portal link from the tenant detail page (`POST/DELETE /api/tenants/[id]/portal-token`)

**Portal UI components** (`src/components/portal/`):
- `BottomSheet.tsx` — generic mobile bottom-sheet primitive (used for compose new message + thread detail + proof submission)
- `PaymentNotificationSheet.tsx` — hybrid file/text proof submission UI

**Email body sanitization**: `proofOfPaymentText` and tenant message bodies are run through `esc()` (exported from `src/lib/email.ts`) before injection into HTML email templates. In React UI they're rendered as plain text inside `<pre>` / JSX text nodes, never via `dangerouslySetInnerHTML`.

**Misc**:
- Maintenance jobs submitted via portal show a "Tenant Request" badge in the maintenance queue; filterable via `?portalOnly=true` query param on `GET /api/maintenance`
- `IncomeEntry.paymentMethod` (`PaymentMethod` enum: `BANK_TRANSFER`, `MPESA`, `CASH`, `CARD`, `CHEQUE`, `OTHER`) drives the ledger timeline's "Payment Method" column and the receipt PDF

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
- Implemented demos (registered in `src/lib/demo-definitions.ts` with corresponding `case` branches in `POST /api/demo/seed`):
  - `"al-seef"` → Al Seef Residences (20-unit Bahrain tower)
  - `"sandton-heights"` → Sandton Heights (South Africa)
  - `"belsize-court"` → Belsize Court (UK)

**pgBouncer constraint**: Supabase uses pgBouncer in transaction pooling mode. This makes the callback-form `prisma.$transaction(async (tx) => {...})` incompatible — it silently commits partial work. Always use sequential `await` calls with manual cleanup, or the array-form `prisma.$transaction([op1, op2, ...])` for atomic operations.

### Setup Progress Visibility

Per-property activation checklist that turns a fresh org's "where do I start?" into a measurable % complete. Pure derived state — no DB column, no migration.

- **Logic**: `computeSetupProgress(propertyId)` in `src/lib/setup-progress.ts` runs one `Promise.all` of counts (`units`, active tenants, tenants with `portalToken`, `recurringExpenses`, `insurancePolicies`, org-scoped active `vendors`, `managementAgreement`, income+expense entries) plus an `Organization` read (logo + bank/M-Pesa). Returns `{ propertyId, propertyName, propertyType, percent, completedCount, totalCount, items }`. Items mark `applicable: false` per property type — e.g. `tenants` and `tenant_portal` don't apply to AIRBNB and are excluded from the denominator.
- **API**: `GET /api/setup-progress` returns an array for every accessible property; `?propertyId=X` returns one. Guarded by `requireAuth()` + `getAccessiblePropertyIds()`.
- **UI**:
  - Dashboard widget — `src/components/dashboard/SetupChecklist.tsx` (client). Animated gold progress bar, ✅/⚠ rows with per-item CTA links + hint tooltips, collapsible, motivational microcopy at ≥80%. Dismissal at 100% persists in `localStorage` under `setup-dismissed:{propertyId}` and auto-reappears if the score drops below 100. Mounted in `src/app/(dashboard)/dashboard/page.tsx` above the KPI strip, suppressed for OWNER role.
  - Properties page — list/grid cards show a `{percent}% set up` Badge (gold <100, green =100) next to the type badge, populated by a single `GET /api/setup-progress` fetch on load.

## Environment Variables

```
DATABASE_URL                  # Supabase transaction pooler (port 6543, &pgbouncer=true)
DIRECT_URL                    # Supabase direct connection (port 5432) — migrations only
NEXTAUTH_SECRET               # NextAuth secret
AUTH_SECRET                   # Same value as NEXTAUTH_SECRET
NEXTAUTH_URL                  # App URL (http://localhost:3000 for dev)
NEXT_PUBLIC_SUPABASE_URL      # Supabase project URL (for document storage)
SUPABASE_SERVICE_ROLE_KEY     # Supabase service role key (server-only, never exposed to browser)
RESEND_API_KEY                # Resend email API key — required for all email sending
RESEND_FROM_EMAIL             # Optional sender address (default: "Groundwork PM <noreply@groundworkpm.com>")
CRON_SECRET                   # Random secret that Vercel sends as Bearer token to authenticate cron calls
NEXT_PUBLIC_SENTRY_DSN        # Optional — enables Sentry error monitoring (client+server). SDK no-ops when absent
SENTRY_AUTH_TOKEN             # Optional — enables source-map upload at build time
```

### Automated Notifications (Cron)

`GET /api/cron/notifications` — runs daily at 07:00 UTC via Vercel Cron (configured in `vercel.json`). Secured by `Authorization: Bearer ${CRON_SECRET}`.

Checks and emails ADMIN + MANAGER users with property access (falling back to the org's contact email when a property has no manager — see `getPropertyManagers`) when:
- A tenant lease expires in ≤30 days (`LEASE_EXPIRY_30D`) or ≤7 days (`LEASE_EXPIRY_7D`)
- An invoice is unpaid and >7 days overdue (`INVOICE_OVERDUE`)
- A compliance certificate expires in ≤30 days or ≤7 days
- An insurance policy ends in ≤30 days or ≤7 days
- An URGENT maintenance job is still OPEN after 4+ hours

It also runs the smart-reminder checkers and `runAutomations()` (see the Automations section) in the same `Promise.allSettled` batch.

**Gating**: every checker early-exits per item via `isAutomationEnabled(orgId, "<KEY>", propertyId)` (org toggle, with per-property override), and each per-recipient send is filtered by `wantsEmail(userId, category)` (per-user opt-out). `resetAutomationCache()` runs at the top of the handler.

Deduplication: `NotificationLog` table stores every sent notification; each checker queries this before sending to prevent repeated alerts within the dedup window.

Source files: `src/lib/notifications/checkers.ts`, `src/lib/notifications/email-templates.ts`, `src/lib/automations.ts`, `src/lib/automation-registry.ts`

To test locally:
```bash
curl -H "Authorization: Bearer your-cron-secret" http://localhost:3000/api/cron/notifications
```
