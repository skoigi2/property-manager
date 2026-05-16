# Pricing-gating roadmap

A living document. Updated whenever we add a gate or change a tier policy.

---

## What is actually gated today

| Gate | Cap | Enforced in |
|---|---|---|
| **Property count** | Starter=2 · Growth=10 · Pro=∞ (Trial=2) | `PROPERTY_LIMITS` in [src/lib/paddle.ts](../src/lib/paddle.ts); `canAddProperty()` in [src/lib/subscription.ts](../src/lib/subscription.ts); called from `POST /api/properties` |
| **Team member count** | Starter=1 · Growth=10 · Pro=∞ (Trial=1) | `TEAM_LIMITS` in `paddle.ts`; `canAddUser()` in `subscription.ts`; called from `POST /api/users` |
| **Subscription state write-lock** | Cancelled / expired / past-due / trial-expired all → HTTP 402 on mutation | `requireActiveSubscription()` in `subscription.ts`, called from every mutating route |

Everything else is universally available to any org with an active subscription.

## Why we don't gate features

We chose this on purpose. Most SaaS gates features arbitrarily — "you need to upgrade to get the audit log". Customers feel taxed. We gate **capacity** (how many properties / teammates you can run) and leave **workflows** untouched. The pricing page leans into this as a differentiator.

This decision is documented in:
- [`src/app/(marketing)/pricing/page.tsx`](../src/app/(marketing)/pricing/page.tsx) — "Why no feature gates?" explainer + 3-checkmark matrix
- [`CLAUDE.md`](../CLAUDE.md) — "Pricing & gating" subsection under SaaS Onboarding

---

## Features we could plausibly gate in future

If we ever revisit this stance, these are the most credible candidates. Listing here so future strategy discussions have a starting point — **NOT a commitment** and not currently advertised as gated.

| Feature | Plausible gate | Reason this is a defensible gate |
|---|---|---|
| **Advanced cashflow forecast (6 / 12 month)** | Growth+ | 3-month forecast is useful for everyone; longer horizons are an analytics tool for larger portfolios |
| **Asset register & maintenance schedules** | Growth+ | Operational complexity is a function of portfolio size; small portfolios rarely track this formally |
| **Multiple organisations** | Pro | Multi-org membership is structurally a "running a managing-agent business" feature — natural Pro fit |
| **Configurable tax rules (VAT / WHT)** | Growth+ | Multi-jurisdiction tax sits with operators who actually issue cross-border invoices |
| **Audit log retention period** | Tier-based (e.g. Starter 30d / Growth 12mo / Pro forever) | Storage cost; defensible technical reason rather than artificial gating |
| **API access (when added)** | Pro | Integration capability typically lives in higher tiers; not yet a product |
| **Custom branding on owner reports / invoices** | Growth+ | Differentiator for agencies serving owners that expect branded outputs |
| **Cron frequency** | Tier-based (e.g. daily for Starter, hourly for Pro) | Operational SLA differentiation |

---

## Implementation pattern (if/when we add a gate)

Mirror the existing two gates. Each new gate needs:

1. A cap map in `src/lib/paddle.ts` (e.g. `FORECAST_HORIZON_MONTHS: Record<string, number>`).
2. A helper in `src/lib/subscription.ts` (e.g. `canUseForecast(orgId, months)` returning boolean).
3. A guard at the appropriate API route (return HTTP 402 with `{ code: "TIER_GATE_XYZ" }`).
4. UI: hide / disable the feature behind a `<TierGate feature="...">` wrapper (component does not yet exist — build when needed).
5. Marketing copy update on `/pricing` to surface the new gate as a real tier-differentiated matrix row.
6. Migration consideration: existing customers on a lower tier who already use the feature need a grandfather clause (handled per-feature in a release note).

---

## Rejected gates (deliberate choices not to gate)

| Feature | Why we don't gate it |
|---|---|
| Tenant portal | Core to the operating model; gating it would block exactly the workflow we sell on |
| Magic-link approvals | Same — owner approval is core, not an upsell |
| Daily expiry cron | Core safety net; gating would create silent failures for smaller customers |
| Inbox queue | Core operating surface; gating it is gating the product |
| Cases workspace | Core; same reasoning |
