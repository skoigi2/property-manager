# Plan: Make Property Manager Sellable — Full Funnel

## Context

The app is a mature, production-ready property management platform. The problem is entirely go-to-market: it has no public face, no self-service signup, no pricing, and no way to pay. This plan builds the complete path from "I found you" → "take my money".

**Key decisions confirmed:**
- App name: **Property Manager** (no rebrand)
- Target: **Global** — any landlord or agency
- Trial: **30 days, no credit card required**, max 2 properties
- Trial expiry: **Hard lock — read-only** (view data, cannot add/edit). Never deleted.
- Payment: Card collected **at trial expiry** via Stripe Checkout (no card upfront)
- Billing: **Monthly + Annual** (annual = 2 months free, pay 10 get 12)
- Onboarding wizard: **3 steps** — Property → Unit → Done
- Password reset: **Email link via Resend**
- No dedicated demo mode — users reference the seeded demo properties

---

## Pricing

| Tier | Monthly | Annual | Properties |
|---|---|---|---|
| Trial | Free | — | Up to 2, 30 days |
| Starter | $29/mo | $290/yr | Up to 2 |
| Growth | $79/mo | $790/yr | Up to 10 |
| Pro | $149/mo | $1,490/yr | Unlimited |

Property limit is **computed from `pricingTier`** at runtime — never stored in DB.

---

## Funnel

```
/ (landing page)
  └── "Start free trial" → /signup → /onboarding → /dashboard

/pricing → "Start free trial" (same flow)

/dashboard → TrialBanner (days remaining)
  └── trial expires → read-only lock → /billing
  └── property limit hit → upgrade prompt → /billing

/billing → Stripe Checkout (no trial period) → webhook → active subscription
```

---

## Phase 1 — Schema, Stripe & Email Config

### 1.1 Prisma schema — `Organization` additions
```prisma
stripeCustomerId     String?
stripeSubscriptionId String?
pricingTier          PricingTier @default(TRIAL)
trialEndsAt          DateTime?
subscriptionStatus   String?     // "trialing"|"active"|"past_due"|"canceled"|"expired"
```

### 1.2 Prisma schema — `User` additions
```prisma
passwordResetToken   String?   @unique
passwordResetExpires DateTime?
```

### 1.3 New enum
```prisma
enum PricingTier {
  TRIAL
  STARTER
  GROWTH
  PRO
}
```

**No `propertyLimit` field** — computed from tier. **No `completedOnboarding`** — derived from `properties.count === 0`. **No `isDemo`** — no demo mode.

Migration: create `prisma/migrations/20260410000000_add_saas_fields/migration.sql` manually (shadow DB unavailable). Apply in Supabase SQL Editor.

### 1.4 `src/lib/stripe.ts`
```typescript
// Stripe singleton
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Price IDs from env (monthly + annual per tier)
export const PRICE_IDS = {
  STARTER: { monthly: process.env.STRIPE_STARTER_MONTHLY_PRICE_ID!, annual: process.env.STRIPE_STARTER_ANNUAL_PRICE_ID! },
  GROWTH:  { monthly: process.env.STRIPE_GROWTH_MONTHLY_PRICE_ID!,  annual: process.env.STRIPE_GROWTH_ANNUAL_PRICE_ID! },
  PRO:     { monthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID!,     annual: process.env.STRIPE_PRO_ANNUAL_PRICE_ID! },
};

// Property limits per tier (single source of truth)
export const PROPERTY_LIMITS: Record<string, number> = {
  TRIAL:   2,
  STARTER: 2,
  GROWTH:  10,
  PRO:     Infinity,
};
```

### 1.5 `src/lib/subscription.ts`
```typescript
export async function canAddProperty(orgId: string): Promise<boolean>
  // count properties for org, compare to PROPERTY_LIMITS[org.pricingTier]

export function isTrialExpired(org: { pricingTier: string; trialEndsAt: Date | null }): boolean
  // pricingTier === "TRIAL" && trialEndsAt < new Date()

export function isSubscriptionActive(org: { subscriptionStatus: string | null; pricingTier: string; trialEndsAt: Date | null }): boolean
  // active | trialing (and not expired) | PRO/GROWTH/STARTER with active status
```

