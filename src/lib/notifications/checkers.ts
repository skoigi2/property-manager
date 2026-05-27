import { differenceInDays, differenceInHours, subDays } from "date-fns";
import { NotificationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendNotificationEmail } from "@/lib/email";
import { formatDate } from "@/lib/date-utils";
import { upsertHint } from "@/lib/hints";
import { formatCurrency } from "@/lib/currency";
import { buildForecast } from "@/lib/forecast-engine";
import {
  leaseExpiryTemplate,
  invoiceOverdueTemplate,
  complianceExpiryTemplate,
  insuranceExpiryTemplate,
  urgentMaintenanceTemplate,
} from "./email-templates";

// ─── Shared helpers ───────────────────────────────────────────────────────────

async function wasRecentlySent(
  type: NotificationType,
  resourceId: string,
  withinDays: number,
): Promise<boolean> {
  const cutoff = subDays(new Date(), withinDays);
  const existing = await prisma.notificationLog.findFirst({
    where: { type, resourceId, sentAt: { gte: cutoff } },
    select: { id: true },
  });
  return !!existing;
}

async function recordSent(
  organizationId: string,
  type: NotificationType,
  resourceId: string,
  resourceType: string,
  recipientEmail: string,
  subject: string,
): Promise<void> {
  await prisma.notificationLog.create({
    data: { organizationId, type, resourceId, resourceType, recipientEmail, subject },
  });
}

// Returns all ADMIN (org-admin) + MANAGER users with access to this property
async function getPropertyManagers(
  propertyId: string,
  organizationId: string,
): Promise<{ email: string; name: string }[]> {
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      email: { not: null },
      OR: [
        { organizationId, role: "ADMIN" },
        { role: "MANAGER", propertyAccess: { some: { propertyId } } },
      ],
    },
    select: { email: true, name: true },
  });
  return users.filter((u): u is { email: string; name: string | null } & { email: string } => !!u.email)
    .map(u => ({ email: u.email!, name: u.name ?? u.email! }));
}

async function sendToManagers(
  managers: { email: string; name: string }[],
  subject: string,
  html: string,
  organizationId: string,
  type: NotificationType,
  resourceId: string,
  resourceType: string,
  caseThreadId?: string | null,
): Promise<void> {
  for (const mgr of managers) {
    try {
      await sendNotificationEmail(mgr.email, subject, html, { caseThreadId: caseThreadId ?? null });
      await recordSent(organizationId, type, resourceId, resourceType, mgr.email, subject);
    } catch {
      // Log but don't throw — one bad address shouldn't block others
      console.error(`[notifications] Failed to send ${type} to ${mgr.email}`);
    }
  }
}

/** Look up an existing CaseThread by caseType + subjectId. Returns null when none. */
async function findCaseThreadId(
  caseType: "MAINTENANCE" | "LEASE_RENEWAL" | "ARREARS" | "COMPLIANCE",
  subjectId: string,
): Promise<string | null> {
  const t = await prisma.caseThread.findFirst({
    where: { caseType, subjectId },
    select: { id: true },
  });
  return t?.id ?? null;
}

// ─── Lease expiry checker ─────────────────────────────────────────────────────

