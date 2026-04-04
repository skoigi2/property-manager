# Plan: Make Property Manager Sellable — Full Funnel

## Context

The app is a mature, production-ready property management platform (multi-tenancy, invoicing, reporting, maintenance, forecasting). The problem is entirely go-to-market: it has no public face, no self-service signup, no pricing, and no way to pay. It is currently an internal operational tool, not a SaaS product.

This plan builds the complete path from "I found you" → "take my money", guided by the 7 mistakes framework:

| Mistake | Fix |
|---|---|
| Overpromise | Honest landing page copy — show what it does TODAY |
| No buy button | Stripe checkout on pricing page |
| Competing CTAs | One CTA throughout: "Start free trial" |
| Gating value | Public read-only demo — no login required |
| No funnel | Landing → Demo OR Signup → Onboarding → Dashboard → Billing |
| Building features | Zero new features — only funnel infrastructure |
| Afraid to sell | Real prices, real checkout, real trial expiry |

---

## Pricing Model

Per-property tiers (monthly recurring):

| Tier | Price | Limit |
|---|---|---|
| Starter | $29/mo | Up to 2 properties |
| Growth | $79/mo | Up to 10 properties |
| Pro | $149/mo | Unlimited |
| Trial | Free | 14 days, up to 2 properties |

---

## Funnel Architecture

```
Landing page (/)
  ├── "Start free trial" → /signup → /onboarding → /dashboard
  └── "Live demo" → auto-login as demo user → /dashboard (read-only)

/pricing  → Stripe Checkout → webhook → subscription active → /dashboard
/billing  → Stripe Customer Portal (manage/cancel)
```

---

## Phase 1 — Schema & Stripe Setup

### 1.1 Prisma schema changes (`prisma/schema.prisma`)

Add to `Organization` model:
```prisma
stripeCustomerId     String?
stripeSubscriptionId String?
pricingTier          PricingTier  @default(TRIAL)
trialEndsAt          DateTime?
subscriptionStatus   String?      // "trialing" | "active" | "past_due" | "canceled"
propertyLimit        Int          @default(2)
```

New enum:
```prisma
enum PricingTier {
  TRIAL
  STARTER
  GROWTH
  PRO
}
```

Run: `npx prisma migrate dev --name add-subscription-fields` then `npx prisma generate`.

### 1.2 New lib file: `src/lib/stripe.ts`
- Stripe client singleton (uses `STRIPE_SECRET_KEY`)
- `PLAN_PRICE_IDS` map: `{ STARTER, GROWTH, PRO }` → Stripe Price IDs
- `PLAN_PROPERTY_LIMITS`: `{ STARTER: 2, GROWTH: 10, PRO: Infinity }`

### 1.3 New lib file: `src/lib/subscription.ts`
- `getSubscriptionStatus(orgId)` — reads from DB
- `canAddProperty(orgId)` — compares property count vs. `propertyLimit`
- `isTrialExpired(org)` — checks `trialEndsAt < now`

### 1.4 New env vars (add to `.env.local` + document in CLAUDE.md)
```
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_STARTER_PRICE_ID
STRIPE_GROWTH_PRICE_ID
STRIPE_PRO_PRICE_ID
```

---

## Phase 2 — Public Storefront

### 2.1 Landing page: `src/app/page.tsx` (rewrite)

**Remove** the redirect. Build a full marketing page with these sections:
- **Hero**: "Property management software for East African landlords and managers" — honest tagline. Subhead: "Track rent, generate owner reports, manage maintenance. Built for portfolios of 1 to 100+ units."
- **Social proof bar**: logos or "Used by property managers across Kenya, Uganda, Tanzania"
- **Feature showcase** (3 cards, what it does TODAY): Rent & Income Tracking / Owner Reports & Invoices / Maintenance & Asset Register
- **Screenshots/mockup**: Dashboard screenshot (static image, add to `public/screenshots/`)
- **Pricing preview**: 3-tier table with prices and "Start free trial" buttons
- **One CTA only**: "Start free 14-day trial — no credit card required" (repeated in hero + footer)
- **"Live demo" link** in the nav — separate from the trial CTA

This is a server component. No auth check. Not wrapped in dashboard layout.

### 2.2 Pricing page: `src/app/(marketing)/pricing/page.tsx`

New route group `(marketing)` with its own layout (no sidebar, no auth).

