import { prisma } from "@/lib/prisma";
import { differenceInDays } from "date-fns";
import { getLeaseStatus } from "@/lib/date-utils";
import { formatCurrency } from "@/lib/currency";

export type InboxSeverity = "URGENT" | "WARNING" | "INFO";

export type InboxType =
  | "INVOICE_OVERDUE"
  | "LEASE_EXPIRY"
  | "URGENT_MAINTENANCE"
  | "PORTAL_REQUEST"
  | "COMPLIANCE_EXPIRY"
  | "INSURANCE_EXPIRY"
  | "ARREARS_ESCALATION"
  | "CASE_NEEDS_ATTENTION"
  | "APPROVAL_PENDING";

export interface InboxAction {
  label: string;
  action: string;
  method?: "POST" | "PATCH";
}

export interface InboxItem {
  id: string;
  /** The underlying domain record id (e.g. invoice id, tenant id, job id). */
  refId: string;
  type: InboxType;
  severity: InboxSeverity;
  title: string;
  subtitle: string;
  propertyId: string;
  propertyName: string;
  propertyCurrency: string;
  /** Tenant id when the item is rooted in a tenant (invoice, lease, arrears). */
  tenantId: string | null;
  /** Unit id when relevant (maintenance, lease, invoice). */
  unitId: string | null;
  dueDate: string | null;
  daysOverdue: number | null;
  href: string;
  actions: InboxAction[];
  /** True when this row was sourced from an ActionableHint (proactive cron). */
  isHint?: boolean;
  /** Database id of the underlying ActionableHint (when isHint=true). */
  hintId?: string | null;
  /** Subject grouping key — items sharing this key represent the same person/thing. */
  subjectKey?: string;
}

export interface InboxCounts {
  urgent: number;
  today: number;
  thisWeek: number;
}

const SEVERITY_RANK: Record<InboxSeverity, number> = {
  URGENT: 3,
  WARNING: 2,
  INFO: 1,
};

function daysOverdueFrom(date: Date | null | undefined): number | null {
  if (!date) return null;
  // Positive = overdue; negative = upcoming
  return differenceInDays(new Date(), date);
}

/** Map ActionableHint.hintType → InboxItem.type. Returns null for unmapped types. */
function mapHintToInboxType(t: string): InboxType | null {
  switch (t) {
    case "INVOICE_OVERDUE":          return "INVOICE_OVERDUE";
    case "LEASE_EXPIRY_7D":
    case "LEASE_EXPIRY_30D":         return "LEASE_EXPIRY";
    case "URGENT_OPEN_4H":            return "URGENT_MAINTENANCE";
    case "COMPLIANCE_EXPIRY_7D":
    case "COMPLIANCE_EXPIRY_30D":    return "COMPLIANCE_EXPIRY";
    case "INSURANCE_EXPIRY_7D":
    case "INSURANCE_EXPIRY_30D":     return "INSURANCE_EXPIRY";
    // The proactive-only hints don't have an exact computed counterpart — render them as CASE_NEEDS_ATTENTION so existing UI handles them.
    case "VACANT_OVER_30D":
    case "DEPOSIT_NOT_SETTLED":
    case "RECURRING_EXPENSE_DUE":
    case "LOW_PETTY_CASH":
    case "NEGATIVE_CASHFLOW_FORECAST":
    case "RENT_INCREASE_DUE":
    case "INSPECTION_OVERDUE":       return "CASE_NEEDS_ATTENTION";
  }
  return null;
}