export async function checkLeaseExpiries(): Promise<{ sent: number; skipped: number }> {
  const today = new Date();
  let sent = 0, skipped = 0;

  const tenants = await prisma.tenant.findMany({
    where: {
      isActive: true,
      leaseEnd: { gte: today, lte: new Date(today.getTime() + 30 * 86400_000) },
    },
    include: {
      unit: { include: { property: true } },
    },
  });

  for (const tenant of tenants) {
    if (!tenant.leaseEnd || !tenant.unit?.property?.organizationId) continue;

    const days = differenceInDays(tenant.leaseEnd, today);
    const is7D = days <= 7;
    const type: NotificationType = is7D ? "LEASE_EXPIRY_7D" : "LEASE_EXPIRY_30D";
    const dedupDays = is7D ? 6 : 20;

    if (await wasRecentlySent(type, tenant.id, dedupDays)) { skipped++; continue; }

    const orgId = tenant.unit.property.organizationId;
    const managers = await getPropertyManagers(tenant.unit.propertyId, orgId);
    if (managers.length === 0) { skipped++; continue; }

    const unitRef = `${tenant.unit.property.name} — Unit ${tenant.unit.unitNumber}`;
    const { subject, html } = leaseExpiryTemplate({
      tenantName:   tenant.name,
      unitRef,
      propertyName: tenant.unit.property.name,
      leaseEnd:     formatDate(tenant.leaseEnd),
      daysLeft:     days,
      tenantId:     tenant.id,
    });

    const caseThreadId = await findCaseThreadId("LEASE_RENEWAL", tenant.id);
    await sendToManagers(managers, subject, html, orgId, type, tenant.id, "Tenant", caseThreadId);

    // Hint
    await upsertHint({
      organizationId: orgId,
      propertyId: tenant.unit.propertyId,
      unitId: tenant.unitId,
      tenantId: tenant.id,
      caseThreadId,
      hintType: is7D ? "LEASE_EXPIRY_7D" : "LEASE_EXPIRY_30D",
      refId: tenant.id,
      severity: is7D ? "URGENT" : "WARNING",
      title: `Lease expiring — ${tenant.name}`,
      subtitle: `${unitRef} · ${days} day${days === 1 ? "" : "s"} until ${formatDate(tenant.leaseEnd)}`,
      suggestedAction: `Send renewal offer to ${tenant.name}`,
      actionEndpoint: `/api/tenants/${tenant.id}/renewal`,
      actionMethod: "PATCH",
      actionBody: { renewalStage: "NOTICE_SENT" },
      actionLabel: "Mark NOTICE_SENT",
      expiresAt: tenant.leaseEnd,
    });

    sent += managers.length;
  }

  return { sent, skipped };
}

// ─── Overdue invoice checker ──────────────────────────────────────────────────

export async function checkOverdueInvoices(): Promise<{ sent: number; skipped: number }> {
  const cutoff = subDays(new Date(), 7);
  let sent = 0, skipped = 0;

  const invoices = await prisma.invoice.findMany({
    where: {
      status: { in: ["SENT", "OVERDUE"] },
      dueDate: { lte: cutoff },
    },
    include: {
      tenant: {
        include: {
          unit: { include: { property: true } },
        },
      },
    },
  });

  for (const invoice of invoices) {
    if (!invoice.tenant?.unit?.property?.organizationId) continue;

    const type: NotificationType = "INVOICE_OVERDUE";
    if (await wasRecentlySent(type, invoice.id, 7)) { skipped++; continue; }

    const orgId = invoice.tenant.unit.property.organizationId;
    const managers = await getPropertyManagers(invoice.tenant.unit.propertyId, orgId);
    if (managers.length === 0) { skipped++; continue; }

    const daysOverdue = differenceInDays(new Date(), invoice.dueDate);
    const currency = invoice.tenant.unit.property.currency ?? "USD";
    const amount = new Intl.NumberFormat("en-US", { style: "currency", currency }).format(invoice.totalAmount);
    const unitRef = `${invoice.tenant.unit.property.name} — Unit ${invoice.tenant.unit.unitNumber}`;

    const { subject, html } = invoiceOverdueTemplate({
      tenantName:    invoice.tenant.name,
      unitRef,
      propertyName:  invoice.tenant.unit.property.name,
      invoiceNumber: invoice.invoiceNumber,
      amount,
      dueDate:       formatDate(invoice.dueDate),
      daysOverdue,
      invoiceId:     invoice.id,
    });

    // Try to find an open arrears case for this tenant; otherwise no caseThreadId
    const caseThreadId = await prisma.caseThread.findFirst({
      where: { caseType: "ARREARS", subjectId: invoice.tenantId, status: { notIn: ["RESOLVED", "CLOSED"] } },
      select: { id: true },
    }).then((t) => t?.id ?? null);
    await sendToManagers(managers, subject, html, orgId, type, invoice.id, "Invoice", caseThreadId);

    await upsertHint({
      organizationId: orgId,
      propertyId: invoice.tenant.unit.propertyId,
      unitId: invoice.tenant.unitId,
      tenantId: invoice.tenant.id,
      caseThreadId,
      hintType: "INVOICE_OVERDUE",
      refId: invoice.id,
      severity: daysOverdue >= 30 ? "URGENT" : "WARNING",
      title: `Rent overdue — ${invoice.tenant.name}`,
      subtitle: `${amount} · ${daysOverdue} day${daysOverdue === 1 ? "" : "s"} overdue`,
      suggestedAction: "Send rent reminder",
      actionEndpoint: `/api/invoices/${invoice.id}`,
      actionMethod: "PATCH",
      actionBody: { status: "PAID" },
      actionLabel: "Mark paid",
    });

    sent += managers.length;
  }

  return { sent, skipped };
}

