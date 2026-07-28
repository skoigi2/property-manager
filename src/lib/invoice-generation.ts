import { prisma } from "@/lib/prisma";
import { format } from "date-fns";
import { scheduledExpectedForMonth, frequencyMonths } from "@/lib/rent-schedule";
import { resolveExpectedRent } from "@/lib/rent-resolution";
import { allocateInvoiceNumber } from "@/lib/invoice-numbering";

// Shared monthly rent-invoice generation. Used by POST /api/invoices/bulk
// (manager-clicked "Generate All") and the AUTO_INVOICE_GENERATION cron
// automation, so both paths bill identically: schedule-aware (quarterly/annual
// payers get one invoice on their billing month), escalation-aware
// (RentHistory), idempotent via @@unique([tenantId, periodYear, periodMonth]).

export interface InvoicingTenant {
  id: string;
  name: string;
  monthlyRent: number | null;
  serviceCharge: number;
  leaseStart: Date;
  paymentFrequency?: string | null;
  rentHistory: { monthlyRent: number; effectiveDate: Date }[];
}

export interface GenerateInvoicesResult {
  /** Invoices actually created this call. */
  created: { invoiceId: string; tenantId: string; tenantName: string }[];
  /** Tenant already had an invoice for the period. */
  skipped: { tenantId: string; tenantName: string }[];
  /** Not due this month (covered by quarterly/annual advance billing). */
  notDue: { tenantId: string; tenantName: string }[];
  errors: { tenantId: string; tenant: string; error: string }[];
}

export async function generateInvoicesForTenants(opts: {
  tenants: InvoicingTenant[];
  year: number;
  month: number; // 1-12
  dueDayOfMonth?: number; // default 5
  /** Status stamped on created invoices. The manual bulk flow keeps "SENT";
   *  the automation creates DRAFT and flips to SENT only once emailed. */
  status?: "DRAFT" | "SENT";
  /** Note prefix, e.g. "Auto-generated" (default). */
  notePrefix?: string;
}): Promise<GenerateInvoicesResult> {
  const { tenants, year, month } = opts;
  const dueDayOfMonth = opts.dueDayOfMonth ?? 5;
  const status = opts.status ?? "SENT";
  const notePrefix = opts.notePrefix ?? "Auto-generated";

  const result: GenerateInvoicesResult = { created: [], skipped: [], notDue: [], errors: [] };
  if (tenants.length === 0) return result;

  const existingInvoices = await prisma.invoice.findMany({
    where: {
      periodYear: year,
      periodMonth: month,
      tenantId: { in: tenants.map((t) => t.id) },
    },
    select: { tenantId: true },
  });
  const existingTenantIds = new Set(existingInvoices.map((i) => i.tenantId));

  const dueDate = new Date(year, month - 1, dueDayOfMonth);
  const periodStart = new Date(year, month - 1, 1);
  const periodLabel = format(periodStart, "MMM yyyy");

  for (const tenant of tenants) {
    if (existingTenantIds.has(tenant.id)) {
      result.skipped.push({ tenantId: tenant.id, tenantName: tenant.name });
      continue;
    }

    // Schedule-aware billing: quarterly/biannual/annual payers get ONE invoice
    // for the full period on their billing month (anchored to lease start).
    const sched = scheduledExpectedForMonth({
      leaseStart: tenant.leaseStart,
      frequency: tenant.paymentFrequency,
      month: periodStart,
      rentForMonth: (m) => resolveExpectedRent(tenant.rentHistory, tenant.monthlyRent ?? 0, m),
    });
    if (!sched.due) {
      result.notDue.push({ tenantId: tenant.id, tenantName: tenant.name });
      continue;
    }

    const nMonths = frequencyMonths(tenant.paymentFrequency);
    const coveredLabel =
      nMonths > 1
        ? `${format(periodStart, "MMM yyyy")} – ${format(new Date(year, month - 1 + nMonths - 1, 1), "MMM yyyy")}`
        : periodLabel;

    try {
      // Each tenant's number comes from its resolved series (unit/property
      // payment account with its own format, else the org default).
      const invoiceNumber = await allocateInvoiceNumber(tenant.id, periodStart);
      const rentAmount = sched.amount;
      const serviceCharge = (tenant.serviceCharge ?? 0) * nMonths;
      const totalAmount = rentAmount + serviceCharge;

      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber,
          tenantId: tenant.id,
          periodYear: year,
          periodMonth: month,
          rentAmount,
          serviceCharge,
          otherCharges: 0,
          totalAmount,
          dueDate,
          status,
          notes:
            nMonths > 1
              ? `${notePrefix} — ${
                  { 3: "quarterly", 6: "bi-annual", 12: "annual" }[nMonths] ?? `${nMonths}-month`
                } billing covering ${coveredLabel}`
              : `${notePrefix} for ${periodLabel}`,
        },
        select: { id: true },
      });

      result.created.push({ invoiceId: invoice.id, tenantId: tenant.id, tenantName: tenant.name });
    } catch (e) {
      result.errors.push({ tenantId: tenant.id, tenant: tenant.name, error: e instanceof Error ? e.message : "Unknown error" });
    }
  }

  return result;
}