### 1.6 `src/lib/email.ts`
```typescript
// Resend singleton
// sendPasswordReset(email, resetLink) — uses a clean HTML template
// sendWelcome(email, name) — optional, sent on signup
```

### 1.7 New environment variables
```
# Stripe
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_STARTER_MONTHLY_PRICE_ID
STRIPE_STARTER_ANNUAL_PRICE_ID
STRIPE_GROWTH_MONTHLY_PRICE_ID
STRIPE_GROWTH_ANNUAL_PRICE_ID
STRIPE_PRO_MONTHLY_PRICE_ID
STRIPE_PRO_ANNUAL_PRICE_ID

# Resend
RESEND_API_KEY
RESEND_FROM_EMAIL   # e.g. "Property Manager <noreply@propertymanager.app>"
```

---

## Phase 2 — Public Storefront

### 2.1 Rewrite `src/app/page.tsx`

Change from a redirect to a full server-component marketing page. Unauthenticated visitors land here. Structure:

- **Nav**: Logo | Features | Pricing | "Sign in" | **"Start free trial"** (gold CTA)
- **Hero**: "Property management software for landlords and agencies worldwide" — sub: "Track rent, generate owner reports, manage maintenance and compliance. Trusted by property managers across 10+ countries."
- **Feature cards** (3): Rent & Income Tracking / Owner Reports & Invoices / Maintenance & Assets
- **Social proof**: "Used by property managers in Kenya, UK, UAE, South Africa…"
- **Pricing preview**: 3-column table (Starter / Growth / Pro) with monthly/annual toggle — each with "Start free trial" button → `/signup?plan=starter`
- **Bottom CTA**: "Start your free 30-day trial — no credit card required"
- **Footer**: Links to /pricing, /login

Export `metadata` for SEO:
```typescript
export const metadata = {
  title: "Property Manager — Smart property management for landlords & agencies",
  description: "Track rent, invoices, maintenance, and compliance for your property portfolio. 30-day free trial.",
  openGraph: { title, description, url, images: ["/og-image.png"] },
};
```

### 2.2 `src/app/(marketing)/layout.tsx`

New route group with a minimal nav layout (no sidebar, no auth). Shared by `/pricing`.

### 2.3 `src/app/(marketing)/pricing/page.tsx`

Full pricing page with:
- Monthly / Annual billing toggle (state: client component)
- 3 plan columns with feature checklist
- Annual shows "Save 2 months" badge and annual price
- "Start free trial" buttons → `/signup?plan=X&billing=monthly|annual`
- FAQ section (What happens at trial end? Can I cancel? Is my data safe?)

### 2.4 Update `src/middleware.ts` — add public paths

Add these paths to bypass auth checks entirely:
```
/                     (landing page)
/pricing
/signup
/forgot-password
/reset-password
/api/auth/signup
/api/auth/forgot-password
/api/auth/reset-password
/api/webhooks/stripe
```

---

## Phase 3 — Auth: Signup & Password Reset

### 3.1 `src/app/(auth)/signup/page.tsx`

Form fields:
- Full name
- Work email
- Password (min 8 chars)
- Company / Agency name
- "Sign up with Google" button (calls `signIn("google", { callbackUrl: "/onboarding" })`)
- "Already have an account? Sign in" link

On form submit: `POST /api/auth/signup`

### 3.2 `src/app/api/auth/signup/route.ts`

Steps:
1. Zod validate inputs
2. Check email not already in DB → 409 if exists
3. Hash password with bcrypt
4. Create `Organization` → `pricingTier: TRIAL`, `trialEndsAt: now + 30 days`
5. Create `User` → `role: ADMIN`, linked via `UserOrganizationMembership`
6. Create Stripe customer (`stripe.customers.create`) → store `stripeCustomerId` on org
7. Send welcome email via Resend (optional, non-blocking)
8. Call NextAuth `signIn("credentials", { email, password, redirect: false })` to auto-login
9. Return `{ ok: true }` → client redirects to `/onboarding`

