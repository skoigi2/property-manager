import { prisma } from "@/lib/prisma";
import { getLeaseYearRange } from "@/lib/date-utils";

/**
 * Tenant Statement of Account — pure builder shared by the manager JSON/PDF
 * routes, the email path, and the portal routes, so the surfaces can't drift
 * (same pattern as owner-statement.ts).
 *
 * Design constraints that came out of the Phase 0 diagnostic:
 * - Invoice has NO issueDate column: invoices are bucketed by their billing
 *   period (periodYear/periodMonth) — an invoice belongs to the month it
 *   bills. createdAt is only an ordering tiebreak.
 * - IncomeEntry.type is the LOAD-BEARING filter. Mayfair Suites is a LONGTERM
 *   property carrying AIRBNB-typed income, so type cannot be inferred from
 *   PropertyType. Only LONGTERM_RENT / SERVICE_CHARGE / UTILITY_RECOVERY /
 *   OTHER are tenancy payments. DEPOSIT has its own block (would double-count
 *   in the ledger); AIRBNB is not a tenancy payment.
 * - The primary failure mode is the EMPTY statement, not bad numbers: legacy
 *   properties hold payments with tenantId = null which can never appear on
 *   any tenant statement. The coverage block measures this and isEmpty makes
 *   the callers refuse to render/email.
 */

export const STATEMENT_INCOME_TYPES = [
  "LONGTERM_RENT",
  "SERVICE_CHARGE",
  "UTILITY_RECOVERY",
  "OTHER",
] as const;

export type StatementMode = "lease-year" | "tenancy" | "calendar-year" | "custom";

export interface StatementPeriod {
  mode: StatementMode;
  /** Inclusive day bounds (UTC midnight). */
  start: Date;
  end: Date;
  label: string;
  leaseYearNumber?: number;
}

export type PeriodResolution =
  | { ok: true; period: StatementPeriod }
  | { ok: false; code: "NO_PERIOD" | "INVALID_RANGE"; reason: string };

const MAX_CUSTOM_RANGE_MS = 5 * 366 * 86_400_000; // cap custom at ~5 years

