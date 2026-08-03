import { prisma } from "@/lib/prisma";
import { calcExpensePayment } from "@/lib/calculations";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/expense-categories";

// Computed vendor account statement — mirrors buildOwnerStatements /
// buildAgingSnapshot: a pure merge of the vendor's invoices (ExpenseEntry rows)
// and payments (VendorPayment rows) into a dated, running-balance ledger.
// Nothing is stored.
//
// Convention: invoiced amounts are the NET expense `amount` (pre-VAT), matching
// calcExpensePayment — the app-wide paid/outstanding derivation. `vatAmount`
// is carried per line for reference only.

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Most-frequent currency among a set of property currencies (null = no
 * property-derived currency at all). Shared by the statement builder and the
 * vendor detail route so both surfaces agree.
 */
export function deriveVendorCurrency(currencies: (string | null | undefined)[]): {
  currency: string | null;
  mixedCurrencies: boolean;
} {
  const counts = new Map<string, number>();
  for (const c of currencies) {
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const currency = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { currency, mixedCurrencies: counts.size > 1 };
}

export interface VendorStatementLine {
  date: string;               // ISO
  type: "INVOICE" | "PAYMENT";
  refId: string;              // ExpenseEntry.id or VendorPayment.id
  description: string;
  propertyName: string | null;
  reference: string | null;   // payment cheque/M-Pesa ref
  vatAmount: number | null;   // informational (invoices only)
  invoiced: number;           // 0 for payments
  paid: number;               // 0 for invoices
  balance: number;            // running balance owed to the vendor
}

export interface VendorOpenItem {
  id: string;
  date: string;
  dueDate: string | null;
  category: string;
  categoryLabel: string;
  description: string | null;
  propertyName: string | null;
  hasLineItems: boolean;
  total: number;
  paid: number;
  outstanding: number;
}

export interface VendorStatement {
  vendor: { id: string; name: string; category: string; isActive: boolean };
  /** Derived from the properties behind the vendor's expenses (most frequent
   *  wins); falls back to the first accessible property, then KES. */
  currency: string;
  /** True when the vendor's expenses span properties with differing
   *  currencies — totals are then a raw cross-currency sum. */
  mixedCurrencies: boolean;
  openingBalance: number;
  lines: VendorStatementLine[];
  totals: { invoiced: number; paid: number; outstanding: number };
  /** Expenses still carrying a balance (any date) — feeds the allocation UI. */
  openItems: VendorOpenItem[];
}

interface StatementExpense {
  id: string;
  date: Date | string;
  amount: number;
  vatAmount?: number | null;
  description?: string | null;
  category?: string | null;
  propertyName?: string | null;
}

interface StatementPayment {
  id: string;
  paymentDate: Date | string;
  amount: number;
  paymentMethod?: string | null;
  reference?: string | null;
  /** Overrides the default "Payment — <method>" label (synthetic lines). */
  description?: string | null;
}

/**
 * Pure running-balance merge (unit-tested). Opening balance = all invoiced
 * minus all paid strictly before `from`; lines cover [from, to] sorted by
 * date (invoices before payments on the same day, so a same-day settlement
 * reads charge-then-payment).
 */
export function computeVendorStatement(
  expenses: StatementExpense[],
  payments: StatementPayment[],
  from?: Date | null,
  to?: Date | null
): Pick<VendorStatement, "openingBalance" | "lines" | "totals"> {
  type Raw = { date: Date; sort: number; line: Omit<VendorStatementLine, "balance"> };
  const raw: Raw[] = [];

  for (const e of expenses) {
    const d = new Date(e.date);
    raw.push({
      date: d,
      sort: 0,
      line: {
        date: d.toISOString(),
        type: "INVOICE",
        refId: e.id,
        description: e.description?.trim()
          || (e.category ? EXPENSE_CATEGORY_LABELS[e.category as keyof typeof EXPENSE_CATEGORY_LABELS] ?? e.category : "Expense"),
        propertyName: e.propertyName ?? null,
        reference: null,
        vatAmount: e.vatAmount ?? null,
        invoiced: round2(e.amount),
        paid: 0,
      },
    });
  }

  for (const p of payments) {
    const d = new Date(p.paymentDate);
    raw.push({
      date: d,
      sort: 1,
      line: {
        date: d.toISOString(),
        type: "PAYMENT",
        refId: p.id,
        description: p.description
          || `Payment${p.paymentMethod ? ` — ${String(p.paymentMethod).replace(/_/g, " ")}` : ""}`,
        propertyName: null,
        reference: p.reference ?? null,
        vatAmount: null,
        invoiced: 0,
        paid: round2(p.amount),
      },
    });
  }

  raw.sort((a, b) => a.date.getTime() - b.date.getTime() || a.sort - b.sort);

  let openingBalance = 0;
  const inRange: Raw[] = [];
  for (const r of raw) {
    if (from && r.date < from) {
      openingBalance = round2(openingBalance + r.line.invoiced - r.line.paid);
    } else if (to && r.date > to) {
      continue;
    } else {
      inRange.push(r);
    }
  }

  let balance = openingBalance;
  let invoiced = 0;
  let paid = 0;
  const lines: VendorStatementLine[] = inRange.map((r) => {
    balance = round2(balance + r.line.invoiced - r.line.paid);
    invoiced = round2(invoiced + r.line.invoiced);
    paid = round2(paid + r.line.paid);
    return { ...r.line, balance };
  });

  return {
    openingBalance,
    lines,
    totals: { invoiced, paid, outstanding: balance },
  };
}

/**
 * Loads the vendor's expenses + payments within the caller's scope and merges
 * them into a statement. `propertyIds` comes from getAccessiblePropertyIds();
 * property-less rows follow the CLAUDE.md org-scoping rules (session org or
 * grandfathered null; super-admin — orgId null — sees all).
 */
export async function buildVendorStatement(
  vendorId: string,
  scope: { orgId: string | null; propertyIds: string[] },
  from?: Date | null,
  to?: Date | null
): Promise<VendorStatement | null> {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: { id: true, name: true, category: true, isActive: true, organizationId: true },
  });
  if (!vendor) return null;

  const orgArm = scope.orgId
    ? { OR: [{ organizationId: scope.orgId }, { organizationId: null }] }
    : {};

  const [expenses, payments] = await Promise.all([
    prisma.expenseEntry.findMany({
      where: {
        vendorId,
        OR: [
          { propertyId: { in: scope.propertyIds } },
          { unit: { propertyId: { in: scope.propertyIds } } },
          { AND: [{ propertyId: null }, { unitId: null }, orgArm] },
        ],
      },
      select: {
        id: true, date: true, dueDate: true, amount: true, vatAmount: true,
        amountPaid: true, description: true, category: true,
        paymentDate: true, paymentMethod: true, paymentReference: true,
        property: { select: { name: true, currency: true } },
        unit: { select: { property: { select: { name: true, currency: true } } } },
        lineItems: { select: { amountPaid: true } },
        vendorPaymentAllocations: { select: { id: true }, take: 1 },
      },
      orderBy: { date: "asc" },
    }),
    prisma.vendorPayment.findMany({
      where: { vendorId, ...orgArm },
      select: {
        id: true, paymentDate: true, amount: true, paymentMethod: true, reference: true,
      },
      orderBy: { paymentDate: "asc" },
    }),
  ]);

  const withNames = expenses.map((e) => ({
    ...e,
    propertyName: e.property?.name ?? e.unit?.property?.name ?? null,
    propertyCurrency: e.property?.currency ?? e.unit?.property?.currency ?? null,
  }));

  // Currency: most frequent among the expenses' properties. Property-less
  // statements fall back to the first accessible property, then KES.
  const derived = deriveVendorCurrency(withNames.map((e) => e.propertyCurrency));
  let currency = derived.currency;
  const mixedCurrencies = derived.mixedCurrencies;
  if (!currency) {
    const fallback = scope.propertyIds.length
      ? await prisma.property.findFirst({
          where: { id: { in: scope.propertyIds } },
          select: { currency: true },
        })
      : null;
    currency = fallback?.currency ?? "KES";
  }

  // Payments recorded directly on the expense (the pre-VendorPayment flow:
  // amountPaid / paymentDate on the row itself) still have to appear on the
  // statement, or every historically-settled expense would inflate the vendor
  // balance forever. Expenses that carry allocations are skipped — their
  // amountPaid mirrors the allocation sum, and the VendorPayment lines already
  // cover it (counting both would double-pay).
  const manualPayments: StatementPayment[] = withNames
    .filter((e) => e.vendorPaymentAllocations.length === 0)
    .map((e) => ({ e, paid: calcExpensePayment(e).paid }))
    .filter(({ paid }) => paid > 0)
    .map(({ e, paid }) => ({
      id: `manual-${e.id}`,
      paymentDate: e.paymentDate ?? e.date,
      amount: paid,
      paymentMethod: e.paymentMethod,
      reference: e.paymentReference,
      description: `Paid on expense${e.description ? ` — ${e.description}` : ""}`,
    }));

  const merged = computeVendorStatement(withNames, [...payments, ...manualPayments], from, to);

  const openItems: VendorOpenItem[] = withNames
    .map((e) => {
      const pay = calcExpensePayment(e);
      return {
        id: e.id,
        date: new Date(e.date).toISOString(),
        dueDate: e.dueDate ? new Date(e.dueDate).toISOString() : null,
        category: e.category as string,
        categoryLabel:
          EXPENSE_CATEGORY_LABELS[e.category as keyof typeof EXPENSE_CATEGORY_LABELS] ?? (e.category as string),
        description: e.description,
        propertyName: e.propertyName,
        hasLineItems: e.lineItems.length > 0,
        total: pay.total,
        paid: pay.paid,
        outstanding: pay.outstanding,
      };
    })
    .filter((i) => i.outstanding > 0);

  return {
    vendor: { id: vendor.id, name: vendor.name, category: vendor.category, isActive: vendor.isActive },
    currency,
    mixedCurrencies,
    ...merged,
    openItems,
  };
}
