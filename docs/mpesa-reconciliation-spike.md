# Spike: M-Pesa rent collection & auto-reconciliation

**Status:** design spike — no code yet. **Date:** June 2026.

## Why

Today the payment loop is manual: tenant pays rent outside the app → uploads proof
via the portal (`POST /api/portal/[token]/invoices/[invoiceId]/proof`) → manager
verifies in `ProofVerifyDrawer`. Every payment costs manager attention.

The target loop: payment hits the org's paybill → webhook fires → invoice flips to
`PAID`, an `IncomeEntry` is created (the existing invoice↔income link logic),
receipt is emailed, hint cleared. Zero manager touch for clean matches. This is the
single highest-leverage feature for the Kenyan market and directly lifts the
"rent collection rate" KPI we already track in `ManagementAgreement`.

## Integration surface: Safaricom Daraja

Two complementary modes — ship in this order:

### Phase A — C2B confirmation webhook (passive listen)
The org registers its paybill/till confirmation URL with Daraja
(`/mpesa/c2b/v2/registerurl`). Safaricom POSTs every incoming payment to us.
Works with the payment behaviour tenants already have (paybill + account number).

- **Endpoint:** `POST /api/webhooks/mpesa/c2b/[orgToken]` — public, no session.
  `orgToken` is a per-org UUID minted when the org connects M-Pesa (mirrors the
  portal-token pattern in `portal-auth.ts`); unguessable URL + payload validation
  is the auth model (Daraja does not sign C2B callbacks).
- Must respond `{ "ResultCode": 0 }` fast (<5 s) — persist first, reconcile async.

### Phase B — STK Push from the tenant portal (active request)
"Pay now" button on a portal invoice triggers `/mpesa/stkpush/v1/processrequest`
with the invoice amount + tenant phone. Callback confirms. Better UX, exact
amount/invoice correlation, but requires the tenant to be in the portal.

## Data model (additive migration)

```prisma
model MpesaConfig {
  id              String  @id @default(cuid())
  organizationId  String  @unique
  shortCode       String           // paybill or till number
  consumerKey     String           // encrypted at rest (see Open questions)
  consumerSecret  String
  passkey         String?          // STK push only
  webhookToken    String  @unique @default(uuid())
  environment     String  @default("production") // or "sandbox"
  isActive        Boolean @default(true)
}

model MpesaPayment {
  id              String   @id @default(cuid())
  organizationId  String
  transId         String   @unique     // Daraja TransID — idempotency key
  transTime       DateTime
  amount          Float
  msisdn          String               // payer phone (hashed display, last 4 shown)
  billRefNumber   String               // "account number" the payer typed
  firstName       String?
  status          MpesaMatchStatus @default(UNMATCHED)
  invoiceId       String?              // set when matched
  incomeEntryId   String?              // set when reconciled
  matchedBy       String?              // "auto" | userId
  rawPayload      Json
  createdAt       DateTime @default(now())
}

enum MpesaMatchStatus { UNMATCHED  AUTO_MATCHED  MANUAL_MATCHED  IGNORED }
```

`@@index([organizationId, status])` for the reconciliation queue.

## Matching rules (run in order, stop at first hit)

1. **Exact invoice number** — `billRefNumber` equals an open invoice's
   `invoiceNumber` for the org → match.
2. **Unit reference** — `billRefNumber` matches a unit number (e.g. "A4") with one
   active tenant who has exactly one open invoice → match.
3. **Phone + amount** — payer `msisdn` equals a tenant's phone AND amount equals an
   open invoice total → match.
4. Otherwise → `UNMATCHED`, surface in the reconciliation queue + Inbox item
   (`MPESA_UNMATCHED` hint, refId = MpesaPayment.id — fits the existing
   `(hintType, refId)` idempotency contract).

On match: reuse the exact transaction in `PATCH /api/invoices/[id]` (mark PAID →
create IncomeEntry with `paymentMethod: MPESA`, `paymentReference: transId`, clear
`INVOICE_OVERDUE` hint). Partial payments: record IncomeEntry, leave invoice open,
flag PARTIAL — same semantics as `calcExpensePayment` on the expense side.

## Reconciliation UI

- `/settings/payments` — connect M-Pesa (shortcode + keys), show webhook
  registration status, test-transaction button (sandbox).
- `/payments/reconcile` (manager-only) — queue of UNMATCHED payments with
  suggested matches (same scoring as auto-match but below threshold), one-click
  assign-to-invoice, or "Ignore" (non-rent deposits etc.).
- Tenant portal: paid invoices already get receipts via `receipt-pdf.tsx` — auto
  email it on auto-match.

## Security & ops

- Idempotency: unique `transId`; webhook upserts and returns 0 on replays.
- The webhook never trusts amounts for anything but recording — invoice flips go
  through the same guarded server logic as manual verification.
- Secrets encrypted with a server-side key (`MPESA_ENCRYPTION_KEY` env) — do NOT
  store Daraja credentials in plaintext.
- Daraja OAuth tokens cached ~55 min (per org) — in-memory cache with DB fallback
  is fine; tokens are cheap to re-mint.
- New env vars: none global (per-org creds in DB) except `MPESA_ENCRYPTION_KEY`.
- Sandbox first: Daraja sandbox + a `environment: "sandbox"` MpesaConfig against a
  demo org.

## Out of scope (this spike)

- B2C refunds / disbursements to landlords (future "owner payouts" feature).
- Bank-statement CSV reconciliation (separate importer, same MpesaPayment-style
  queue pattern — design once M-Pesa flow proves the matching UX).
- Stripe payment links for non-KES orgs (parallel track; same Invoice hooks).

## Estimated build order

1. Schema + `MpesaConfig` settings page (1–2 days)
2. C2B webhook + matching engine + tests for the matcher (2–3 days)
3. Reconciliation queue UI + Inbox hint (2 days)
4. STK push from portal (2 days)
5. Sandbox end-to-end, then pilot with one real org (1 week soak)

## Open questions for product owner

- Per-org paybill vs. platform-level paybill with account-number routing?
  (Per-org assumed above — most agencies already have their own paybill.)
- Should unmatched payments older than N days auto-create a petty-cash/suspense
  entry, or stay in the queue indefinitely?
- KYC/compliance: any Safaricom requirements for aggregating callbacks on behalf
  of client paybills (check Daraja partner terms before pilot).
