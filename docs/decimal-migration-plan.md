# Plan: migrate money columns from Float to Decimal

**Status:** planned — deliberately NOT bundled with feature work. **Date:** June 2026.

## Why

All 68 money fields (`amount`, `amountPaid`, `monthlyRent`, `totalAmount`,
`grossAmount`, `vatAmount`, …) are Prisma `Float` → Postgres `double precision`.
Binary floats cannot represent most decimal fractions exactly; summed across
thousands of entries, statements drift by cents. For a financial product, the
correct storage type is `numeric(14,2)`.

## Why this is NOT a simple find-and-replace

Prisma maps `Decimal` to `Prisma.Decimal` (decimal.js). Two consequences:

1. **JSON serialization** — `Response.json(entity)` serializes a Decimal as a
   *string* (`"85000"` not `85000`). Every frontend consumer doing arithmetic
   (`reduce`, `+`, `formatCurrency(amount)`) on API responses breaks at once.
2. **Server arithmetic** — every `a + b` on Prisma results in lib code
   (`calculations.ts`, `inbox.ts`, `owner-statement.ts`, checkers, importers,
   PDF generators) becomes string concatenation or NaN unless converted.

So the migration is: DB type change + a **serialization boundary** that keeps
the rest of the app working on plain numbers.

## Chosen approach: Decimal in DB, number at the boundary

Money stays `Decimal` in Postgres/Prisma (exact storage + exact SQL aggregates),
but is converted to `number` the moment it leaves the data layer. 2-dp currency
values up to 10^12 are exactly representable as doubles **after rounding**, so a
number is safe for display and UI arithmetic once the stored value is exact.

### Phase 0 — preparation (safe now, no schema change)
- Add `src/lib/money.ts`: `round2()`, `toNumber(d: Decimal | number)`, and a
  `decimalsToNumbers(obj)` deep converter (walks objects, converts
  `Prisma.Decimal` instances).
- Add Vitest coverage asserting financial libs behave identically with
  number inputs produced by `toNumber`.
- Ensure every money **write** path rounds with `round2()` (today the DB
  accepts unrounded floats from VAT math).

### Phase 1 — schema + data migration
- `prisma/schema.prisma`: change all money fields to
  `Decimal @db.Decimal(14, 2)`. (Inventory: grep `Float` and classify; the only
  non-money Floats are `sizeSqm`, KPI percentages, and `ratePercent` —
  percentages can stay Float or move to `Decimal(5,2)`.)
- Migration SQL (additive-safe, table by table):
  `ALTER TABLE "IncomeEntry" ALTER COLUMN "grossAmount" TYPE numeric(14,2) USING round("grossAmount"::numeric, 2);`
  — the `USING round(...)` clause snaps existing float drift to 2 dp at
  migration time. Run during a low-traffic window; each ALTER takes an
  ACCESS EXCLUSIVE lock but tables are small (<100k rows) so seconds each.
- `npx prisma db push` locally; same SQL in Supabase prod.

### Phase 2 — serialization boundary
- Wrap the Prisma singleton with a client extension that converts Decimal →
  number on read:
  ```ts
  prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ query, args }) {
          return decimalsToNumbers(await query(args));
        },
      },
    },
  })
  ```
  This keeps **every existing route, lib, and component working unchanged** —
  they continue to see plain numbers, now backed by exact storage.
- Writes: Prisma accepts `number` for Decimal columns natively — no call-site
  changes needed (values are already `round2`-ed from Phase 0).

### Phase 3 — verification
- `npm test` (financial libs), `tsc`, `npm run build`.
- Reconciliation script: for each property, compare pre/post-migration sums of
  income/expenses/invoices to the cent; write report to `scripts/`.
- Smoke: dashboard totals, owner statement PDF, invoice PDF, importer round-trip.

### Phase 4 — cleanup
- Update CLAUDE.md financial rules; add lint note: new money columns must be
  `Decimal @db.Decimal(14,2)`.

## Effort & risk

- Phase 0: ~half a day. Phases 1–3: one focused session with prod migration
  window. Risk concentrates in Phase 1's `USING` clauses (mechanical, table by
  table) and Phase 2's extension (one file, easily reverted).
- Rollback: the extension is removable; the column type can be reverted with
  `TYPE double precision USING ...` (lossless for 2-dp values).

## Explicit non-goals

- No `Prisma.Decimal` arithmetic in app code — the boundary keeps `number`
  ergonomics everywhere.
- No currency-minor-units (integer cents) refactor — `numeric(14,2)` + rounded
  writes achieves exactness without touching every formatter.