function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function fmtDay(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function resolveStatementPeriod(
  tenant: { leaseStart: Date; leaseEnd: Date | null; vacatedDate: Date | null },
  opts: { mode: StatementMode; year?: number; from?: Date; to?: Date; asOf?: Date },
): PeriodResolution {
  const asOf = utcDay(opts.asOf ?? new Date());
  const leaseStart = utcDay(tenant.leaseStart);

  if (asOf < leaseStart) {
    return {
      ok: false,
      code: "NO_PERIOD",
      reason: `The lease starts on ${fmtDay(leaseStart)} — there is no statement period yet.`,
    };
  }

  // Observation cap: nothing after today, the lease end, or the vacate date.
  let cap = asOf;
  if (tenant.leaseEnd && utcDay(tenant.leaseEnd) < cap) cap = utcDay(tenant.leaseEnd);
  if (tenant.vacatedDate && utcDay(tenant.vacatedDate) < cap) cap = utcDay(tenant.vacatedDate);
  if (cap < leaseStart) cap = leaseStart;

  switch (opts.mode) {
    case "lease-year": {
      const range = getLeaseYearRange(leaseStart, asOf, tenant.leaseEnd, tenant.vacatedDate);
      if (!range) {
        return { ok: false, code: "NO_PERIOD", reason: "The lease has not started yet." };
      }
      return {
        ok: true,
        period: {
          mode: "lease-year",
          start: range.start,
          end: range.end,
          leaseYearNumber: range.yearNumber,
          label: `Lease Year ${range.yearNumber} (${fmtDay(range.start)} – ${fmtDay(range.end)})`,
        },
      };
    }
    case "tenancy": {
      return {
        ok: true,
        period: {
          mode: "tenancy",
          start: leaseStart,
          end: cap,
          label: `Full tenancy (${fmtDay(leaseStart)} – ${fmtDay(cap)})`,
        },
      };
    }
    case "calendar-year": {
      const year = opts.year ?? asOf.getUTCFullYear();
      const rawStart = new Date(Date.UTC(year, 0, 1));
      const rawEnd = new Date(Date.UTC(year, 11, 31));
      const start = rawStart < leaseStart ? leaseStart : rawStart;
      const end = rawEnd > cap ? cap : rawEnd;
      if (start > end) {
        return {
          ok: false,
          code: "NO_PERIOD",
          reason: `Calendar year ${year} does not overlap this tenancy (${fmtDay(leaseStart)} – ${fmtDay(cap)}).`,
        };
      }
      return { ok: true, period: { mode: "calendar-year", start, end, label: `Calendar year ${year}` } };
    }
    case "custom": {
      if (!opts.from || !opts.to) {
        return { ok: false, code: "INVALID_RANGE", reason: "A custom period needs both a from and a to date." };
      }
      const from = utcDay(opts.from);
      const to = utcDay(opts.to);
      if (to < from) {
        return { ok: false, code: "INVALID_RANGE", reason: "The period end is before its start." };
      }
      if (to.getTime() - from.getTime() > MAX_CUSTOM_RANGE_MS) {
        return { ok: false, code: "INVALID_RANGE", reason: "Custom periods are capped at 5 years." };
      }
      const start = from < leaseStart ? leaseStart : from;
      const end = to > cap ? cap : to;
      if (start > end) {
        return {
          ok: false,
          code: "NO_PERIOD",
          reason: `The requested range does not overlap this tenancy (${fmtDay(leaseStart)} – ${fmtDay(cap)}).`,
        };
      }
      return { ok: true, period: { mode: "custom", start, end, label: `${fmtDay(start)} – ${fmtDay(end)}` } };
    }
  }
}

// ─── Statement shape ─────────────────────────────────────────────────────────

export type StatementLineKind = "OPENING_BALANCE" | "INVOICE" | "LATE_FEE" | "PAYMENT" | "PROOF_PENDING";

export interface StatementLine {
  /** ISO date the line is ordered by. */
  date: string;
  kind: StatementLineKind;
  description: string;
  reference: string | null;
  charge: number | null;
  payment: number | null;
  /** Running balance after this line; null for memo lines (PROOF_PENDING). */
  balance: number | null;
  paymentMethod?: string | null;
  /** PROOF_PENDING only — days since the tenant submitted proof. */
  daysAwaiting?: number;
  /** Payment carries no invoice link — rendered neutrally, never as an alarm. */
  unallocated?: boolean;
}

export interface TenantStatement {
  tenantId: string;
  tenantName: string;
  tenantEmail: string | null;
  tenantPhone: string | null;
  unitNumber: string;
  propertyId: string;
  propertyName: string;
  organizationId: string | null;
  currency: string;
  period: { mode: StatementMode; start: string; end: string; label: string; leaseYearNumber?: number };
  generatedAt: string;
  recordsAsAt: string;
  openingBalance: number;
  lines: StatementLine[];
  breakdown: {
    invoicedRent: number;
    lateFees: number;
    paymentsByType: Record<string, number>;
  };
  deposit: {
    contractual: number;
    /** Sum of DEPOSIT receipts; null when no receipt trail exists. */
    received: number | null;
    settlement: { settledDate: string; depositHeld: number; totalDeductions: number; netRefunded: number } | null;
    checkout: {
      status: string;
      provisional: boolean;
      totalDeductions: number;
      balanceToRefund: number;
      deductions: { description: string; category: string; amount: number }[];
    } | null;
  };
  summary: {
    totalInvoiced: number;
    totalPaid: number;
    /**
     * Raw arithmetic (opening + invoiced − paid). When position is
     * NOT_STATED this number is meaningless (no charges were ever invoiced)
     * and MUST NOT be presented as a balance.
     */
    closingBalance: number;
    /**
     * NOT_STATED = the tenancy has no invoices anywhere in its history but
     * payments exist: a payments-only record. Rendering it as CREDIT would
     * tell the tenant the landlord owes them the sum of all rent ever paid.
     */
    position: "ARREARS" | "CREDIT" | "SETTLED" | "NOT_STATED";
    awaitingConfirmation: { count: number; total: number };
  };
  coverage: {
    monthsInPeriod: number;
    invoiceCount: number;
    paymentCount: number;
    unattributedForProperty: { count: number; total: number };
    isEmpty: boolean;
    emptyReason: string | null;
  };
  warnings: string[];
}

// ─── Pure computation (unit-testable, no Prisma) ─────────────────────────────

export interface StatementInvoiceRow {
  id: string;
  invoiceNumber: string;
  periodYear: number;
  periodMonth: number;
  totalAmount: number;
  lateFeeAmount: number;
  lateFeeAppliedAt: Date | null;
  dueDate: Date;
  status: string;
  paidAmount: number | null;
  proofSubmittedAt: Date | null;
  createdAt: Date;
}

export interface StatementPaymentRow {
  id: string;
  date: Date;
  type: string;
  grossAmount: number;
  paymentMethod: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
}

export interface StatementSourceData {
  tenant: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    depositAmount: number;
  };
  unitNumber: string;
  property: { id: string; name: string; currency: string; organizationId: string | null };
  /** ALL of the tenant's invoices excluding DRAFT/CANCELLED (all-time). */
  invoices: StatementInvoiceRow[];
  /** ALL of the tenant's statement-type income entries (all-time). */
  payments: StatementPaymentRow[];
  depositReceipts: { grossAmount: number }[];
  depositSettlement: {
    settledDate: Date;
    depositHeld: number;
    totalDeductions: number;
    netRefunded: number;
  } | null;
  checkout: {
    status: string;
    totalDeductions: number;
    balanceToRefund: number;
    deductions: { description: string; category: string; amount: number }[];
  } | null;
  /** Property-level entries with tenantId = null overlapping the window. */
  unattributedEntries: { grossAmount: number }[];
}

