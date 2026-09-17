import "server-only";
import { prisma } from "@/lib/prisma";
import { invoiceOutstandingByBucket, type InvoiceOutstanding } from "@/lib/invoice-payment";
import { DEFAULT_UNIT_LABEL, readingLineLabel, type UtilityType } from "@/lib/utility-billing";

/**
 * What the invoice PDF (manager download, emailed copy and the tenant
 * portal's copy) needs on top of the invoice row:
 * - one described line per attached meter reading
 *   ("Jun 26 Water: 3 units (Prev: 176.00, Curr: 179.00) @ 175.00"), and
 * - what the tenant still owes on their OTHER open invoices, split into
 *   rent / water / electricity so unpaid utility bills are visible.
 */

export interface InvoiceUtilityLine {
  utility: UtilityType;
  label: string;
  amount: number;
}

export interface InvoiceUtilityContext {
  utilityLines: InvoiceUtilityLine[];
  outstanding: InvoiceOutstanding;
}

const OPEN_STATUSES = ["SENT", "OVERDUE", "PENDING_VERIFICATION"] as const;

export async function loadInvoiceUtilityContext(invoiceId: string, tenantId: string, propertyId: string): Promise<InvoiceUtilityContext> {
  const [readings, settings, others] = await Promise.all([
    prisma.meterReading.findMany({
      where: { invoiceId, status: { not: "VOID" } },
      select: {
        periodYear: true, periodMonth: true, previousReading: true, currentReading: true,
        consumption: true, ratePerUnit: true, amount: true,
        meter: { select: { label: true, utility: true } },
      },
      orderBy: [{ periodYear: "asc" }, { periodMonth: "asc" }],
    }),
    prisma.utilitySetting.findMany({ where: { propertyId }, select: { utility: true, unitLabel: true } }),
    prisma.invoice.findMany({
      where: { tenantId, id: { not: invoiceId }, status: { in: [...OPEN_STATUSES] } },
      select: {
        paidAmount: true, rentAmount: true, serviceCharge: true, otherCharges: true, lateFeeAmount: true,
        waterAmount: true, electricityAmount: true, depositAmount: true, leaseFee: true,
      },
    }),
  ]);

  const unitLabel = (u: UtilityType) => settings.find((s) => s.utility === u)?.unitLabel ?? DEFAULT_UNIT_LABEL[u];
  const utilityLines = readings
    .slice()
    .sort((a, b) => a.meter.utility.localeCompare(b.meter.utility) * -1)
    .map((r) => ({
      utility: r.meter.utility,
      amount: r.amount ?? 0,
      label: readingLineLabel({
        periodYear: r.periodYear,
        periodMonth: r.periodMonth,
        label: r.meter.label,
        unitLabel: unitLabel(r.meter.utility),
        previousReading: r.previousReading,
        currentReading: r.currentReading,
        consumption: r.consumption,
        ratePerUnit: r.ratePerUnit,
      }),
    }));

  const outstanding: InvoiceOutstanding = { rent: 0, water: 0, electricity: 0, deposit: 0, leaseFee: 0, total: 0 };
  for (const inv of others) {
    const o = invoiceOutstandingByBucket(inv, inv.paidAmount);
    outstanding.rent += o.rent;
    outstanding.water += o.water;
    outstanding.electricity += o.electricity;
    outstanding.deposit += o.deposit;
    outstanding.leaseFee += o.leaseFee;
    outstanding.total += o.total;
  }
  for (const k of Object.keys(outstanding) as (keyof InvoiceOutstanding)[]) {
    outstanding[k] = Math.round(outstanding[k] * 100) / 100;
  }
  return { utilityLines, outstanding };
}
