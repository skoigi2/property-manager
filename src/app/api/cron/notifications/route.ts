export const dynamic = "force-dynamic";

import { timingSafeEqual } from "crypto";
import {
  checkLeaseExpiries,
  checkOverdueInvoices,
  checkComplianceCertificates,
  checkInsuranceRenewals,
  checkAssetWarranties,
  checkStayKeysNotBack,
  checkUrgentMaintenance,
  checkVacantUnits,
  checkDepositNotSettled,
  checkRecurringExpensesDue,
  checkLowPettyCash,
  checkNegativeCashflowForecast,
  checkCaseSlaBreaches,
  checkOwnerMonthlyReports,
  checkTenantRentReminders,
  checkRentIncreasesDue,
} from "@/lib/notifications/checkers";
import { applyDueRentIncreases } from "@/lib/rent-increase";
import { runAutomations } from "@/lib/automations";
import { resetAutomationCache } from "@/lib/automation-registry";
import { sendWeeklyDataHealthReport } from "@/lib/data-health";

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

  // Clear the per-run automation-toggle cache so a warm serverless instance never
  // serves a stale enabled/disabled value from a previous invocation.
  resetAutomationCache();

  // Scheduled rent increases take effect first, so the review checker below
  // sees the new rent and moves each tenant's schedule on.
  const rentIncreases = await applyDueRentIncreases().then(
    (value) => ({ status: "fulfilled" as const, value }),
    (reason) => ({ status: "rejected" as const, reason }),
  );

  const [leases, invoices, compliance, insurance, maintenance, vacant, deposit, recurring, pettyCash, forecast, slaBreaches, automations, ownerReports, tenantReminders, warranties, rentReviews, stayKeys] = await Promise.allSettled([
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
    checkCaseSlaBreaches(),
    runAutomations(),
    checkOwnerMonthlyReports(),
    checkTenantRentReminders(),
    checkAssetWarranties(),
    checkRentIncreasesDue(),
    checkStayKeysNotBack(),
  ]);

  // Weekly (Mondays) data-health report to platform super-admins — only
  // sent when a check finds rows. Never fails the run.
  const dataHealth = await sendWeeklyDataHealthReport().then(
    (value) => ({ status: "fulfilled" as const, value }),
    (reason) => ({ status: "rejected" as const, reason }),
  );

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
    assetWarranties:         warranties.status  === "fulfilled" ? warranties.value  : { error: String(warranties.reason) },
    urgentMaintenance:       maintenance.status === "fulfilled" ? maintenance.value : { error: String(maintenance.reason) },
    vacantUnits:             vacant.status      === "fulfilled" ? vacant.value      : { error: String(vacant.reason) },
    depositNotSettled:       deposit.status     === "fulfilled" ? deposit.value     : { error: String(deposit.reason) },
    recurringExpensesDue:    recurring.status   === "fulfilled" ? recurring.value   : { error: String(recurring.reason) },
    lowPettyCash:            pettyCash.status   === "fulfilled" ? pettyCash.value   : { error: String(pettyCash.reason) },
    negativeCashflow:        forecast.status    === "fulfilled" ? forecast.value    : { error: String(forecast.reason) },
    slaBreaches:             slaBreaches.status === "fulfilled" ? slaBreaches.value : { error: String(slaBreaches.reason) },
    automations:             automations.status === "fulfilled" ? automations.value : { error: String(automations.reason) },
    ownerReports:            ownerReports.status === "fulfilled" ? ownerReports.value : { error: String(ownerReports.reason) },
    tenantRentReminders:     tenantReminders.status === "fulfilled" ? tenantReminders.value : { error: String(tenantReminders.reason) },
    rentIncreasesApplied:    rentIncreases.status === "fulfilled" ? rentIncreases.value : { error: String(rentIncreases.reason) },
    rentReviewsDue:          rentReviews.status === "fulfilled" ? rentReviews.value : { error: String(rentReviews.reason) },
    stayKeysNotBack:         stayKeys.status === "fulfilled" ? stayKeys.value : { error: String(stayKeys.reason) },
    dataHealth:              dataHealth.status === "fulfilled" ? dataHealth.value : { error: String(dataHealth.reason) },
    durationMs: Date.now() - start,
  };

  console.log("[cron/notifications]", JSON.stringify(summary));

  return Response.json({ ok: true, ...summary });
}