const MONTH_LABELS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

/** An invoice belongs to the month it bills (no issueDate column exists). */
function invoiceChargeDate(inv: { periodYear: number; periodMonth: number }): Date {
  return new Date(Date.UTC(inv.periodYear, inv.periodMonth - 1, 1));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeTenantStatement(
  src: StatementSourceData,
  period: StatementPeriod,
  opts?: { asOf?: Date },
): TenantStatement {
  const asOf = opts?.asOf ?? new Date();
  const startMs = period.start.getTime();
  const endMs = Date.UTC(
    period.end.getUTCFullYear(), period.end.getUTCMonth(), period.end.getUTCDate(), 23, 59, 59, 999,
  );
  const inWindow = (d: Date) => d.getTime() >= startMs && d.getTime() <= endMs;
  const before = (d: Date) => d.getTime() < startMs;
  const warnings: string[] = [];

  // LOAD-BEARING type filter (defense-in-depth — the builder's query also
  // filters): DEPOSIT is not rent income and AIRBNB is not a tenancy payment.
  // PropertyType cannot be trusted as a proxy (Mayfair Suites is a LONGTERM
  // property carrying AIRBNB-typed entries).
  const tenancyPayments = src.payments.filter((p) =>
    (STATEMENT_INCOME_TYPES as readonly string[]).includes(p.type),
  );

  // Charges: invoice base amount at the billing-period date, plus a distinct
  // late-fee component at lateFeeAppliedAt (never folded into rent).
  type Charge = { date: Date; amount: number; kind: "INVOICE" | "LATE_FEE"; inv: StatementInvoiceRow };
  const charges: Charge[] = [];
  for (const inv of src.invoices) {
    const base = inv.totalAmount - inv.lateFeeAmount;
    charges.push({ date: invoiceChargeDate(inv), amount: base, kind: "INVOICE", inv });
    if (inv.lateFeeAmount > 0) {
      charges.push({ date: inv.lateFeeAppliedAt ?? invoiceChargeDate(inv), amount: inv.lateFeeAmount, kind: "LATE_FEE", inv });
    }
  }

  // Opening balance: the tenant's ENTIRE history before the window — always
  // computed, never assumed. In "tenancy" mode a non-zero opening is a real
  // and legitimate state: tenants often pay before the lease starts to secure
  // the property, which enters the tenancy as a brought-forward credit. That
  // money must stay visible, not be zeroed away.
  const preWindowPayments = tenancyPayments
    .filter((p) => before(p.date))
    .reduce((s, p) => s + p.grossAmount, 0);
  const computedOpening =
    charges.filter((c) => before(c.date)).reduce((s, c) => s + c.amount, 0) - preWindowPayments;
  const openingBalance = round2(computedOpening);
  if (period.mode === "tenancy" && Math.abs(computedOpening) > 0.005) {
    warnings.push(
      computedOpening < 0
        ? `Includes ${round2(-computedOpening)} received before the lease start date (common when a tenant pays early to secure the property) — carried in as a brought-forward credit.`
        : `Charges dated before the lease start were found (net ${round2(computedOpening)}) and are carried in as a brought-forward balance. Review the lease start date if this looks wrong.`,
    );
  }

  const windowCharges = charges
    .filter((c) => inWindow(c.date))
    .sort((a, b) => a.date.getTime() - b.date.getTime() || a.inv.createdAt.getTime() - b.inv.createdAt.getTime());
  const windowPayments = tenancyPayments
    .filter((p) => inWindow(p.date))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  // Merge chronologically; same-day charges precede payments so a payment
  // made the day an invoice lands never shows a transient credit. A payment
  // dated in month M+1 settling month M's invoice is ROUTINE, not an anomaly
  // — the ledger simply orders by date and labels invoices by billing period.
  type Ev = { date: Date; order: number; line: StatementLine; delta: number };
  const events: Ev[] = [];
  for (const c of windowCharges) {
    const periodLabel = `${MONTH_LABELS[c.inv.periodMonth - 1]} ${c.inv.periodYear}`;
    events.push({
      date: c.date,
      order: 0,
      delta: c.amount,
      line: {
        date: c.date.toISOString(),
        kind: c.kind,
        description:
          c.kind === "LATE_FEE"
            ? `Late payment fee — ${c.inv.invoiceNumber}`
            : `Rent invoice — ${periodLabel} (due ${fmtDay(c.inv.dueDate)})`,
        reference: c.inv.invoiceNumber,
        charge: round2(c.amount),
        payment: null,
        balance: null,
      },
    });
  }
  for (const p of windowPayments) {
    events.push({
      date: p.date,
      order: 1,
      delta: -p.grossAmount,
      line: {
        date: p.date.toISOString(),
        kind: "PAYMENT",
        description: p.invoiceNumber
          ? `Payment received — ${p.invoiceNumber}`
          : `Payment received${p.type !== "LONGTERM_RENT" ? ` (${p.type.replace(/_/g, " ").toLowerCase()})` : ""}`,
        reference: p.invoiceNumber,
        charge: null,
        payment: round2(p.grossAmount),
        balance: null,
        paymentMethod: p.paymentMethod,
        unallocated: !p.invoiceId,
      },
    });
  }
  events.sort((a, b) => a.date.getTime() - b.date.getTime() || a.order - b.order);

  let running = openingBalance;
  const lines: StatementLine[] = [
    {
      date: period.start.toISOString(),
      kind: "OPENING_BALANCE",
      description:
        period.mode === "tenancy"
          ? Math.abs(openingBalance) > 0.005
            ? "Brought forward (paid/recorded before lease start)"
            : "Opening balance (start of tenancy)"
          : `Balance brought forward as at ${fmtDay(period.start)}`,
      reference: null,
      charge: null,
      payment: null,
      balance: openingBalance,
    },
  ];
  for (const ev of events) {
    running = round2(running + ev.delta);
    lines.push({ ...ev.line, balance: running });
  }

  // Awaiting-confirmation memos: the tenant has asserted payment (proof
  // submitted) and the manager has not confirmed. These must NOT move the
  // running balance or count toward "total paid" — the tenant would read a
  // lower outstanding figure than they actually owe.
  const pendingProofs = src.invoices.filter(
    (i) => i.status === "PENDING_VERIFICATION" && i.proofSubmittedAt && i.proofSubmittedAt.getTime() <= endMs,
  );
  for (const inv of pendingProofs) {
    const asserted = round2(inv.totalAmount - (inv.paidAmount ?? 0));
    const days = Math.max(0, Math.floor((asOf.getTime() - inv.proofSubmittedAt!.getTime()) / 86_400_000));
    const sortDate = inv.proofSubmittedAt!.getTime() < startMs ? new Date(startMs + 1) : inv.proofSubmittedAt!;
    const line: StatementLine = {
      date: sortDate.toISOString(),
      kind: "PROOF_PENDING",
      description: `* Payment of ${asserted} asserted for ${inv.invoiceNumber} — proof submitted ${fmtDay(inv.proofSubmittedAt!)}, awaiting manager confirmation (${days} day${days === 1 ? "" : "s"})`,
      reference: inv.invoiceNumber,
      charge: null,
      payment: null,
      balance: null,
      daysAwaiting: days,
    };
    // Insert in date order among the rendered lines (after the opening row).
    const idx = lines.findIndex((l) => l.kind !== "OPENING_BALANCE" && new Date(l.date).getTime() > sortDate.getTime());
    if (idx === -1) lines.push(line);
    else lines.splice(idx, 0, line);
  }

  const totalInvoiced = round2(windowCharges.reduce((s, c) => s + c.amount, 0));
  const totalPaid = round2(windowPayments.reduce((s, p) => s + p.grossAmount, 0));
  const closingBalance = round2(openingBalance + totalInvoiced - totalPaid);
  const lateFees = round2(windowCharges.filter((c) => c.kind === "LATE_FEE").reduce((s, c) => s + c.amount, 0));
  const paymentsByType: Record<string, number> = {};
  for (const p of windowPayments) {
    paymentsByType[p.type] = round2((paymentsByType[p.type] ?? 0) + p.grossAmount);
  }

  // Coverage — the defence against the silently blank statement. The period
  // is already clamped to the tenancy, so every month it touches is a month
  // the tenant was (contractually) in occupancy.
  const monthsInPeriod =
    (period.end.getUTCFullYear() * 12 + period.end.getUTCMonth()) -
    (period.start.getUTCFullYear() * 12 + period.start.getUTCMonth()) + 1;
  const invoiceCount = windowCharges.filter((c) => c.kind === "INVOICE").length;
  const paymentCount = windowPayments.length;
  const unattributedForProperty = {
    count: src.unattributedEntries.length,
    total: round2(src.unattributedEntries.reduce((s, e) => s + e.grossAmount, 0)),
  };
  const isEmpty = monthsInPeriod > 0 && invoiceCount === 0 && paymentCount === 0;
  const emptyReason = !isEmpty
    ? null
    : unattributedForProperty.count > 0
      ? `No invoices or tenant-attributed payments exist for this period, but ${src.property.name} holds ${unattributedForProperty.count} payment record(s) totalling ${unattributedForProperty.total} that are not attributed to any tenant. Run the tenant-attribution backfill (npm run statements:backfill-links) or link the entries to tenants, then regenerate.`
      : `No invoices or payments are recorded for this tenant between ${fmtDay(period.start)} and ${fmtDay(period.end)}. If rent was collected in this period it has not been entered in the system.`;

  const depositReceived =
    src.depositReceipts.length > 0
      ? round2(src.depositReceipts.reduce((s, e) => s + e.grossAmount, 0))
      : null;

  // The phantom-credit defence: a tenancy with NO invoices anywhere in its
  // history but payments on record must not be told "you are in credit" —
  // the charges were simply never entered as invoices, so no balance can be
  // stated. The statement becomes a payments-only record: the verdict is
  // NOT_STATED and every running-balance figure is withheld (a balance
  // column marching into the negative reads as credit all the same).
  const positionNotStated = src.invoices.length === 0 && paymentCount > 0;
  // On a payments-only statement the "unallocated" caption is also dropped:
  // when NO invoices exist, every line would carry it, it conveys nothing,
  // and it reads like an error. It stays meaningful only where the tenancy
  // has invoices and one payment conspicuously isn't matched.
  const presentedLines = positionNotStated
    ? lines
        .filter((l) => l.kind !== "OPENING_BALANCE")
        .map((l) => ({ ...l, balance: null, unallocated: false }))
    : lines;
  if (positionNotStated) {
    warnings.push(
      "No invoices are issued for this tenancy — this statement records payments only and does not state a balance owing or in credit.",
    );
  }

  return {
    tenantId: src.tenant.id,
    tenantName: src.tenant.name,
    tenantEmail: src.tenant.email,
    tenantPhone: src.tenant.phone,
    unitNumber: src.unitNumber,
    propertyId: src.property.id,
    propertyName: src.property.name,
    organizationId: src.property.organizationId,
    currency: src.property.currency,
    period: {
      mode: period.mode,
      start: period.start.toISOString(),
      end: period.end.toISOString(),
      label: period.label,
      ...(period.leaseYearNumber ? { leaseYearNumber: period.leaseYearNumber } : {}),
    },
    generatedAt: asOf.toISOString(),
    recordsAsAt: new Date(endMs).toISOString(),
    openingBalance,
    lines: presentedLines,
    breakdown: { invoicedRent: round2(totalInvoiced - lateFees), lateFees, paymentsByType },
    deposit: {
      contractual: src.tenant.depositAmount,
      received: depositReceived,
      settlement: src.depositSettlement
        ? {
            settledDate: src.depositSettlement.settledDate.toISOString(),
            depositHeld: src.depositSettlement.depositHeld,
            totalDeductions: src.depositSettlement.totalDeductions,
            netRefunded: src.depositSettlement.netRefunded,
          }
        : null,
      checkout: src.checkout
        ? {
            status: src.checkout.status,
            provisional: src.checkout.status === "IN_PROGRESS",
            totalDeductions: src.checkout.totalDeductions,
            balanceToRefund: src.checkout.balanceToRefund,
            deductions: src.checkout.deductions,
          }
        : null,
    },
    summary: {
      totalInvoiced,
      totalPaid,
      closingBalance,
      position: positionNotStated
        ? "NOT_STATED"
        : closingBalance > 0.005 ? "ARREARS" : closingBalance < -0.005 ? "CREDIT" : "SETTLED",
      awaitingConfirmation: {
        count: pendingProofs.length,
        total: round2(pendingProofs.reduce((s, i) => s + (i.totalAmount - (i.paidAmount ?? 0)), 0)),
      },
    },
    coverage: {
      monthsInPeriod,
      invoiceCount,
      paymentCount,
      unattributedForProperty,
      isEmpty,
      emptyReason,
    },
    warnings,
  };
}

// ─── Prisma-backed builder ───────────────────────────────────────────────────

export async function buildTenantStatement(tenantId: string, period: StatementPeriod): Promise<TenantStatement | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      depositAmount: true,
      unit: {
        select: {
          unitNumber: true,
          property: { select: { id: true, name: true, currency: true, organizationId: true } },
        },
      },
    },
  });
  if (!tenant) return null;

  const windowStart = period.start;
  const windowEnd = new Date(Date.UTC(
    period.end.getUTCFullYear(), period.end.getUTCMonth(), period.end.getUTCDate(), 23, 59, 59, 999,
  ));

  const [invoices, payments, depositReceipts, depositSettlement, checkout, unattributedAgg] = await Promise.all([
    prisma.invoice.findMany({
      where: { tenantId, status: { notIn: ["DRAFT", "CANCELLED"] } },
      select: {
        id: true, invoiceNumber: true, periodYear: true, periodMonth: true,
        totalAmount: true, lateFeeAmount: true, lateFeeAppliedAt: true,
        dueDate: true, status: true, paidAmount: true, proofSubmittedAt: true, createdAt: true,
      },
    }),
    prisma.incomeEntry.findMany({
      where: { tenantId, type: { in: [...STATEMENT_INCOME_TYPES] } },
      select: {
        id: true, date: true, type: true, grossAmount: true, paymentMethod: true,
        invoiceId: true, invoice: { select: { invoiceNumber: true } },
      },
      orderBy: { date: "asc" },
    }),
    prisma.incomeEntry.findMany({
      where: { tenantId, type: "DEPOSIT" },
      select: { grossAmount: true },
    }),
    prisma.depositSettlement.findUnique({
      where: { tenantId },
      select: { settledDate: true, depositHeld: true, totalDeductions: true, netRefunded: true },
    }),
    prisma.checkoutProcess.findUnique({
      where: { tenantId },
      select: {
        status: true, totalDeductions: true, balanceToRefund: true,
        deductions: { select: { description: true, category: true, amount: true } },
      },
    }),
    prisma.incomeEntry.findMany({
      where: {
        tenantId: null,
        type: { in: [...STATEMENT_INCOME_TYPES] },
        date: { gte: windowStart, lte: windowEnd },
        unit: { propertyId: tenant.unit.property.id },
      },
      select: { grossAmount: true },
    }),
  ]);

  return computeTenantStatement(
    {
      tenant: { id: tenant.id, name: tenant.name, email: tenant.email, phone: tenant.phone, depositAmount: tenant.depositAmount },
      unitNumber: tenant.unit.unitNumber,
      property: tenant.unit.property,
      invoices,
      payments: payments.map((p) => ({
        id: p.id, date: p.date, type: p.type, grossAmount: p.grossAmount,
        paymentMethod: p.paymentMethod, invoiceId: p.invoiceId,
        invoiceNumber: p.invoice?.invoiceNumber ?? null,
      })),
      depositReceipts,
      depositSettlement,
      checkout,
      unattributedEntries: unattributedAgg,
    },
    period,
  );
}