### 3.3 `src/app/(auth)/forgot-password/page.tsx`

Single email input. On submit: `POST /api/auth/forgot-password`. Shows "Check your email" confirmation.

### 3.4 `src/app/api/auth/forgot-password/route.ts`

1. Find user by email (return 200 regardless — prevents email enumeration)
2. Generate `crypto.randomBytes(32).toString("hex")` reset token
3. Store `passwordResetToken` (hashed) + `passwordResetExpires = now + 1h` on User
4. Send email via Resend with link: `https://app.propertymanager.app/reset-password?token=xxx`

### 3.5 `src/app/(auth)/reset-password/page.tsx`

Reads `?token=` from URL. Form: new password + confirm. On submit: `POST /api/auth/reset-password`.

### 3.6 `src/app/api/auth/reset-password/route.ts`

1. Find user by hashed token where `passwordResetExpires > now`
2. Hash new password, update user, clear reset token fields
3. Return success → client redirects to `/login`

### 3.7 Update `src/app/(auth)/login/page.tsx`

- Add "Don't have an account? Start free trial →" link to `/signup`
- Replace "Contact your manager to reset your password" with "Forgot password?" link → `/forgot-password`

---

## Phase 4 — Onboarding Wizard

### 4.1 Replace `src/app/onboarding/page.tsx` (existing placeholder)

3-step wizard, no sidebar (already outside `(dashboard)` group).

**Step 1 — Your first property**
- Inputs: Property name, Type (Long-term / Short-let / Airbnb), Currency (select from supported list)
- On "Next": `POST /api/properties`

**Step 2 — Your first unit**
- Inputs: Unit number/name, Type (Studio / 1 Bed / 2 Bed / 3 Bed / Other), Monthly rent
- On "Next": `POST /api/units` with the propertyId from Step 1

**Step 3 — You're all set**
- Summary: "Riara One · 1 unit added"
- Primary CTA: "Go to dashboard →"
- Secondary: "Add another property" → back to Step 1
- Secondary: "Invite a team member" → `/settings/users`

**Progress indicator**: 3 dots at top (filled as steps complete).

**Middleware**: New users with `membershipCount === 0` already redirect here (built in previous Google OAuth phase). Add additional check: if org has 0 properties AND user is ADMIN, also redirect to `/onboarding` on first visit.

---

## Phase 5 — Stripe Billing

### 5.1 `src/app/api/billing/checkout/route.ts`

`POST` — body: `{ plan: "STARTER"|"GROWTH"|"PRO", billing: "monthly"|"annual" }`
- Requires `requireAdmin()`
- Gets or creates Stripe customer (should already exist from signup)
- Creates Stripe Checkout Session:
  - Mode: `subscription`
  - **No `trial_period_days`** — users have already had their 30-day app-side trial
  - `success_url`: `/billing?success=1`
  - `cancel_url`: `/billing`
  - `customer`: org's `stripeCustomerId`
  - `line_items`: correct Price ID from `PRICE_IDS[plan][billing]`
- Returns `{ url }` → client redirects to Stripe

### 5.2 `src/app/api/billing/portal/route.ts`

`POST` — creates Stripe Customer Portal session for manage/cancel/update card.

### 5.3 `src/app/api/billing/status/route.ts`

`GET` — returns `{ pricingTier, subscriptionStatus, trialEndsAt, trialDaysLeft, propertyCount, propertyLimit }` for the billing page UI.

### 5.4 `src/app/api/webhooks/stripe/route.ts`

**Must bypass auth middleware** (already added to public paths above).

Raw body parsing (disable Next.js body parser for this route).