// ─── Compliance certificate checker ──────────────────────────────────────────

export async function checkComplianceCertificates(): Promise<{ sent: number; skipped: number }> {
  const today = new Date();
  let sent = 0, skipped = 0;

  const certs = await prisma.complianceCertificate.findMany({
    where: {
      expiryDate: { gte: today, lte: new Date(today.getTime() + 30 * 86400_000) },
      organizationId: { not: null },
    },
    include: { property: true },
  });

  for (const cert of certs) {
    if (!cert.expiryDate || !cert.organizationId) continue;

    const days = differenceInDays(cert.expiryDate, today);
    const is7D = days <= 7;
    const type: NotificationType = is7D ? "COMPLIANCE_EXPIRY_7D" : "COMPLIANCE_EXPIRY_30D";
    const dedupDays = is7D ? 6 : 20;

    if (await wasRecentlySent(type, cert.id, dedupDays)) { skipped++; continue; }

    const managers = await getPropertyManagers(cert.propertyId, cert.organizationId);
    if (managers.length === 0) { skipped++; continue; }

    const { subject, html } = complianceExpiryTemplate({
      certificateType: cert.certificateType,
      propertyName:    cert.property.name,
      expiryDate:      formatDate(cert.expiryDate),
      daysLeft:        days,
      propertyId:      cert.propertyId,
    });

    const caseThreadId = await findCaseThreadId("COMPLIANCE", cert.id);
    await sendToManagers(managers, subject, html, cert.organizationId, type, cert.id, "ComplianceCertificate", caseThreadId);

    await upsertHint({
      organizationId: cert.organizationId,
      propertyId: cert.propertyId,
      caseThreadId,
      hintType: is7D ? "COMPLIANCE_EXPIRY_7D" : "COMPLIANCE_EXPIRY_30D",
      refId: cert.id,
      severity: is7D ? "URGENT" : "WARNING",
      title: `${cert.certificateType} certificate expiring`,
      subtitle: `${cert.property.name} · ${days} day${days === 1 ? "" : "s"} left`,
      suggestedAction: "Mark renewed",
      actionEndpoint: `/api/compliance/certificates/${cert.id}`,
      actionMethod: "PATCH",
      actionLabel: "Open certificate",
      expiresAt: cert.expiryDate,
    });

    sent += managers.length;
  }

  return { sent, skipped };
}

// ─── Insurance renewal checker ────────────────────────────────────────────────

export async function checkInsuranceRenewals(): Promise<{ sent: number; skipped: number }> {
  const today = new Date();
  let sent = 0, skipped = 0;

  const policies = await prisma.insurancePolicy.findMany({
    where: {
      endDate: { gte: today, lte: new Date(today.getTime() + 30 * 86400_000) },
    },
    include: { property: true },
  });

  for (const policy of policies) {
    const orgId = policy.property.organizationId;
    if (!orgId) continue;

    const days = differenceInDays(policy.endDate, today);
    const is7D = days <= 7;
    const type: NotificationType = is7D ? "INSURANCE_EXPIRY_7D" : "INSURANCE_EXPIRY_30D";
    const dedupDays = is7D ? 6 : 20;

    if (await wasRecentlySent(type, policy.id, dedupDays)) { skipped++; continue; }

    const managers = await getPropertyManagers(policy.propertyId, orgId);
    if (managers.length === 0) { skipped++; continue; }

    const { subject, html } = insuranceExpiryTemplate({
      policyType:   policy.type.replace(/_/g, " "),
      insurer:      policy.insurer,
      policyNumber: policy.policyNumber,
      propertyName: policy.property.name,
      endDate:      formatDate(policy.endDate),
      daysLeft:     days,
    });

    const caseThreadId = await findCaseThreadId("COMPLIANCE", policy.id);
    await sendToManagers(managers, subject, html, orgId, type, policy.id, "InsurancePolicy", caseThreadId);

    await upsertHint({
      organizationId: orgId,
      propertyId: policy.propertyId,
      caseThreadId,
      hintType: is7D ? "INSURANCE_EXPIRY_7D" : "INSURANCE_EXPIRY_30D",
      refId: policy.id,
      severity: is7D ? "URGENT" : "WARNING",
      title: `Insurance expiring — ${policy.type.replace(/_/g, " ")}`,
      subtitle: `${policy.insurer} · ${policy.property.name} · ${days} day${days === 1 ? "" : "s"} left`,
      suggestedAction: "Mark renewed",
      actionEndpoint: `/api/insurance/${policy.id}`,
      actionMethod: "PATCH",
      actionLabel: "Open policy",
      expiresAt: policy.endDate,
    });

    sent += managers.length;
  }

  return { sent, skipped };
}