// ─── Branding for the PDF (same precedence as invoice-pdf-data.ts) ──────────

export interface StatementBranding {
  orgName: string | null;
  /** Payment-account company name, when a dedicated account is configured. */
  issuerName: string | null;
  /** Resolved logo: payment account → property → organisation (same precedence as invoice PDFs). */
  logoUrl: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  vatRegistrationNumber: string | null;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankBranch: string | null;
  mpesaPaybill: string | null;
  mpesaAccountNumber: string | null;
  mpesaTill: string | null;
  paymentInstructions: string | null;
}

export async function getStatementBranding(tenantId: string): Promise<StatementBranding> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      unit: {
        select: {
          paymentAccount: true,
          property: {
            select: {
              logoUrl: true,
              organization: {
                select: {
                  name: true, logoUrl: true, address: true, phone: true, email: true, vatRegistrationNumber: true,
                  bankName: true, bankAccountName: true, bankAccountNumber: true, bankBranch: true,
                  mpesaPaybill: true, mpesaAccountNumber: true, mpesaTill: true, paymentInstructions: true,
                },
              },
              agreement: {
                select: {
                  paymentAccount: true,
                  tenantBankName: true, tenantBankAccountName: true, tenantBankAccountNumber: true, tenantBankBranch: true,
                  tenantMpesaPaybill: true, tenantMpesaAccountNumber: true, tenantMpesaTill: true, tenantPaymentInstructions: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const org = tenant?.unit.property.organization ?? null;
  const agreement = tenant?.unit.property.agreement ?? null;
  const account = tenant?.unit.paymentAccount ?? agreement?.paymentAccount ?? null;

  return {
    orgName: org?.name ?? null,
    issuerName: account?.companyName ?? null,
    logoUrl: account?.logoUrl ?? tenant?.unit.property.logoUrl ?? org?.logoUrl ?? null,
    address: org?.address ?? null,
    phone: org?.phone ?? null,
    email: org?.email ?? null,
    vatRegistrationNumber: org?.vatRegistrationNumber ?? null,
    // Payment details resolve dedicated account → agreement overrides →
    // organisation defaults (Settings → Branding → Payment Details).
    bankName: account ? account.bankName : agreement?.tenantBankName ?? org?.bankName ?? null,
    bankAccountName: account ? account.bankAccountName : agreement?.tenantBankAccountName ?? org?.bankAccountName ?? null,
    bankAccountNumber: account ? account.bankAccountNumber : agreement?.tenantBankAccountNumber ?? org?.bankAccountNumber ?? null,
    bankBranch: account ? account.bankBranch : agreement?.tenantBankBranch ?? org?.bankBranch ?? null,
    mpesaPaybill: account ? account.mpesaPaybill : agreement?.tenantMpesaPaybill ?? org?.mpesaPaybill ?? null,
    mpesaAccountNumber: account ? account.mpesaAccountNumber : agreement?.tenantMpesaAccountNumber ?? org?.mpesaAccountNumber ?? null,
    mpesaTill: account ? account.mpesaTill : agreement?.tenantMpesaTill ?? org?.mpesaTill ?? null,
    paymentInstructions: account ? account.paymentInstructions : agreement?.tenantPaymentInstructions ?? org?.paymentInstructions ?? null,
  };
}