export async function buildInbox(
  propertyIds: string[],
): Promise<{ items: InboxItem[]; counts: InboxCounts }> {
  if (propertyIds.length === 0) {
    return { items: [], counts: { urgent: 0, today: 0, thisWeek: 0 } };
  }

  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const ago7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const ago30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    overdueInvoices,
    leaseExpiries,
    urgentJobs,
    portalJobs,
    complianceCerts,
    insurancePolicies,
    arrearsCases,
    cases,
    pendingApprovals,
  ] = await Promise.all([
    // 1. Overdue invoices
    prisma.invoice.findMany({
      where: {
        status: { in: ["SENT", "OVERDUE"] },
        dueDate: { lt: now },
        tenant: { unit: { propertyId: { in: propertyIds } } },
      },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            unit: {
              select: {
                id: true,
                unitNumber: true,
                property: { select: { id: true, name: true, currency: true } },
              },
            },
          },
        },
      },
    }),
    // 2. Lease expiries within 30 days (or recently expired up to 7 days back)
    prisma.tenant.findMany({
      where: {
        isActive: true,
        leaseEnd: { gte: ago7, lte: in30 },
        unit: { propertyId: { in: propertyIds } },
      },
      select: {
        id: true,
        name: true,
        leaseEnd: true,
        unit: {
          select: {
            id: true,
            unitNumber: true,
            property: { select: { id: true, name: true, currency: true } },
          },
        },
      },
    }),
    // 3. Urgent open maintenance
    prisma.maintenanceJob.findMany({
      where: {
        priority: "URGENT",
        status: "OPEN",
        propertyId: { in: propertyIds },
      },
      include: { property: { select: { id: true, name: true, currency: true } } },
    }),
    // 4. Portal-submitted, open, unacknowledged
    prisma.maintenanceJob.findMany({
      where: {
        submittedViaPortal: true,
        status: "OPEN",
        acknowledgedAt: null,
        propertyId: { in: propertyIds },
      },
      include: { property: { select: { id: true, name: true, currency: true } } },
    }),
    // 5. Compliance certificates expiring ≤30d (and not too far in past)
    prisma.complianceCertificate.findMany({
      where: {
        expiryDate: { not: null, gte: ago30, lte: in30 },
        propertyId: { in: propertyIds },
      },
      include: { property: { select: { id: true, name: true, currency: true } } },
    }),
    // 6. Insurance policies ending ≤30d
    prisma.insurancePolicy.findMany({
      where: {
        endDate: { gte: ago30, lte: in30 },
        propertyId: { in: propertyIds },
      },
      include: { property: { select: { id: true, name: true, currency: true } } },
    }),
    // 7. Arrears cases not RESOLVED and untouched >7d
    prisma.arrearsCase.findMany({
      where: {
        stage: { not: "RESOLVED" },
        updatedAt: { lt: ago7 },
        propertyId: { in: propertyIds },
      },
      include: {
        tenant: { select: { id: true, name: true } },
        property: { select: { id: true, name: true, currency: true } },
      },
    }),
    // 8. Cases needing attention — open and either waiting on manager OR
    //    stale (no activity for >7 days). Excludes resolved/closed.
    prisma.caseThread.findMany({
      where: {
        propertyId: { in: propertyIds },
        status: { notIn: ["RESOLVED", "CLOSED"] },
        OR: [
          { waitingOn: "MANAGER" },
          { lastActivityAt: { lt: ago7 } },
        ],
      },
      include: {
        property: { select: { id: true, name: true, currency: true } },
        unit: { select: { id: true, unitNumber: true } },
      },
    }),
    // 9. Pending approvals — PENDING, created > 24h ago, not yet expired
    prisma.approvalRequest.findMany({
      where: {
        status: "PENDING",
        createdAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        expiresAt: { gt: now },
        caseThread: { propertyId: { in: propertyIds } },
      },
      include: {
        caseThread: {
          include: { property: { select: { id: true, name: true, currency: true } } },
        },
      },
    }),
  ]);

  const items: InboxItem[] = [];

  // 1. Overdue invoices
  for (const inv of overdueInvoices) {
    const property = inv.tenant.unit.property;
    const dOver = daysOverdueFrom(inv.dueDate) ?? 0;
    const severity: InboxSeverity = dOver >= 7 ? "URGENT" : "WARNING";
    const amount = formatCurrency(inv.totalAmount, property.currency);
    items.push({
      id: `invoice:${inv.id}`,
      refId: inv.id,
      type: "INVOICE_OVERDUE",
      severity,
      title: `Rent overdue — Unit ${inv.tenant.unit.unitNumber}, ${inv.tenant.name}`,
      subtitle: `${amount} · ${dOver} day${dOver === 1 ? "" : "s"} overdue`,
      propertyId: property.id,
      propertyName: property.name,
      propertyCurrency: property.currency,
      tenantId: inv.tenant.id,
      unitId: inv.tenant.unit.id,
      dueDate: inv.dueDate.toISOString(),
      daysOverdue: dOver,
      href: `/invoices?focus=${inv.id}`,
      actions: [{ label: "View", action: `/invoices?focus=${inv.id}` }],
    });
  }

  // 2. Lease expiries
  for (const t of leaseExpiries) {
    if (!t.leaseEnd) continue;
    const status = getLeaseStatus(t.leaseEnd);
    if (status !== "WARNING" && status !== "CRITICAL") continue;
    const dOver = daysOverdueFrom(t.leaseEnd) ?? 0;
    const severity: InboxSeverity = status === "CRITICAL" ? "URGENT" : "WARNING";
    const property = t.unit.property;
    const daysLeft = -dOver;
    const subtitle =
      daysLeft >= 0
        ? `Lease ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`
        : `Lease ended ${-daysLeft} day${-daysLeft === 1 ? "" : "s"} ago`;
    items.push({
      id: `lease:${t.id}`,
      refId: t.id,
      type: "LEASE_EXPIRY",
      severity,
      title: `Lease expiring — Unit ${t.unit.unitNumber}, ${t.name}`,
      subtitle,
      propertyId: property.id,
      propertyName: property.name,
      propertyCurrency: property.currency,
      tenantId: t.id,
      unitId: t.unit.id,
      dueDate: t.leaseEnd.toISOString(),
      daysOverdue: dOver,
      href: `/tenants/${t.id}`,
      actions: [{ label: "View", action: `/tenants/${t.id}` }],
    });
  }

  // 3 + 4. Maintenance jobs — dedupe by id, keep stronger severity
  const jobMap = new Map<string, InboxItem>();
  for (const job of urgentJobs) {
    jobMap.set(job.id, {
      id: `maintenance:${job.id}`,
      refId: job.id,
      type: "URGENT_MAINTENANCE",
      severity: "URGENT",
      title: `Urgent maintenance — ${job.title}`,
      subtitle: job.submittedViaPortal
        ? "Tenant request · awaiting triage"
        : `Reported ${formatRelative(job.reportedDate)}`,
      propertyId: job.property.id,
      propertyName: job.property.name,
      propertyCurrency: job.property.currency,
      tenantId: null,
      unitId: job.unitId,
      dueDate: job.reportedDate.toISOString(),
      daysOverdue: daysOverdueFrom(job.reportedDate),
      href: `/maintenance?focus=${job.id}`,
      actions: [{ label: "View", action: `/maintenance?focus=${job.id}` }],
    });
  }
  for (const job of portalJobs) {
    const existing = jobMap.get(job.id);
    if (existing) {
      // already URGENT; nothing stronger to do
      continue;
    }
    jobMap.set(job.id, {
      id: `maintenance:${job.id}`,
      refId: job.id,
      type: "PORTAL_REQUEST",
      severity: "WARNING",
      title: `Tenant request — ${job.title}`,
      subtitle: `Submitted via portal · ${formatRelative(job.reportedDate)}`,
      propertyId: job.property.id,
      propertyName: job.property.name,
      propertyCurrency: job.property.currency,
      tenantId: null,
      unitId: job.unitId,
      dueDate: job.reportedDate.toISOString(),
      daysOverdue: daysOverdueFrom(job.reportedDate),
      href: `/maintenance?focus=${job.id}`,
      actions: [{ label: "View", action: `/maintenance?focus=${job.id}` }],
    });
  }
  items.push(...Array.from(jobMap.values()));

  // 5. Compliance certificates
  for (const cert of complianceCerts) {
    if (!cert.expiryDate) continue;
    const dOver = daysOverdueFrom(cert.expiryDate) ?? 0;
    const severity: InboxSeverity = dOver >= -7 ? "URGENT" : "WARNING";
    const daysLeft = -dOver;
    const subtitle =
      daysLeft >= 0
        ? `Expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`
        : `Expired ${-daysLeft} day${-daysLeft === 1 ? "" : "s"} ago`;
    items.push({
      id: `compliance:${cert.id}`,
      refId: cert.id,
      type: "COMPLIANCE_EXPIRY",
      severity,
      title: `${cert.certificateType} expiring`,
      subtitle,
      propertyId: cert.property.id,
      propertyName: cert.property.name,
      propertyCurrency: cert.property.currency,
      tenantId: null,
      unitId: null,
      dueDate: cert.expiryDate.toISOString(),
      daysOverdue: dOver,
      href: `/compliance/certificates?focus=${cert.id}`,
      actions: [{ label: "View", action: `/compliance/certificates?focus=${cert.id}` }],
    });
  }

  // 6. Insurance policies
  for (const pol of insurancePolicies) {
    const dOver = daysOverdueFrom(pol.endDate) ?? 0;
    const severity: InboxSeverity = dOver >= -7 ? "URGENT" : "WARNING";
    const daysLeft = -dOver;
    const subtitle =
      daysLeft >= 0
        ? `Ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"} · ${pol.insurer}`
        : `Ended ${-daysLeft} day${-daysLeft === 1 ? "" : "s"} ago · ${pol.insurer}`;
    items.push({
      id: `insurance:${pol.id}`,
      refId: pol.id,
      type: "INSURANCE_EXPIRY",
      severity,
      title: `Insurance policy expiring — ${pol.type}`,
      subtitle,
      propertyId: pol.property.id,
      propertyName: pol.property.name,
      propertyCurrency: pol.property.currency,
      tenantId: null,
      unitId: null,
      dueDate: pol.endDate.toISOString(),
      daysOverdue: dOver,
      href: `/insurance?focus=${pol.id}`,
      actions: [{ label: "View", action: `/insurance?focus=${pol.id}` }],
    });
  }

  // 7. Arrears cases
  for (const c of arrearsCases) {
    const dOver = daysOverdueFrom(c.updatedAt) ?? 0;
    const escalated = c.stage === "LEGAL_NOTICE" || c.stage === "EVICTION";
    const severity: InboxSeverity = escalated ? "URGENT" : "WARNING";
    items.push({
      id: `arrears:${c.id}`,
      refId: c.id,
      type: "ARREARS_ESCALATION",
      severity,
      title: `Arrears case — ${c.tenant.name}`,
      subtitle: `Stage: ${c.stage.replace(/_/g, " ")} · ${dOver} day${dOver === 1 ? "" : "s"} without update`,
      propertyId: c.property.id,
      propertyName: c.property.name,
      propertyCurrency: c.property.currency,
      tenantId: c.tenant.id,
      unitId: null,
      dueDate: c.updatedAt.toISOString(),
      daysOverdue: dOver,
      href: `/arrears?focus=${c.id}`,
      actions: [{ label: "View", action: `/arrears?focus=${c.id}` }],
    });
  }

  // 8. Cases needing attention
  for (const c of cases) {
    const daysStale = differenceInDays(now, c.lastActivityAt);
    const isStale = daysStale > 7;
    const waitingOnManager = c.waitingOn === "MANAGER";
    const severity: InboxSeverity =
      waitingOnManager && isStale ? "URGENT" : waitingOnManager ? "WARNING" : "INFO";
    const subtitleParts: string[] = [];
    if (waitingOnManager) subtitleParts.push("Waiting on manager");
    if (isStale) subtitleParts.push(`No activity for ${daysStale} days`);
    if (c.stage) subtitleParts.push(c.stage);
    items.push({
      id: `case:${c.id}`,
      refId: c.id,
      type: "CASE_NEEDS_ATTENTION",
      severity,
      title: `Case — ${c.title}`,
      subtitle: subtitleParts.join(" · ") || `Status: ${c.status.replace(/_/g, " ")}`,
      propertyId: c.property.id,
      propertyName: c.property.name,
      propertyCurrency: c.property.currency,
      tenantId: null,
      unitId: c.unit?.id ?? null,
      dueDate: c.lastActivityAt.toISOString(),
      daysOverdue: isStale ? daysStale : null,
      href: `/cases/${c.id}`,
      actions: [
        { label: "Open case", action: `/cases/${c.id}` },
        { label: "Reassign", action: `/api/cases/${c.id}`, method: "PATCH" },
        { label: "Set waiting on", action: `/api/cases/${c.id}`, method: "PATCH" },
      ],
    });
  }

  // 9. Pending approvals (>24h old)
  for (const a of pendingApprovals) {
    const daysOld = differenceInDays(now, a.createdAt);
    const severity: InboxSeverity = daysOld >= 3 ? "URGENT" : "WARNING";
    const amountStr = a.amount != null ? ` · ${formatCurrency(a.amount, a.currency ?? a.caseThread.property.currency)}` : "";
    items.push({
      id: `approval:${a.id}`,
      refId: a.caseThread.id,
      type: "APPROVAL_PENDING",
      severity,
      title: `Approval pending — ${a.caseThread.title}`,
      subtitle: `Waiting on ${a.requestedFromEmail} for ${daysOld} day${daysOld === 1 ? "" : "s"}${amountStr}`,
      propertyId: a.caseThread.property.id,
      propertyName: a.caseThread.property.name,
      propertyCurrency: a.caseThread.property.currency,
      tenantId: null,
      unitId: a.caseThread.unitId,
      dueDate: a.expiresAt.toISOString(),
      daysOverdue: daysOld,
      href: `/cases/${a.caseThread.id}`,
      actions: [
        { label: "Open case", action: `/cases/${a.caseThread.id}` },
      ],
    });
  }

  // 10. ActionableHint rows (proactive layer). The cron upserts these with a
  //     deterministic key (hintType + refId) so they don't duplicate the
  //     computed items above. To avoid double-counting, we drop computed items
  //     whose (type, refId) tuple matches a hint we already injected.
  const hints = await prisma.actionableHint.findMany({
    where: { status: "ACTIVE", propertyId: { in: propertyIds } },
    include: { property: { select: { id: true, name: true, currency: true } } },
  });
  const hintKeys = new Set<string>();
  for (const h of hints) {
    if (!h.property) continue;
    const inboxType: InboxType | null = mapHintToInboxType(h.hintType);
    if (!inboxType) continue;
    hintKeys.add(`${inboxType}:${h.refId}`);
    items.push({
      id: `hint:${h.id}`,
      refId: h.refId,
      type: inboxType,
      severity: h.severity as InboxSeverity,
      title: h.title,
      subtitle: h.subtitle,
      propertyId: h.property.id,
      propertyName: h.property.name,
      propertyCurrency: h.property.currency,
      tenantId: h.tenantId,
      unitId: h.unitId,
      dueDate: h.expiresAt?.toISOString() ?? null,
      daysOverdue: null,
      href: h.actionEndpoint && h.actionMethod === "GET" ? h.actionEndpoint : `/inbox?hint=${h.id}`,
      actions: h.actionLabel && h.actionEndpoint
        ? [{ label: h.actionLabel, action: h.actionEndpoint, method: (h.actionMethod as "POST" | "PATCH") ?? "PATCH" }]
        : [],
      isHint: true,
      hintId: h.id,
    });
  }
  // De-duplicate: prefer the hint-sourced row when a computed item exists with the same (type, refId).
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.isHint) continue;
    if (hintKeys.has(`${it.type}:${it.refId}`)) items.splice(i, 1);
  }

  // Assign subjectKey for grouping (tenantId > unitId > propertyId)
  for (const it of items) {
    it.subjectKey = it.tenantId ?? it.unitId ?? it.propertyId;
  }

  // Sort: severity DESC, daysOverdue DESC
  items.sort((a, b) => {
    const s = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (s !== 0) return s;
    return (b.daysOverdue ?? -Infinity) - (a.daysOverdue ?? -Infinity);
  });

  const counts: InboxCounts = {
    urgent: items.filter((i) => i.severity === "URGENT").length,
    today: items.filter((i) => i.daysOverdue === 0).length,
    thisWeek: items.filter(
      (i) => i.daysOverdue !== null && i.daysOverdue >= -7 && i.daysOverdue <= 7,
    ).length,
  };

  return { items, counts };
}

function formatRelative(date: Date): string {
  const days = differenceInDays(new Date(), date);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}