// ─── Urgent maintenance checker ───────────────────────────────────────────────

export async function checkUrgentMaintenance(): Promise<{ sent: number; skipped: number }> {
  const fourHoursAgo = new Date(Date.now() - 4 * 3600_000);
  let sent = 0, skipped = 0;

  const jobs = await prisma.maintenanceJob.findMany({
    where: {
      priority: "URGENT",
      status:   "OPEN",
      createdAt: { lte: fourHoursAgo },
    },
    include: {
      property: true,
      unit: true,
    },
  });

  for (const job of jobs) {
    const orgId = job.property.organizationId;
    if (!orgId) continue;

    const type: NotificationType = "MAINTENANCE_URGENT_OPEN";
    if (await wasRecentlySent(type, job.id, 1)) { skipped++; continue; }

    const managers = await getPropertyManagers(job.propertyId, orgId);
    if (managers.length === 0) { skipped++; continue; }

    const hoursOpen = differenceInHours(new Date(), job.createdAt);
    const { subject, html } = urgentMaintenanceTemplate({
      jobTitle:     job.title,
      propertyName: job.property.name,
      unitRef:      job.unit?.unitNumber ?? null,
      category:     job.category.replace(/_/g, " "),
      hoursOpen,
      jobId:        job.id,
    });

    // MaintenanceJob has caseThreadId directly (auto-created by POST /api/maintenance)
    await sendToManagers(managers, subject, html, orgId, type, job.id, "MaintenanceJob", job.caseThreadId);

    await upsertHint({
      organizationId: orgId,
      propertyId: job.propertyId,
      unitId: job.unitId,
      caseThreadId: job.caseThreadId,
      hintType: "URGENT_OPEN_4H",
      refId: job.id,
      severity: "URGENT",
      title: `Urgent maintenance unattended — ${job.title}`,
      subtitle: `${job.property.name} · open for ${hoursOpen}h`,
      suggestedAction: "Acknowledge and assign",
      actionEndpoint: `/api/maintenance/${job.id}`,
      actionMethod: "PATCH",
      actionBody: { status: "IN_PROGRESS" },
      actionLabel: "Mark in progress",
    });

    sent += managers.length;
  }

  return { sent, skipped };
}

// ─── New hint-only checkers (no email by default) ────────────────────────────

/** Vacant units idle for more than 30 days. */
export async function checkVacantUnits(): Promise<{ created: number }> {
  const cutoff = subDays(new Date(), 30);
  const units = await prisma.unit.findMany({
    where: {
      status: "VACANT",
      vacantSince: { lte: cutoff },
      property: { organizationId: { not: null } },
    },
    include: { property: true },
  });

  let created = 0;
  for (const u of units) {
    const orgId = u.property.organizationId;
    if (!orgId) continue;
    const days = u.vacantSince ? differenceInDays(new Date(), u.vacantSince) : 30;
    await upsertHint({
      organizationId: orgId,
      propertyId: u.propertyId,
      unitId: u.id,
      hintType: "VACANT_OVER_30D",
      refId: u.id,
      severity: days >= 60 ? "URGENT" : "WARNING",
      title: `Unit ${u.unitNumber} vacant for ${days} days`,
      subtitle: `${u.property.name} · ${u.type.replace(/_/g, " ")}`,
      suggestedAction: "List unit for re-letting",
      actionEndpoint: `/api/units/${u.id}`,
      actionMethod: "PATCH",
      actionBody: { status: "LISTED" },
      actionLabel: "Mark LISTED",
    });
    created++;
  }
  return { created };
}

