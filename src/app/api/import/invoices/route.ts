import { requireManagerWrite, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { matchImportedInvoicePayments } from "@/lib/invoice-import-match";

export const maxDuration = 60;

/**
 * Historic-invoice importer. Creates Invoice rows for past billing periods
 * and AUTO-LINKS each one to the tenant's existing recorded payments so the
 * two failure modes of retrofitted history can't happen:
 *   - no reverse orphans (PAID invoices with no payment behind them)
 *   - no false arrears (unpaid rows for rent that was actually collected)
 *
 * Status is therefore DERIVED, never supplied: the matching payments (same
 * tenant, dated inside the billing month or within 7 days of the due date —
 * one for the total on a rent-only invoice, one of the right type per line
 * otherwise; src/lib/invoice-import-match.ts) → PAID + linked. Zero or multiple
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
  depositAmount?: string | number;
  leaseFee?: string | number;
  wifiAmount?: string | number;
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
        select: {
          tenantId: true, periodYear: true, periodMonth: true, rentAmount: true, status: true,
          serviceCharge: true, otherCharges: true, depositAmount: true, leaseFee: true, wifiAmount: true,
        },
      }),
      // Invoice numbers are globally unique — load them all (small table).
      prisma.invoice.findMany({ select: { invoiceNumber: true } }),
    ]);

    const tenantIds = units.flatMap((u) => u.tenants.map((t) => t.id));
    const unlinkedPayments = await prisma.incomeEntry.findMany({
      where: {
        tenantId: { in: tenantIds },
        invoiceId: null,
        // DEPOSIT / LEASE_FEE so a move-in row can match its typed receipts.
        type: { in: [...LINKABLE_TYPES, "DEPOSIT", "LEASE_FEE"] },
      },
      select: { id: true, tenantId: true, date: true, grossAmount: true, type: true, utilityType: true },
    });
    const paymentsByTenant = new Map<string, typeof unlinkedPayments>();
    for (const p of unlinkedPayments) {
      const list = paymentsByTenant.get(p.tenantId!) ?? [];
      list.push(p);
      paymentsByTenant.set(p.tenantId!, list);
    }

    // Only one RENT invoice per tenant per month; deposit / fee-only invoices may sit beside it.
    const periodTaken = new Set(
      existingInvoices.filter((i) => i.rentAmount > 0 && i.status !== "CANCELLED").map((i) => `${i.tenantId}:${i.periodYear}-${i.periodMonth}`),
    );
    // A deposit / fee-only row (rent 0) has no period rule, so a re-uploaded
    // file is caught by the same lines on the same period instead.
    const feeOnlyKey = (tenantId: string, y: number, m: number, l: { serviceCharge: number; otherCharges: number; depositAmount: number; leaseFee: number; wifiAmount: number }) =>
      [tenantId, y, m, l.serviceCharge, l.otherCharges, l.depositAmount, l.leaseFee, l.wifiAmount].map((v) => (typeof v === "number" ? v.toFixed(2) : v)).join(":");
    const feeOnlyTaken = new Set(
      existingInvoices
        .filter((i) => !(i.rentAmount > 0) && i.status !== "CANCELLED")
        .map((i) => feeOnlyKey(i.tenantId, i.periodYear, i.periodMonth, {
          serviceCharge: Number(i.serviceCharge ?? 0), otherCharges: Number(i.otherCharges ?? 0), depositAmount: Number(i.depositAmount ?? 0),
          leaseFee: Number(i.leaseFee ?? 0), wifiAmount: Number(i.wifiAmount ?? 0),
        })),
    );
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
        depositAmount: number;
        leaseFee: number;
        wifiAmount: number;
        totalAmount: number;
        dueDate: Date;
        status: "PAID" | "SENT" | "OVERDUE";
        paidAt: Date | null;
        paidAmount: number | null;
        notes: string | null;
      };
      paymentIds: string[];
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
      const depositAmount = parseFloat(String(row.depositAmount ?? "0")) || 0;
      const leaseFee = parseFloat(String(row.leaseFee ?? "0")) || 0;
      // Wi-Fi line — paid after water and electricity, booked as UTILITY_RECOVERY / WIFI.
      const wifiAmount = Math.max(0, parseFloat(String(row.wifiAmount ?? "0")) || 0);

      const lineTotal = (isNaN(rentAmount) ? 0 : rentAmount) + serviceCharge + otherCharges + depositAmount + leaseFee + wifiAmount;
      if (!tenantName || !unitNumber || isNaN(periodYear) || isNaN(periodMonth) || isNaN(rentAmount) || rentAmount < 0 || lineTotal <= 0) {
        errors.push({ row: rowNum, reason: "Tenant Name, Unit Number, Period Year, Period Month and Rent Amount (0 for a deposit / fee-only invoice) are required, and the invoice must total more than 0" });
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
      if (rentAmount > 0 && periodTaken.has(periodKey)) {
        errors.push({ row: rowNum, reason: `A rent invoice already exists for ${tenantName}, ${periodYear}-${String(periodMonth).padStart(2, "0")}` });
        skipped++;
        continue;
      }
      if (rentAmount > 0) periodTaken.add(periodKey);
      if (!(rentAmount > 0)) {
        const key = feeOnlyKey(tenant.id, periodYear, periodMonth, { serviceCharge, otherCharges, depositAmount, leaseFee, wifiAmount });
        if (feeOnlyTaken.has(key)) {
          errors.push({ row: rowNum, reason: `The same deposit / fee invoice already exists for ${tenantName}, ${periodYear}-${String(periodMonth).padStart(2, "0")}` });
          skipped++;
          continue;
        }
        feeOnlyTaken.add(key);
      }

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

      const totalAmount = rentAmount + serviceCharge + otherCharges + depositAmount + leaseFee + wifiAmount;

      // Auto-link. A rent-only invoice: exactly one unclaimed rent-side payment
      // for the total. An invoice with deposit / lease fee / Wi-Fi lines: one
      // payment of the right TYPE per line (rent side, DEPOSIT, LEASE_FEE,
      // Wi-Fi utility recovery) — a single lump payment is never linked, as it
      // would book the deposit or Wi-Fi as rent.
      const inWindow = (p: { date: Date }) =>
        (p.date.getUTCFullYear() === periodYear && p.date.getUTCMonth() + 1 === periodMonth) ||
        Math.abs(p.date.getTime() - dueDate.getTime()) <= DUE_DATE_TOLERANCE_MS;
      const pool = (paymentsByTenant.get(tenant.id) ?? []).filter((p) => !claimedPaymentIds.has(p.id) && inWindow(p));
      const match = matchImportedInvoicePayments(pool, {
        rentSide: rentAmount + serviceCharge + otherCharges,
        deposit: depositAmount,
        leaseFee,
        wifi: wifiAmount,
      });
      const matchedIds = match.outcome === "matched" ? match.ids : [];
      const ambiguous = match.outcome === "ambiguous";
      if (match.outcome === "lump") {
        errors.push({ row: rowNum, reason: `${tenantName} ${periodYear}-${String(periodMonth).padStart(2, "0")}: one payment covers the whole invoice, but it would book the deposit / lease fee / Wi-Fi as rent — imported unpaid; link it with Link… on the Income page` });
      }
      for (const id of matchedIds) claimedPaymentIds.add(id);
      const matched = matchedIds.length > 0;
      if (ambiguous) {
        errors.push({ row: rowNum, reason: `${tenantName} ${periodYear}-${String(periodMonth).padStart(2, "0")}: more than one payment matches — imported unpaid; allocate manually via Link… on the Income page` });
      }
      const paidAt = matched
        ? pool.filter((p) => matchedIds.includes(p.id)).reduce((d, p) => (p.date > d ? p.date : d), new Date(0))
        : null;

      creations.push({
        data: {
          invoiceNumber,
          tenantId: tenant.id,
          periodYear,
          periodMonth,
          rentAmount,
          serviceCharge,
          otherCharges,
          depositAmount,
          leaseFee,
          wifiAmount,
          totalAmount,
          dueDate,
          status: matched ? "PAID" : dueDate < now ? "OVERDUE" : "SENT",
          paidAt,
          paidAmount: matched ? totalAmount : null,
          notes: row.notes?.trim() || null,
        },
        paymentIds: matchedIds,
      });
    }

    // Bulk create, then resolve ids by invoiceNumber (unique) to write links.
    let linked = 0;
    if (creations.length > 0) {
      await prisma.invoice.createMany({ data: creations.map((c) => c.data) });

      const withLinks = creations.filter((c) => c.paymentIds.length > 0);
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
            chunk.flatMap((c) =>
              c.paymentIds.map((paymentId) =>
                prisma.incomeEntry.updateMany({
                  where: { id: paymentId, invoiceId: null },
                  data: { invoiceId: idByNumber.get(c.data.invoiceNumber)! },
                }),
              ),
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