Events handled:
```
customer.subscription.created / updated
  → update pricingTier (from price ID lookup), subscriptionStatus, stripeSubscriptionId

customer.subscription.deleted
  → subscriptionStatus = "canceled", pricingTier = TRIAL (data preserved, read-only)

invoice.payment_failed
  → subscriptionStatus = "past_due"

invoice.payment_succeeded
  → subscriptionStatus = "active"
```

**Idempotency**: Check Stripe event ID hasn't been processed before (store last `stripeEventId` on org or use Stripe's idempotency key approach).

Signature verification:
```typescript
stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET!)
```

### 5.5 `src/app/(dashboard)/billing/page.tsx`

Shows:
- Current plan badge + status chip (Trialing / Active / Past Due / Canceled)
- Trial days remaining (if TRIAL and not expired)
- "X of Y properties used" usage meter
- **Plan cards**: Starter / Growth / Pro with monthly/annual toggle
  - Current plan highlighted
  - "Upgrade" → calls checkout API → Stripe redirect
- "Manage billing" button → Customer Portal (if subscribed)

### 5.6 Property creation guard

In `POST /api/properties`:
```typescript
const can = await canAddProperty(session.user.organizationId);
if (!can) return Response.json(
  { error: "Property limit reached. Upgrade your plan to add more properties." },
  { status: 403 }
);
```

UI: When `POST /api/properties` returns 403, the property modal shows the error with an "Upgrade plan →" link.

---

## Phase 6 — Subscription Enforcement (JWT + Middleware)

### 6.1 Add subscription fields to JWT

In `src/lib/auth.ts` jwt callback, after fetching user from DB, also query org subscription status:
```typescript
if (user && user.organizationId) {
  const org = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: { pricingTier: true, subscriptionStatus: true, trialEndsAt: true },
  });
  token.pricingTier       = org?.pricingTier ?? "TRIAL";
  token.subscriptionStatus = org?.subscriptionStatus ?? null;
  token.trialEndsAt       = org?.trialEndsAt?.toISOString() ?? null;
}
```

Set JWT max age to **24 hours** (down from 30-day default) so subscription changes take effect within a day.

### 6.2 Middleware read-only lock

In `src/middleware.ts`, add subscription check after existing role checks:

```typescript
const pricingTier       = (user?.pricingTier as string) ?? "TRIAL";
const subscriptionStatus = user?.subscriptionStatus as string | null;
const trialEndsAt       = user?.trialEndsAt ? new Date(user.trialEndsAt as string) : null;

const trialExpired = pricingTier === "TRIAL" && trialEndsAt && trialEndsAt < new Date();
const subCanceled  = subscriptionStatus === "canceled" || subscriptionStatus === "expired";
const isLocked     = trialExpired || subCanceled;

const isBillingPath = pathname.startsWith("/billing") || pathname.startsWith("/api/billing");
const isAuthPath    = pathname.startsWith("/api/auth") || pathname.startsWith("/login");

if (isLocked && !isBillingPath && !isAuthPath) {
  // Page request → redirect to billing
  if (!pathname.startsWith("/api")) {
    return NextResponse.redirect(new URL("/billing?expired=1", req.url));
  }
  // API mutation → return 403
  if (["POST","PUT","PATCH","DELETE"].includes(req.method)) {
    return NextResponse.json({ error: "Subscription required" }, { status: 403 });
  }
  // API read → allow (read-only access)
}
```

### 6.3 Trial banner — `src/components/layout/TrialBanner.tsx`

Shown in `src/app/(dashboard)/layout.tsx` when `pricingTier === "TRIAL"`:
- "> 7 days left": subtle gold banner — "X days left in your free trial · Upgrade now →"
- ≤ 7 days: amber/warning styling — "⚠ X days left — upgrade to keep access"
- ≤ 3 days: red/urgent — "🚨 Your trial expires in X days"
- Dismissible per session (localStorage key), reappears daily

---

