import "server-only";
import { prisma } from "@/lib/prisma";
import { calcDepositPosition } from "@/lib/deposit";
import { invoiceOutstandingByBucket } from "@/lib/invoice-payment";

// A tenant's money at a glance — rent, Wi-Fi, deposit and what they still owe
// on open invoices, split by line. Shown on inspections to managers, and to
// caretakers only when the organisation turns caretakersSeeTenantMoney on.

export interface TenantMoneySummary {
  currency: string;
  monthlyRent: number;
  serviceCharge: number;
  wifiCharge: number;
  depositContractual: number;
  /** Deposit actually received (DEPOSIT receipts), null when none recorded. */
  depositReceived: number | null;
  outstanding: { rent: number; water: number; electricity: number; wifi: number; deposit: number; leaseFee: number; total: number };
  /** Open invoices whose due date has passed. */
  overdueInvoices: number;
}

const OPEN = ["SENT", "OVERDUE", "PENDING_VERIFICATION"] as const;
const round2 = (n: number) => Math.round(n * 100) / 100;

export async function tenantMoneySummary(tenantId: string): Promise<TenantMoneySummary | null> {
  const [tenant, deposits, invoices] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { monthlyRent: true, serviceCharge: true, wifiCharge: true, depositAmount: true, unit: { select: { property: { select: { currency: true } } } } },
    }),
    prisma.incomeEntry.findMany({ where: { tenantId, type: "DEPOSIT" }, select: { grossAmount: true } }),
    prisma.invoice.findMany({
      where: { tenantId, status: { in: [...OPEN] } },
      select: {
        dueDate: true, paidAmount: true, rentAmount: true, serviceCharge: true, otherCharges: true, lateFeeAmount: true,
        waterAmount: true, electricityAmount: true, wifiAmount: true, depositAmount: true, leaseFee: true,
      },
    }),
  ]);
  if (!tenant) return null;

  const outstanding = { rent: 0, water: 0, electricity: 0, wifi: 0, deposit: 0, leaseFee: 0, total: 0 };
  let overdueInvoices = 0;
  const now = Date.now();
  for (const inv of invoices) {
    const o = invoiceOutstandingByBucket(inv, inv.paidAmount);
    for (const k of Object.keys(outstanding) as (keyof typeof outstanding)[]) outstanding[k] = round2(outstanding[k] + o[k]);
    if (o.total > 0 && inv.dueDate.getTime() < now) overdueInvoices++;
  }
  const deposit = calcDepositPosition(tenant.depositAmount, deposits);

  return {
    currency: tenant.unit?.property?.currency ?? "KES",
    monthlyRent: tenant.monthlyRent,
    serviceCharge: tenant.serviceCharge,
    wifiCharge: tenant.wifiCharge,
    depositContractual: tenant.depositAmount,
    depositReceived: deposit.received,
    outstanding,
    overdueInvoices,
  };
}

/** Whether this organisation lets caretakers see tenant money. */
export async function caretakersSeeMoney(organizationId: string | null | undefined): Promise<boolean> {
  if (!organizationId) return false;
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { caretakersSeeTenantMoney: true } });
  return !!org?.caretakersSeeTenantMoney;
}
