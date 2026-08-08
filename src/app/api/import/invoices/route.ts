import { requireManagerWrite, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export const maxDuration = 60;

/**
 * Historic-invoice importer. Creates Invoice rows for past billing periods
 * and AUTO-LINKS each one to the tenant's existing recorded payments so the
 * two failure modes of retrofitted history can't happen:
 *   - no reverse orphans (PAID invoices with no payment behind them)
 *   - no false arrears (unpaid rows for rent that was actually collected)
 *
 * Status is therefore DERIVED, never supplied: exactly one matching payment
 * (same tenant, amount equal to the invoice total, dated inside the billing
 * month or within 7 days of the due date) → PAID + linked. Zero or multiple
 * matches → SENT/OVERDUE by due date, reported for the manual "Link…" action
 * on the Income page. No webhooks, hints, or case auto-advance fire — these
 * are historical records, not settle events.
 */

const LINKABLE_TYPES = ["LONGTERM_RENT", "SERVICE_CHARGE", "UTILITY_RECOVERY", "OTHER"] as const;
const DUE_DATE_TOLERANCE_MS = 7 * 86_400_000;

interface InvoiceImportRow {
  tenantName?: string;
  unitNumber?: string;
  propertyName?: string;
  periodYear?: string | number;
  periodMonth?: string | number;
  rentAmount?: string | number;
  serviceCharge?: string | number;
  otherCharges?: string | number;
  dueDate?: string;
  invoiceNumber?: string;
  notes?: string;
}

export async function POST(req: Request) {
  try {
    const { error } = await requireManagerWrite();
    if (error) return error;

    const propertyIds = await getAccessiblePropertyIds();
    if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const rows: InvoiceImportRow[] = body.rows ?? [];
    if (rows.length === 0) return Response.json({ imported: 0, skipped: 0, linked: 0, errors: [] });

    // Preload reference data once — never one query per row.
    const [units, existingInvoices, allInvoiceNumbers] = await Promise.all([
      prisma.unit.findMany({
        where: { propertyId: { in: propertyIds } },
        select: {
          id: true,
          unitNumber: true,
          property: { select: { name: true } },
          tenants: { select: { id: true, name: true } },
        },
      }),
      prisma.invoice.findMany({
        where: { tenant: { unit: { propertyId: { in: propertyIds } } } },
        select: { tenantId: true, periodYear: true, periodMonth: true },
      }),
      // Invoice numbers are globally unique — load them all (small table).
      prisma.invoice.findMany({ select: { invoiceNumber: true } }),
    ]);

    const tenantIds = units.flatMap((u) => u.tenants.map((t) => t.id));
    const unlinkedPayments = await prisma.incomeEntry.findMany({
      where: {
        tenantId: { in: tenantIds },
        invoiceId: null,
        type: { in: [...LINKABLE_TYPES] },
      },
      select: { id: true, tenantId: true, date: true, grossAmount: true },
    });
    const paymentsByTenant = new Map<string, typeof unlinkedPayments>();
    for (const p of unlinkedPayments) {
      const list = paymentsByTenant.get(p.tenantId!) ?? [];
      list.push(p);
      paymentsByTenant.set(p.tenantId!, list);
    }

    const periodTaken = new Set(existingInvoices.map((i) => `${i.tenantId}:${i.periodYear}-${i.periodMonth}`));
    const numberTaken = new Set(allInvoiceNumbers.map((i) => i.invoiceNumber));
    const claimedPaymentIds = new Set<string>();
    const now = new Date();

    type Creation = {
      data: {
        invoiceNumber: string;
        tenantId: string;
        periodYear: number;
        periodMonth: number;
        rentAmount: number;
        serviceCharge: number;
        otherCharges: number;
        totalAmount: number;
        dueDate: Date;
        status: "PAID" | "SENT" | "OVERDUE";
        paidAt: Date | null;
        paidAmount: number | null;
        notes: string | null;
      };
      paymentId: string | null;
    };
    const creations: Creation[] = [];
    let histSeq = 1;
    let skipped = 0;
    const errors: { row: number; reason: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1;

      const tenantName = row.tenantName?.trim();
      const unitNumber = row.unitNumber?.trim();
      const propertyName = row.propertyName?.trim();
      const periodYear = parseInt(String(row.periodYear ?? ""), 10);
      const periodMonth = parseInt(String(row.periodMonth ?? ""), 10);
      const rentAmount = parseFloat(String(row.rentAmount ?? ""));
      const serviceCharge = parseFloat(String(row.serviceCharge ?? "0")) || 0;
      const otherCharges = parseFloat(String(row.otherCharges ?? "0")) || 0;

      if (!tenantName || !unitNumber || isNaN(periodYear) || isNaN(periodMonth) || isNaN(rentAmount) || rentAmount <= 0) {
        errors.push({ row: rowNum, reason: "Tenant Name, Unit Number, Period Year, Period Month and positive Rent Amount are required" });
        skipped++;
        continue;
      }
      if (periodMonth < 1 || periodMonth > 12 || periodYear < 1990 || periodYear > 2100) {
        errors.push({ row: rowNum, reason: "Period Month must be 1–12 and Period Year plausible" });
        skipped++;
        continue;
      }

      const unit = units.find((u) => {
        if (u.unitNumber.toLowerCase() !== unitNumber.toLowerCase()) return false;
        if (propertyName) return u.property.name.toLowerCase() === propertyName.toLowerCase();
        return true;
      });
      if (!unit) {
        errors.push({ row: rowNum, reason: `Unit "${unitNumber}"${propertyName ? ` in "${propertyName}"` : ""} not found` });
        skipped++;
        continue;
      }
      const tenant = unit.tenants.find((t) => t.name.toLowerCase() === tenantName.toLowerCase());
      if (!tenant) {
        errors.push({ row: rowNum, reason: `Tenant "${tenantName}" not found on unit ${unitNumber}` });
        skipped++;
        continue;
      }

      const periodKey = `${tenant.id}:${periodYear}-${periodMonth}`;
      if (periodTaken.has(periodKey)) {
        errors.push({ row: rowNum, reason: `An invoice already exists for ${tenantName}, ${periodYear}-${String(periodMonth).padStart(2, "0")}` });
        skipped++;
        continue;
      }
      periodTaken.add(periodKey);

      const dueDate =
        row.dueDate?.trim() && !isNaN(Date.parse(row.dueDate))
          ? new Date(row.dueDate)
          : new Date(Date.UTC(periodYear, periodMonth - 1, 5));

      let invoiceNumber = row.invoiceNumber?.trim() || "";
      if (invoiceNumber && numberTaken.has(invoiceNumber)) {
        errors.push({ row: rowNum, reason: `Invoice number "${invoiceNumber}" already exists — a HIST- number was generated instead` });
        invoiceNumber = "";
      }
      if (!invoiceNumber) {
        do {
          invoiceNumber = `HIST-${periodYear}-${String(periodMonth).padStart(2, "0")}-${String(histSeq++).padStart(3, "0")}`;
        } while (numberTaken.has(invoiceNumber));
      }
      numberTaken.add(invoiceNumber);

      const totalAmount = rentAmount + serviceCharge + otherCharges;

      // Auto-link: exactly one unclaimed payment matching amount + period.
      const candidates = (paymentsByTenant.get(tenant.id) ?? []).filter((p) => {
        if (claimedPaymentIds.has(p.id)) return false;
        if (Math.abs(p.grossAmount - totalAmount) >= 0.01) return false;
        const inBillingMonth =
          p.date.getUTCFullYear() === periodYear && p.date.getUTCMonth() + 1 === periodMonth;
        const nearDue = Math.abs(p.date.getTime() - dueDate.getTime()) <= DUE_DATE_TOLERANCE_MS;
        return inBillingMonth || nearDue;
      });

      const matched = candidates.length === 1 ? candidates[0] : null;
      if (matched) claimedPaymentIds.add(matched.id);
      if (candidates.length > 1) {
        errors.push({ row: rowNum, reason: `${tenantName} ${periodYear}-${String(periodMonth).padStart(2, "0")}: ${candidates.length} payments match — imported unpaid; allocate manually via Link… on the Income page` });
      }

      creations.push({
        data: {
          invoiceNumber,
          tenantId: tenant.id,
          periodYear,
          periodMonth,
          rentAmount,
          serviceCharge,
          otherCharges,
          totalAmount,
          dueDate,
          status: matched ? "PAID" : dueDate < now ? "OVERDUE" : "SENT",
          paidAt: matched ? matched.date : null,
          paidAmount: matched ? totalAmount : null,
          notes: row.notes?.trim() || null,
        },
        paymentId: matched?.id ?? null,
      });
    }

    // Bulk create, then resolve ids by invoiceNumber (unique) to write links.
    let linked = 0;
    if (creations.length > 0) {
      await prisma.invoice.createMany({ data: creations.map((c) => c.data) });

      const withLinks = creations.filter((c) => c.paymentId);
      if (withLinks.length > 0) {
        const created = await prisma.invoice.findMany({
          where: { invoiceNumber: { in: withLinks.map((c) => c.data.invoiceNumber) } },
          select: { id: true, invoiceNumber: true },
        });
        const idByNumber = new Map(created.map((c) => [c.invoiceNumber, c.id]));

        const CHUNK = 50;
        for (let i = 0; i < withLinks.length; i += CHUNK) {
          const chunk = withLinks.slice(i, i + CHUNK);
          const results = await prisma.$transaction(
            chunk.map((c) =>
              prisma.incomeEntry.updateMany({
                where: { id: c.paymentId!, invoiceId: null },
                data: { invoiceId: idByNumber.get(c.data.invoiceNumber)! },
              })
            )
          );
          linked += results.reduce((s, r) => s + r.count, 0);
        }
      }
    }

    return Response.json({ imported: creations.length, skipped, linked, errors });
  } catch (err) {
    console.error("[POST /api/import/invoices] failed:", err);
    return Response.json(
      { error: "Invoice import failed", detail: (err as Error).message },
      { status: 500 },
    );
  }
}