## Files Modified

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add PricingTier enum, org subscription fields, user reset token fields |
| `src/app/page.tsx` | Full rewrite as marketing landing page |
| `src/lib/auth.ts` | Add subscription fields to JWT; set maxAge 24h |
| `src/middleware.ts` | Add public paths; add subscription read-only lock |
| `src/app/(auth)/login/page.tsx` | Add signup link, forgot-password link |
| `src/app/onboarding/page.tsx` | Replace placeholder with real 3-step wizard |
| `src/app/(dashboard)/layout.tsx` | Add TrialBanner |
| `src/app/api/properties/route.ts` | Add canAddProperty guard on POST |

## New Files

| File | Purpose |
|---|---|
| `src/lib/stripe.ts` | Stripe client + price IDs + property limits |
| `src/lib/subscription.ts` | canAddProperty, isTrialExpired, isSubscriptionActive |
| `src/lib/email.ts` | Resend client + email templates |
| `src/app/(marketing)/layout.tsx` | Public marketing layout |
| `src/app/(marketing)/pricing/page.tsx` | Full pricing page with monthly/annual toggle |
| `src/app/(auth)/signup/page.tsx` | Signup form + Google button |
| `src/app/(auth)/forgot-password/page.tsx` | Forgot password form |
| `src/app/(auth)/reset-password/page.tsx` | Reset password form |
| `src/app/api/auth/signup/route.ts` | Create org + user + Stripe customer |
| `src/app/api/auth/forgot-password/route.ts` | Generate + email reset token |
| `src/app/api/auth/reset-password/route.ts` | Validate token + update password |
| `src/app/api/billing/checkout/route.ts` | Stripe Checkout session |
| `src/app/api/billing/portal/route.ts` | Stripe Customer Portal |
| `src/app/api/billing/status/route.ts` | Subscription status for UI |
| `src/app/api/webhooks/stripe/route.ts` | Webhook handler (idempotent) |
| `src/app/(dashboard)/billing/page.tsx` | Billing management UI |
| `src/components/layout/TrialBanner.tsx` | Trial countdown banner |
| `prisma/migrations/20260410000000_add_saas_fields/migration.sql` | Manual migration SQL |

---

## Build Order

1. **Phase 1** — Schema migration + lib files (Stripe, subscription, email). Foundation everything else needs.
2. **Phase 2** — Landing page + pricing page + middleware public paths. Public face goes live.
3. **Phase 3** — Signup + password reset. Users can now self-register.
4. **Phase 4** — Onboarding wizard. Users get to value immediately after signup.
5. **Phase 6** — JWT subscription fields + middleware lock + TrialBanner. Enforcement layer.
6. **Phase 5** — Stripe checkout + webhook + billing page. Monetisation.

*(Phase 6 before Phase 5 because the lock/banner logic should be in place before Stripe is wired, so it's testable independently with manual DB edits.)*

---

## Verification

| Test | Expected |
|---|---|
| Visit `/` unauthenticated | Marketing landing page, no redirect to /login |
| Visit `/pricing` unauthenticated | Pricing page with monthly/annual toggle |
| Sign up via form | Org created with TRIAL tier, trialEndsAt = now+30d, redirected to /onboarding |
| Sign up via Google | Same — Google signIn callback creates org, promotes to ADMIN, redirects to /onboarding |
| Complete onboarding | Property + unit created, redirected to /dashboard |
| Trial banner | Shows in dashboard; styling changes at 7 days and 3 days |
| Forgot password | Email received with reset link; link expires after 1 hour |
| Hit property limit (2 on trial) | POST /api/properties returns 403 with upgrade message |
| DB: set trialEndsAt = yesterday | All mutation API calls → 403; all GET calls succeed; page requests → /billing |
| Stripe checkout | Redirected to Stripe; no trial on Stripe side; return to /billing?success=1 |
| Stripe webhook: subscription.updated | org.pricingTier + subscriptionStatus updated in DB |
| Annual billing toggle | Price switches to annual; Stripe receives annual price ID |
| `npx tsc --noEmit && npm run build` | Passes |
