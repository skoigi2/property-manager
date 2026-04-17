export const dynamic = "force-dynamic";

import {
  checkLeaseExpiries,
  checkOverdueInvoices,
  checkComplianceCertificates,
  checkInsuranceRenewals,
  checkUrgentMaintenance,
} from "@/lib/notifications/checkers";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const start = Date.now();

  const [leases, invoices, compliance, insurance, maintenance] = await Promise.allSettled([
    checkLeaseExpiries(),
    checkOverdueInvoices(),
    checkComplianceCertificates(),
    checkInsuranceRenewals(),
    checkUrgentMaintenance(),
  ]);

  const summary = {
    leaseExpiries:           leases.status      === "fulfilled" ? leases.value      : { error: String(leases.reason) },
    invoicesOverdue:         invoices.status    === "fulfilled" ? invoices.value    : { error: String(invoices.reason) },
    complianceCertificates:  compliance.status  === "fulfilled" ? compliance.value  : { error: String(compliance.reason) },
    insuranceRenewals:       insurance.status   === "fulfilled" ? insurance.value   : { error: String(insurance.reason) },
    urgentMaintenance:       maintenance.status === "fulfilled" ? maintenance.value : { error: String(maintenance.reason) },
    durationMs: Date.now() - start,
  };

  console.log("[cron/notifications]", JSON.stringify(summary));

  return Response.json({ ok: true, ...summary });
}