Pricing table with:
- Three columns (Starter / Growth / Pro)
- Feature checklist per tier
- "Start free trial" → `/signup?plan=starter` (pre-selects plan)
- No waitlist. No "contact us". A real "Start free trial" button.

### 2.3 Update login page (`src/app/(auth)/login/page.tsx`)

Add:
- "Don't have an account? Start free trial" link → `/signup`
- "Explore with demo data" button → calls `/api/demo/login` then redirects to dashboard

---

## Phase 3 — Self-Service Signup

### 3.1 New page: `src/app/(auth)/signup/page.tsx`

Form fields:
- Full name
- Work email
- Password
- Company / Agency name
- Number of properties managed (1-2 / 3-10 / 10+) — maps to plan recommendation

On submit: `POST /api/auth/signup`

### 3.2 New route: `src/app/api/auth/signup/route.ts`

Steps:
1. Validate inputs with Zod
2. Check email not already registered
3. Hash password (`bcryptjs`)
4. Create `Organization` with `pricingTier: TRIAL`, `trialEndsAt: now + 14 days`, `propertyLimit: 2`
5. Create `User` with `role: ADMIN`, linked to org via `UserOrganizationMembership`
6. Return success → client redirects to `/onboarding`

No email verification for MVP (can add later). Sign them in immediately using NextAuth `signIn()` after creation.

---

## Phase 4 — Onboarding Wizard

### 4.1 New page: `src/app/(dashboard)/onboarding/page.tsx`

3-step wizard (shown only when `user.completedOnboarding = false` OR no properties exist):

**Step 1 — Add your first property**
- Property name, type (Long-term / Airbnb), currency
- Calls `POST /api/properties`

**Step 2 — Add your first unit**
- Unit name/number, type (1-bed / 2-bed / Studio / Other), monthly rent
- Calls `POST /api/units`

**Step 3 — You're ready!**
- Summary card: "Your dashboard is set up"
- CTA: "Go to dashboard" → `/dashboard`
- Secondary: "Invite a team member" → `/settings/users`

Middleware should redirect first-time users (no properties + `completedOnboarding = false`) to `/onboarding` instead of `/dashboard`.

Add `completedOnboarding Boolean @default(false)` to `User` model (Phase 1 migration).

---

## Phase 5 — Stripe Billing

### 5.1 New route: `src/app/api/billing/checkout/route.ts`

`POST` — body: `{ plan: "STARTER" | "GROWTH" | "PRO" }`
- Creates or retrieves Stripe Customer for the org (stores `stripeCustomerId` on `Organization`)
- Creates Stripe Checkout Session (subscription mode, with `trial_period_days: 14`)
- Returns `{ url }` — client redirects to Stripe

### 5.2 New route: `src/app/api/billing/portal/route.ts`

`POST` — creates Stripe Customer Portal session, returns `{ url }`. Used from `/billing` page to let users upgrade/cancel/update payment.

### 5.3 New route: `src/app/api/webhooks/stripe/route.ts`

Handles:
- `customer.subscription.created` / `updated` → update `Organization.pricingTier`, `subscriptionStatus`, `propertyLimit`
- `customer.subscription.deleted` → set `subscriptionStatus: "canceled"`, `pricingTier: TRIAL`
- `invoice.payment_failed` → set `subscriptionStatus: "past_due"`

Use `stripe.webhooks.constructEvent()` with `STRIPE_WEBHOOK_SECRET` for signature verification. This route must be excluded from NextAuth middleware (add to `middleware.ts` public paths).

### 5.4 Billing page: `src/app/(dashboard)/billing/page.tsx`

Shows:
- Current plan + status (trialing / active / past_due / canceled)
- Trial days remaining (if trialing)
- "Upgrade plan" → opens Stripe checkout for selected plan
- "Manage billing" → Stripe Customer Portal
- Usage: "X of Y properties used"

### 5.5 Property creation guard

In `POST /api/properties/route.ts`, after `requireAdmin()`:
```ts
const canAdd = await canAddProperty(session.user.organizationId);
if (!canAdd) return Response.json({ error: "Upgrade your plan to add more properties" }, { status: 403 });
```

### 5.6 Middleware subscription check (`src/middleware.ts`)

After the existing role/auth checks, add:
- If `subscriptionStatus === "canceled"` OR trial is expired → redirect to `/billing` (except `/billing`, `/api/billing/*`, `/api/webhooks/*`)
- If `subscriptionStatus === "past_due"` → show a banner but allow access (handled client-side via session data)

