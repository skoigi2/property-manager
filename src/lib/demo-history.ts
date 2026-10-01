import "server-only";
import { randomBytes } from "crypto";
import { ExpenseScope, IncomeType, InvoiceStatus, type ExpenseCategory, type PaymentMethod, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { paidHistoryMonths, recurringMonthlyExpenses } from "@/lib/demo-history-plan";

/**
 * Back history for a demo property (run at the end of each demo seed): every
 * tenant gets a PAID invoice + matching LONGTERM_RENT receipt for each billing
 * month between their lease start and the first month the seed already
 * covered, and the property gets its monthly running costs for the same
 * stretch. Without it every demo tenant read as ~9 months in arrears on the
 * tenant page and the Income page's Arrears view (both count from lease start).
 *
 * Metered water / electricity / generator costs are not back-filled on a
 * property with unit meters: there are no matching readings, so they would
 * show as a loss in the utilities reconciliation.
 */
export async function seedPaidHistory(propertyId: string, now: Date = new Date()): Promise<{ invoices: number; expenses: number }> {
  const [property, tenants, meters] = await Promise.all([
    prisma.property.findUniqueOrThrow({ where: { id: propertyId }, select: { name: true, organizationId: true } }),
    prisma.tenant.findMany({
      where: { unit: { propertyId } },
      select: {
        id: true,
        unitId: true,
        isActive: true,
        leaseStart: true,
        leaseEnd: true,
        vacatedDate: true,
        monthlyRent: true,
        serviceCharge: true,
        paymentFrequency: true,
        unit: { select: { unitNumber: true } },
        rentHistory: { select: { monthlyRent: true, effectiveDate: true, appliedAt: true } },
        invoices: { select: { periodYear: true, periodMonth: true } },
        incomeEntries: { where: { type: IncomeType.LONGTERM_RENT }, select: { date: true, paymentMethod: true } },
      },
    }),
    prisma.utilityMeter.count({ where: { propertyId, role: "UNIT", isActive: true } }),
  ]);

  const code = `${property.name.split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 3)}${randomBytes(2).toString("hex").toUpperCase()}`;
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const invoiceRows: Prisma.InvoiceCreateManyInput[] = [];
  const receipts: { invoiceNumber: string; unitId: string; tenantId: string; amount: number; date: Date; method: PaymentMethod | null }[] = [];

  for (const t of tenants) {
    // The first month the seed already has data for — or, for a former tenant
    // with none, the month after they left.
    const seeded = [
      ...t.invoices.map((i) => new Date(i.periodYear, i.periodMonth - 1, 1)),
      ...t.incomeEntries.map((e) => new Date(e.date.getFullYear(), e.date.getMonth(), 1)),
    ];
    const end = !t.isActive ? (t.vacatedDate ?? t.leaseEnd) : null;
    const afterEnd = end ? new Date(end.getFullYear(), end.getMonth() + 1, 1) : thisMonth;
    const cutoff = seeded.length
      ? new Date(Math.min(...seeded.map((d) => d.getTime()), afterEnd.getTime()))
      : afterEnd;

    const months = paidHistoryMonths(
      {
        leaseStart: t.leaseStart,
        monthlyRent: t.monthlyRent,
        serviceCharge: t.serviceCharge,
        paymentFrequency: t.paymentFrequency,
        rentHistory: t.rentHistory,
      },
      cutoff,
    );
    const methods = t.incomeEntries.map((e) => e.paymentMethod).filter(Boolean) as PaymentMethod[];
    const method = methods.sort((a, b) => methods.filter((x) => x === b).length - methods.filter((x) => x === a).length)[0] ?? "BANK_TRANSFER";

    for (const m of months) {
      const total = Math.round((m.rent + m.serviceCharge) * 100) / 100;
      const invoiceNumber = `${code}-${m.year}${String(m.month + 1).padStart(2, "0")}-${t.unit.unitNumber}`;
      const paidOn = new Date(m.year, m.month, 3);
      invoiceRows.push({
        invoiceNumber,
        tenantId: t.id,
        periodYear: m.year,
        periodMonth: m.month + 1,
        rentAmount: m.rent,
        serviceCharge: m.serviceCharge,
        totalAmount: total,
        dueDate: new Date(m.year, m.month, 5),
        status: InvoiceStatus.PAID,
        paidAt: paidOn,
        paidAmount: total,
      });
      receipts.push({ invoiceNumber, unitId: t.unitId, tenantId: t.id, amount: total, date: paidOn, method });
    }
  }

  const created: { id: string; invoiceNumber: string }[] = [];
  for (let i = 0; i < invoiceRows.length; i += 200) {
    created.push(
      ...(await prisma.invoice.createManyAndReturn({ data: invoiceRows.slice(i, i + 200), select: { id: true, invoiceNumber: true } })),
    );
  }
  const idByNumber = new Map(created.map((c) => [c.invoiceNumber, c.id]));
  if (receipts.length) {
    await prisma.incomeEntry.createMany({
      data: receipts.map((r) => ({
        date: r.date,
        unitId: r.unitId,
        tenantId: r.tenantId,
        invoiceId: idByNumber.get(r.invoiceNumber) ?? null,
        type: IncomeType.LONGTERM_RENT,
        grossAmount: r.amount,
        agentCommission: 0,
        paymentMethod: r.method,
        note: "Rent received",
      })),
    });
  }

  // ── Running costs for the same months ───────────────────────────────────────
  const activeStarts = tenants.filter((t) => t.isActive).map((t) => new Date(t.leaseStart.getFullYear(), t.leaseStart.getMonth(), 1).getTime());
  if (activeStarts.length === 0) return { invoices: created.length, expenses: 0 };
  const historyStart = new Date(Math.min(...activeStarts));

  const samples = await prisma.expenseEntry.findMany({
    where: { propertyId, scope: ExpenseScope.PROPERTY, isSunkCost: false },
    select: { category: true, description: true, amount: true, date: true, vatAmount: true, vendorId: true, amountPaid: true, paymentMethod: true },
  });
  if (samples.length === 0) return { invoices: created.length, expenses: 0 };
  const firstSeeded = new Date(Math.min(...samples.map((s) => s.date.getTime())));
  const firstSeededMonth = new Date(firstSeeded.getFullYear(), firstSeeded.getMonth(), 1);
  const metered = meters > 0 ? new Set(["WATER", "ELECTRICITY", "GENERATOR"]) : new Set<string>();
  const monthly = recurringMonthlyExpenses(samples).filter((e) => !metered.has(e.category));
  const extra = new Map(samples.map((s) => [`${s.category}|${s.description ?? ""}|${s.amount}`, s]));

  const expenseRows = [];
  for (let m = new Date(historyStart); m.getTime() < firstSeededMonth.getTime(); m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
    for (const e of monthly) {
      const src = extra.get(`${e.category}|${e.description ?? ""}|${e.amount}`);
      const last = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
      const date = new Date(m.getFullYear(), m.getMonth(), Math.min(e.day, last));
      expenseRows.push({
        date,
        propertyId,
        organizationId: property.organizationId,
        scope: ExpenseScope.PROPERTY,
        category: e.category as ExpenseCategory,
        amount: e.amount,
        vatAmount: src?.vatAmount ?? null,
        vendorId: src?.vendorId ?? null,
        description: e.description,
        isSunkCost: false,
        paidFromPettyCash: false,
        // Settled like the seeded month it was copied from.
        amountPaid: src && src.amountPaid >= e.amount ? e.amount : 0,
        paymentDate: src && src.amountPaid >= e.amount ? date : null,
        paymentMethod: src && src.amountPaid >= e.amount ? src.paymentMethod : null,
      });
    }
  }
  if (expenseRows.length) await prisma.expenseEntry.createMany({ data: expenseRows });
  return { invoices: created.length, expenses: expenseRows.length };
}
