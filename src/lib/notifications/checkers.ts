import { differenceInDays, differenceInHours, subDays } from "date-fns";
import { NotificationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendNotificationEmail } from "@/lib/email";
import { formatDate } from "@/lib/date-utils";
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
    sent += managers.length;
  }

  return { sent, skipped };
}