Add `subscriptionStatus` and `trialEndsAt` to the JWT in `src/lib/auth.ts`.

---

## Phase 6 — Public Demo

### 6.1 New route: `src/app/api/demo/login/route.ts`

`POST` — no auth required:
1. Look up the seeded demo org (by a known name, e.g. "Demo — Mayfair Suites") or create it if absent
2. Find the demo manager user (`demo@propmgr.app`)
3. Create a short-lived signed JWT (1-hour, read-only flag) OR use NextAuth `signIn` with demo credentials
4. Return redirect to `/dashboard`

**Read-only enforcement**: Add `isDemo: boolean` to JWT. API routes that mutate data check this flag and return 403 with "Demo mode — sign up to make changes".

### 6.2 Demo user in seed

In `prisma/seed.ts`, add a demo org + user:
- `Organization`: `"Demo — Mayfair Suites"`, `pricingTier: PRO`
- `User`: `demo@propmgr.app`, role `MANAGER`, `isDemo: true`
- Uses Mayfair Suites property + existing seed data

---

## Phase 7 — Trial Expiry UX

### 7.1 Trial banner component

`src/components/layout/TrialBanner.tsx` — shown in dashboard layout when `pricingTier === TRIAL`:
- "X days left in your free trial — Upgrade now"
- Dismissible per session; urgent styling when ≤ 3 days remain

### 7.2 Upgrade prompt on property creation limit

In the UI (property creation modal), if `canAddProperty` returns false, show inline message: "You've reached the 2-property limit on the Starter plan. Upgrade to Growth for up to 10 properties."

---

## Critical Files to Modify

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add `PricingTier` enum, subscription fields + `isDemo`/`completedOnboarding` to User |
| `src/app/page.tsx` | Rewrite as marketing landing page |
| `src/app/(auth)/login/page.tsx` | Add signup link + demo button |
| `src/middleware.ts` | Add subscription status check; add public paths for `/signup`, `/pricing`, `/api/webhooks/stripe`, `/api/demo/login` |
| `src/lib/auth.ts` | Add `subscriptionStatus`, `trialEndsAt`, `isDemo` to JWT/session |
| `src/app/(dashboard)/layout.tsx` | Render `TrialBanner` conditionally |
| `src/app/api/properties/route.ts` | Add `canAddProperty` guard on POST |

## New Files

| File | Purpose |
|---|---|
| `src/lib/stripe.ts` | Stripe client + plan config |
| `src/lib/subscription.ts` | Tier limits, status helpers |
| `src/app/(marketing)/layout.tsx` | Public layout (no sidebar) |
| `src/app/(marketing)/pricing/page.tsx` | Pricing page |
| `src/app/(auth)/signup/page.tsx` | Signup form |
| `src/app/api/auth/signup/route.ts` | Create org + user |
| `src/app/api/billing/checkout/route.ts` | Stripe checkout session |
| `src/app/api/billing/portal/route.ts` | Stripe portal session |
| `src/app/api/billing/status/route.ts` | Current subscription status |
| `src/app/api/webhooks/stripe/route.ts` | Stripe webhook handler |
| `src/app/api/demo/login/route.ts` | Auto-login as demo user |
| `src/app/(dashboard)/onboarding/page.tsx` | 3-step onboarding wizard |
| `src/app/(dashboard)/billing/page.tsx` | Billing management UI |
| `src/components/layout/TrialBanner.tsx` | Trial days remaining banner |

---

## Verification

1. **Landing page**: Visit `/` unauthenticated — should see marketing page, not redirect to `/login`
2. **Demo**: Click "Live demo" → lands on dashboard with Mayfair Suites data, no signup. Try to add income entry → gets 403 "Demo mode" message.
3. **Signup**: Go to `/signup`, fill form → org + user created → redirected to `/onboarding`
4. **Onboarding**: Complete 3 steps → property + unit created → lands on `/dashboard`
5. **Trial banner**: Dashboard shows "14 days left" banner; after DB update to `trialEndsAt = yesterday` → middleware redirects to `/billing`
6. **Stripe checkout**: Click "Upgrade to Growth" → redirected to Stripe checkout page
7. **Webhook**: Simulate `customer.subscription.updated` via Stripe CLI → `Organization.pricingTier` updates in DB
8. **Property limit**: On Starter plan, create 2 properties → 3rd attempt returns 403 with upgrade prompt
9. **Build check**: `npx tsc --noEmit && npm run build` must pass