/** Vacated tenants without a DepositSettlement after 14 days. */
export async function checkDepositNotSettled(): Promise<{ created: number }> {
  const cutoff = subDays(new Date(), 14);
  const tenants = await prisma.tenant.findMany({
    where: {
      isActive: false,
      vacatedDate: { lte: cutoff, not: null },
      depositSettlement: null,
      unit: { property: { organizationId: { not: null } } },
    },
    include: { unit: { include: { property: true } } },
  });

  let created = 0;
  for (const t of tenants) {
    const orgId = t.unit.property.organizationId;
    if (!orgId) continue;
    const days = t.vacatedDate ? differenceInDays(new Date(), t.vacatedDate) : 14;
    await upsertHint({
      organizationId: orgId,
      propertyId: t.unit.propertyId,
      unitId: t.unitId,
      tenantId: t.id,
      hintType: "DEPOSIT_NOT_SETTLED",
      refId: t.id,
      severity: days >= 30 ? "URGENT" : "WARNING",
      title: `Deposit not settled — ${t.name}`,
      subtitle: `Vacated ${days} days ago · ${t.unit.property.name} · Unit ${t.unit.unitNumber}`,
      suggestedAction: "Settle deposit (deductions + refund)",
      actionEndpoint: `/api/tenants/${t.id}/settle-deposit`,
      actionMethod: "POST",
      actionLabel: "Open settlement",
    });
    created++;
  }
  return { created };
}

/** Recurring expenses due within 3 days. */
export async function checkRecurringExpensesDue(): Promise<{ created: number }> {
  const horizon = new Date(Date.now() + 3 * 86400_000);
  const items = await prisma.recurringExpense.findMany({
    where: {
      isActive: true,
      nextDueDate: { lte: horizon },
      OR: [
        { property: { organizationId: { not: null } } },
        { unit: { property: { organizationId: { not: null } } } },
      ],
    },
    include: {
      property: { select: { id: true, name: true, organizationId: true } },
      unit:     { select: { propertyId: true, property: { select: { id: true, name: true, organizationId: true } } } },
    },
  });

  let created = 0;
  for (const r of items) {
    const prop = r.property ?? r.unit?.property ?? null;
    if (!prop?.organizationId) continue;
    const now = new Date();
    const year = r.nextDueDate.getFullYear();
    const month = r.nextDueDate.getMonth() + 1;
    await upsertHint({
      organizationId: prop.organizationId,
      propertyId: prop.id,
      unitId: r.unitId,
      hintType: "RECURRING_EXPENSE_DUE",
      refId: r.id,
      severity: r.nextDueDate <= now ? "URGENT" : "WARNING",
      title: `Recurring expense due — ${r.description}`,
      subtitle: `${prop.name} · ${formatDate(r.nextDueDate)}`,
      suggestedAction: "Materialize this month's expense entry",
      actionEndpoint: `/api/recurring-expenses/apply`,
      actionMethod: "POST",
      actionBody: { year, month },
      actionLabel: `Apply for ${formatDate(r.nextDueDate)}`,
      expiresAt: new Date(r.nextDueDate.getTime() + 30 * 86400_000),
    });
    created++;
  }
  return { created };
}

/** Petty cash balance < 20% of last 90-day average outflow per property. */
export async function checkLowPettyCash(): Promise<{ created: number }> {
  const orgs = await prisma.organization.findMany({
    where: { isActive: true },
    select: { id: true, properties: { select: { id: true, name: true } } },
  });

  let created = 0;
  for (const org of orgs) {
    for (const p of org.properties) {
      const entries = await prisma.pettyCash.findMany({
        where: { propertyId: p.id, status: "APPROVED" },
        select: { type: true, amount: true, date: true },
      });
      if (entries.length === 0) continue;
      const balance = entries.reduce((s, e) => s + (e.type === "IN" ? e.amount : -e.amount), 0);
      const since = subDays(new Date(), 90);
      const outflow90 = entries
        .filter((e) => e.type === "OUT" && e.date >= since)
        .reduce((s, e) => s + e.amount, 0);
      const monthlyAvgOutflow = outflow90 / 3;
      if (monthlyAvgOutflow < 100) continue; // ignore properties with negligible activity
      if (balance >= 0.2 * monthlyAvgOutflow) continue;
      await upsertHint({
        organizationId: org.id,
        propertyId: p.id,
        hintType: "LOW_PETTY_CASH",
        refId: p.id,
        severity: balance <= 0 ? "URGENT" : "WARNING",
        title: `Low petty cash — ${p.name}`,
        subtitle: `Balance ${formatCurrency(balance, "USD")} (< 20% of 90-day average ${formatCurrency(monthlyAvgOutflow, "USD")})`,
        suggestedAction: "Top up petty cash",
        actionEndpoint: `/petty-cash?propertyId=${p.id}`,
        actionMethod: "GET",
        actionLabel: "Open petty cash",
      });
      created++;
    }
  }
  return { created };
}

