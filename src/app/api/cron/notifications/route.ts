export const dynamic = "force-dynamic";

import { timingSafeEqual } from "crypto";
import {
  checkLeaseExpiries,
  checkOverdueInvoices,
  checkComplianceCertificates,
  checkInsuranceRenewals,
  checkUrgentMaintenance,
  checkVacantUnits,
  checkDepositNotSettled,
  checkRecurringExpensesDue,
  checkLowPettyCash,
  checkNegativeCashflowForecast,
} from "@/lib/notifications/checkers";

function authorize(authHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !authHeader) return false;
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(authHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!authorize(request.headers.get("authorization"))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const start = Date.now();

  const [leases, invoices, compliance, insurance, maintenance, vacant, deposit, recurring, pettyCash, forecast] = await Promise.allSettled([
    checkLeaseExpiries(),
    checkOverdueInvoices(),
    checkComplianceCertificates(),
    checkInsuranceRenewals(),
    checkUrgentMaintenance(),
    checkVacantUnits(),
    checkDepositNotSettled(),
    checkRecurringExpensesDue(),
    checkLowPettyCash(),
    checkNegativeCashflowForecast(),
  ]);

  // Auto-expire DISMISSED hints older than 30 days
  await import("@/lib/prisma").then(({ prisma }) =>
    prisma.actionableHint.updateMany({
      where: { status: "DISMISSED", dismissedAt: { lt: new Date(Date.now() - 30 * 86400_000) } },
      data: { status: "EXPIRED" },
    })
  ).catch(() => {});

  const summary = {
    leaseExpiries:           leases.status      === "fulfilled" ? leases.value      : { error: String(leases.reason) },
    invoicesOverdue:         invoices.status    === "fulfilled" ? invoices.value    : { error: String(invoices.reason) },
    complianceCertificates:  compliance.status  === "fulfilled" ? compliance.value  : { error: String(compliance.reason) },
    insuranceRenewals:       insurance.status   === "fulfilled" ? insurance.value   : { error: String(insurance.reason) },
    urgentMaintenance:       maintenance.status === "fulfilled" ? maintenance.value : { error: String(maintenance.reason) },
    vacantUnits:             vacant.status      === "fulfilled" ? vacant.value      : { error: String(vacant.reason) },
    depositNotSettled:       deposit.status     === "fulfilled" ? deposit.value     : { error: String(deposit.reason) },
    recurringExpensesDue:    recurring.status   === "fulfilled" ? recurring.value   : { error: String(recurring.reason) },
    lowPettyCash:            pettyCash.status   === "fulfilled" ? pettyCash.value   : { error: String(pettyCash.reason) },
    negativeCashflow:        forecast.status    === "fulfilled" ? forecast.value    : { error: String(forecast.reason) },
    durationMs: Date.now() - start,
  };

  console.log("[cron/notifications]", JSON.stringify(summary));

  return Response.json({ ok: true, ...summary });
}