/** Negative-cashflow forecast in any of the next 3 months. */
export async function checkNegativeCashflowForecast(): Promise<{ created: number }> {
  const props = await prisma.property.findMany({
    where: { organizationId: { not: null } },
    select: { id: true, name: true, organizationId: true },
  });

  let created = 0;
  for (const p of props) {
    if (!p.organizationId) continue;
    try {
      const [tenants, recurring, insurance, agreementsRow, schedules, certs] = await Promise.all([
        prisma.tenant.findMany({ where: { unit: { propertyId: p.id } }, include: { unit: { include: { property: { select: { name: true } } } } } }),
        prisma.recurringExpense.findMany({ where: { OR: [{ propertyId: p.id }, { unit: { propertyId: p.id } }] } }),
        prisma.insurancePolicy.findMany({ where: { propertyId: p.id } }),
        prisma.managementAgreement.findMany({ where: { propertyId: p.id } }),
        prisma.assetMaintenanceSchedule.findMany({ where: { OR: [{ propertyId: p.id }, { asset: { propertyId: p.id } }] } }),
        prisma.complianceCertificate.findMany({ where: { propertyId: p.id } }),
      ]);
      const forecast = buildForecast({
        horizon: 3,
        propertyId: p.id,
        tenants: tenants as never,
        recurringExpenses: recurring as never,
        insurancePolicies: insurance as never,
        agreements: agreementsRow as never,
        assetMaintenanceSchedules: schedules as never,
        complianceCertificates: certs as never,
      });
      const negativeMonth = forecast.months.find((m) => m.netCashflow < 0);
      if (!negativeMonth) continue;
      await upsertHint({
        organizationId: p.organizationId,
        propertyId: p.id,
        hintType: "NEGATIVE_CASHFLOW_FORECAST",
        refId: p.id,
        severity: "WARNING",
        title: `Negative cashflow forecast — ${p.name}`,
        subtitle: `${negativeMonth.label}: ${formatCurrency(negativeMonth.netCashflow, "USD")}`,
        suggestedAction: "Review the 3-month forecast",
        actionEndpoint: `/forecast?propertyId=${p.id}`,
        actionMethod: "GET",
        actionLabel: "Open forecast",
      });
      created++;
    } catch {
      // forecast engine failed for this property — skip silently
    }
  }
  return { created };
}

/** SLA breach checker. Compares (now - stageStartedAt - waitingPausedSeconds*1000) per case
 *  against the current stage's slaHours; emits an SLA_BREACH ActionableHint when exceeded.
 *  Pauses on external waitingOn (OWNER/TENANT/VENDOR) — those cases are skipped. */
export async function checkCaseSlaBreaches(): Promise<{ created: number }> {
  const { getWorkflow, getStageByIndex } = await import("@/lib/case-workflows");
  const cases = await prisma.caseThread.findMany({
    where: {
      status: { notIn: ["RESOLVED", "CLOSED"] },
      waitingOn: { in: ["MANAGER", "NONE"] },
      stageStartedAt: { not: null },
    },
    include: { property: { select: { id: true, name: true } } },
  });

  let created = 0;
  const now = Date.now();
  for (const c of cases) {
    if (!c.stageStartedAt) continue;
    const wf = getWorkflow(c.caseType);
    const stage = getStageByIndex(wf, c.currentStageIndex);
    if (!stage) continue;
    const slaMap = (c.stageSlaHours ?? {}) as Record<string, number | null>;
    const slaHours = slaMap[stage.key];
    if (!slaHours || slaHours <= 0) continue;

    const elapsedMs = now - c.stageStartedAt.getTime() - c.waitingPausedSeconds * 1000;
    const elapsedHours = elapsedMs / (60 * 60 * 1000);
    if (elapsedHours <= slaHours) continue;

    const severity = elapsedHours >= 2 * slaHours ? "URGENT" : "WARNING";
    await upsertHint({
      organizationId: c.organizationId,
      propertyId: c.propertyId,
      unitId: c.unitId,
      caseThreadId: c.id,
      hintType: "SLA_BREACH",
      refId: c.id,
      severity,
      title: `SLA breach — ${c.title}`,
      subtitle: `Stuck in "${stage.label}" for ${Math.round(elapsedHours)}h (SLA ${slaHours}h)`,
      suggestedAction: "Advance stage or reassign",
      actionEndpoint: `/api/cases/${c.id}/advance`,
      actionMethod: "POST",
      actionLabel: "Open case",
    });
    created++;
  }
  return { created };
}
