import { prisma } from "@/lib/prisma";
import { differenceInDays, format, startOfDay } from "date-fns";
import { computeCaseSlaDueDate } from "@/lib/cases";

/**
 * Shared calendar aggregator.
 *
 * Mirrors `buildInbox()` in src/lib/inbox.ts: one `Promise.all` of read-only
 * queries, no transaction, no mutation. Both the session-authenticated
 * `GET /api/calendar` and the token-authenticated ICS feed call this so the
 * two surfaces can never drift apart.
 */

export type EventType =
  | "LEASE_EXPIRY"
  | "LEASE_START"
  | "RENT_DUE"
  | "MAINTENANCE_DUE"
  | "MAINTENANCE_VISIT"
  | "INSURANCE_RENEWAL"
  | "WARRANTY_EXPIRY"
  | "COMPLIANCE_EXPIRY"
  | "RECURRING_EXPENSE"
  | "RENT_REMITTANCE"
  | "MGMT_FEE_INVOICE"
  | "APPROVAL_DEADLINE"
  | "CASE_SLA";

export type EventUrgency = "ok" | "warning" | "critical";

/**
 * A quick action offered on an event row.
 *
 * `href` actions navigate; `endpoint` actions POST a body and are only ever
 * wired to endpoints that already exist and already carry their own auth.
 */
export interface CalendarAction {
  label: string;
  href?: string;
  endpoint?: string;
  method?: "POST" | "PATCH";
  body?: Record<string, unknown>;
}

export interface CalendarEvent {
  /** Stable across refreshes — also used as the ICS UID. Never randomise. */
  id: string;
  /** Underlying domain record id. */
  refId: string;
  type: EventType;
  /** Rich in-app title. May contain a tenant name — never used in the feed. */
  title: string;
  /** PII-minimal summary for the ICS feed: unit + event kind, no names/amounts. */
  feedSummary: string;
  /** "YYYY-MM-DD" — all events are all-day. */
  date: string;
  propertyId: string;
  propertyName: string;
  unitName?: string;
  /** Record-level deep link, using the app's `?focus=<id>` convention where supported. */
  link: string;
  daysUntil: number;
  urgency: EventUrgency;
  /**
   * Past-dated AND still an open obligation. Synthesised events whose
   * completion we cannot verify (remittance, mgmt-fee) are never overdue.
   */
  isOverdue: boolean;
  actions: CalendarAction[];
  /**
   * The user this event sits with, where that's a real concept.
   *
   * Only case-backed work has an owner: case SLAs, maintenance visits whose
   * job is linked to a case, and approvals (the manager who requested it and
   * is waiting on the answer). Leases, invoices, insurance and compliance are
   * property-scoped obligations with no assignee — null, not "unassigned".
   */
  assigneeId?: string | null;
  /** In-app display only. Deliberately excluded from the feed. */
  amount?: number;
  currency?: string;
}

/**
 * Which calendar sources actually hold data for these properties.
 *
 * An empty month is ambiguous — "nothing is due" and "you never configured the
 * thing that produces these dates" look identical. This distinguishes them, so
 * a fresh org isn't left concluding the page is broken. Only run when a month
 * comes back empty; it's seven counts.
 *
 * Deliberately covers *configuration* sources only. Maintenance jobs,
 * approvals and cases are transactional — having none of those is normal and
 * not worth nagging about.
 */
export interface CalendarSourceStatus {
  key: string;
  label: string;
  /** What this source contributes to the calendar, in the manager's words. */
  powers: string;
  href: string;
  configured: boolean;
}

export async function getCalendarSourceStatus(
  propertyIds: string[]
): Promise<CalendarSourceStatus[]> {
  if (propertyIds.length === 0) return [];

  const [tenants, invoices, agreements, schedules, insurance, compliance, recurring] =
    await Promise.all([
      prisma.tenant.count({
        where: { isActive: true, unit: { propertyId: { in: propertyIds } } },
      }),
      prisma.invoice.count({
        where: {
          status: { notIn: ["DRAFT", "CANCELLED"] },
          tenant: { unit: { propertyId: { in: propertyIds } } },
        },
      }),
      prisma.managementAgreement.count({ where: { propertyId: { in: propertyIds } } }),
      prisma.assetMaintenanceSchedule.count({
        where: {
          isActive: true,
          OR: [
            { propertyId: { in: propertyIds } },
            { asset: { propertyId: { in: propertyIds } } },
          ],
        },
      }),
      prisma.insurancePolicy.count({ where: { propertyId: { in: propertyIds } } }),
      prisma.complianceCertificate.count({ where: { propertyId: { in: propertyIds } } }),
      prisma.recurringExpense.count({
        where: {
          isActive: true,
          OR: [
            { propertyId: { in: propertyIds } },
            { unit: { propertyId: { in: propertyIds } } },
          ],
        },
      }),
    ]);

  return [
    { key: "tenants",    label: "Tenants",              powers: "lease start and expiry dates",     href: "/tenants",                 configured: tenants > 0 },
    { key: "invoices",   label: "Rent invoices",        powers: "rent due dates",                   href: "/invoices",                configured: invoices > 0 },
    { key: "agreement",  label: "Management agreement", powers: "rent remittance and mgmt fee days", href: "/properties",              configured: agreements > 0 },
    { key: "schedules",  label: "Maintenance schedules", powers: "recurring maintenance dates",     href: "/maintenance",             configured: schedules > 0 },
    { key: "insurance",  label: "Insurance policies",   powers: "policy renewal dates",             href: "/insurance",               configured: insurance > 0 },
    { key: "compliance", label: "Compliance certificates", powers: "certificate expiry dates",      href: "/compliance/certificates", configured: compliance > 0 },
    { key: "recurring",  label: "Recurring expenses",   powers: "standing cost due dates",          href: "/recurring-expenses",      configured: recurring > 0 },
  ];
}

function toDateStr(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

/** Whole-day difference, so "today" is 0 regardless of the time of day. */
function daysFromToday(d: Date, today: Date): number {
  return differenceInDays(startOfDay(d), today);
}

function expiryUrgency(daysUntil: number): EventUrgency {
  if (daysUntil < 0) return "critical";
  if (daysUntil <= 7) return "critical";
  if (daysUntil <= 30) return "warning";
  return "ok";
}

/**
 * Builds every calendar event falling in [from, to].
 *
 * Callers own the window: the page route passes the visible month, the ICS
 * feed passes a rolling now−90d…now+365d. Nothing here reads request state.
 */
export async function buildCalendarEvents(
  propertyIds: string[],
  from: Date,
  to: Date
): Promise<CalendarEvent[]> {
  if (propertyIds.length === 0) return [];

  const today = startOfDay(new Date());

  const [
    tenants,
    invoices,
    maintenanceSchedules,
    maintenanceJobs,
    insurancePolicies,
    assetWarranties,
    complianceCerts,
    recurringExpenses,
    agreements,
    approvals,
    openCases,
    payouts,
  ] = await Promise.all([
    prisma.tenant.findMany({
      where: {
        isActive: true,
        unit: { propertyId: { in: propertyIds } },
        OR: [
          { leaseEnd: { gte: from, lte: to } },
          { leaseStart: { gte: from, lte: to } },
        ],
      },
      include: {
        unit: { include: { property: { select: { id: true, name: true, currency: true } } } },
      },
    }),

    // Rent due dates — the core monthly rhythm. DRAFT invoices aren't a
    // commitment to the tenant yet, and CANCELLED ones are void, so neither
    // belongs on the calendar.
    prisma.invoice.findMany({
      where: {
        dueDate: { gte: from, lte: to },
        status: { notIn: ["DRAFT", "CANCELLED"] },
        tenant: { unit: { propertyId: { in: propertyIds } } },
      },
      include: {
        tenant: {
          include: {
            unit: { include: { property: { select: { id: true, name: true, currency: true } } } },
          },
        },
      },
    }),

    prisma.assetMaintenanceSchedule.findMany({
      where: {
        isActive: true,
        nextDue: { gte: from, lte: to },
        OR: [
          { propertyId: { in: propertyIds } },
          { asset: { propertyId: { in: propertyIds } } },
        ],
      },
      include: {
        property: { select: { id: true, name: true, currency: true } },
        asset: { include: { property: { select: { id: true, name: true, currency: true } } } },
      },
    }),

    // Booked contractor visits — an actual appointment, distinct from the
    // recurring schedule that generated it.
    prisma.maintenanceJob.findMany({
      where: {
        propertyId: { in: propertyIds },
        scheduledDate: { gte: from, lte: to },
        status: { notIn: ["DONE", "CANCELLED"] },
      },
      include: {
        property: { select: { id: true, name: true, currency: true } },
        unit: { select: { unitNumber: true } },
        vendor: { select: { name: true } },
        // A job's owner lives on its case, not the job itself.
        caseThread: { select: { assignedToUserId: true } },
      },
    }),

    prisma.insurancePolicy.findMany({
      where: { propertyId: { in: propertyIds }, endDate: { gte: from, lte: to } },
      include: { property: { select: { id: true, name: true, currency: true } } },
    }),

    // Asset warranties ending — the last chance to claim on the manufacturer.
    prisma.asset.findMany({
      where: { propertyId: { in: propertyIds }, disposedAt: null, warrantyExpiry: { gte: from, lte: to } },
      select: { id: true, name: true, warrantyExpiry: true, property: { select: { id: true, name: true, currency: true } } },
    }),

    prisma.complianceCertificate.findMany({
      where: { propertyId: { in: propertyIds }, expiryDate: { gte: from, lte: to } },
      include: { property: { select: { id: true, name: true, currency: true } } },
    }),

    prisma.recurringExpense.findMany({
      where: {
        isActive: true,
        nextDueDate: { gte: from, lte: to },
        OR: [
          { propertyId: { in: propertyIds } },
          { unit: { propertyId: { in: propertyIds } } },
        ],
      },
      include: {
        property: { select: { id: true, name: true, currency: true } },
        unit: { include: { property: { select: { id: true, name: true, currency: true } } } },
      },
    }),

    prisma.managementAgreement.findMany({
      where: { propertyId: { in: propertyIds } },
      include: { property: { select: { id: true, name: true, currency: true } } },
    }),

    // Owner sign-offs that expire — a silent expiry strands the case.
    prisma.approvalRequest.findMany({
      where: {
        status: "PENDING",
        expiresAt: { gte: from, lte: to },
        caseThread: { propertyId: { in: propertyIds } },
      },
      include: {
        caseThread: {
          select: {
            id: true,
            title: true,
            property: { select: { id: true, name: true, currency: true } },
          },
        },
      },
    }),

    // SLA deadlines are computed, not stored, so they can't be filtered in
    // SQL. The candidate set is bounded (non-terminal cases with a started
    // stage) and each row is cheap.
    prisma.caseThread.findMany({
      where: {
        propertyId: { in: propertyIds },
        status: { notIn: ["RESOLVED", "CLOSED"] },
        stageStartedAt: { not: null },
      },
      select: {
        id: true,
        caseType: true,
        status: true,
        title: true,
        stage: true,
        currentStageIndex: true,
        stageStartedAt: true,
        stageSlaHours: true,
        waitingPausedSeconds: true,
        assignedToUserId: true,
        property: { select: { id: true, name: true, currency: true } },
        unit: { select: { unitNumber: true } },
      },
    }),

    // Recorded owner remittances — a RENT_REMITTANCE event whose period has a
    // payout is settled (dropped); one past its day with no payout is overdue.
    // Window is padded a year back so the trailing overdue sweep can verify.
    prisma.ownerPayout.findMany({
      where: {
        propertyId: { in: propertyIds },
        periodYear: { gte: from.getFullYear() - 1 },
      },
      select: { propertyId: true, periodYear: true, periodMonth: true },
    }),
  ]);

  const events: CalendarEvent[] = [];

  // ── Leases ─────────────────────────────────────────────────────────────────
  for (const t of tenants) {
    const prop = t.unit.property;
    const unitName = t.unit.unitNumber;

    if (t.leaseEnd) {
      const leaseEnd = new Date(t.leaseEnd);
      if (leaseEnd >= from && leaseEnd <= to) {
        const days = daysFromToday(leaseEnd, today);
        events.push({
          id: `LEASE_EXPIRY-${t.id}`,
          refId: t.id,
          type: "LEASE_EXPIRY",
          title: `${t.name} — lease ${days < 0 ? "expired" : "expires"}`,
          feedSummary: `Lease ${days < 0 ? "expired" : "expires"} — Unit ${unitName}`,
          date: toDateStr(leaseEnd),
          propertyId: prop.id,
          propertyName: prop.name,
          unitName,
          link: `/tenants/${t.id}`,
          daysUntil: days,
          urgency: expiryUrgency(days),
          isOverdue: days < 0,
          actions: [{ label: "Open tenant", href: `/tenants/${t.id}` }],
        });
      }
    }

    const leaseStart = new Date(t.leaseStart);
    if (leaseStart >= from && leaseStart <= to) {
      const days = daysFromToday(leaseStart, today);
      events.push({
        id: `LEASE_START-${t.id}`,
        refId: t.id,
        type: "LEASE_START",
        title: `${t.name} — lease starts`,
        feedSummary: `Lease starts — Unit ${unitName}`,
        date: toDateStr(leaseStart),
        propertyId: prop.id,
        propertyName: prop.name,
        unitName,
        link: `/tenants/${t.id}`,
        daysUntil: days,
        urgency: "ok",
        isOverdue: false, // a start date passing is normal, not a failure
        actions: [{ label: "Open tenant", href: `/tenants/${t.id}` }],
      });
    }
  }

  // ── Rent due ───────────────────────────────────────────────────────────────
  for (const inv of invoices) {
    const prop = inv.tenant.unit.property;
    const unitName = inv.tenant.unit.unitNumber;
    const due = new Date(inv.dueDate);
    const days = daysFromToday(due, today);
    const paid = inv.status === "PAID";
    const outstanding = Number(inv.totalAmount) - Number(inv.paidAmount ?? 0);
    const unpaidAndLate = !paid && days < 0;

    const actions: CalendarAction[] = [
      { label: "View invoice", href: `/invoices?focus=${inv.id}` },
    ];
    // Only offer the reminder where it makes sense — an overdue, unpaid
    // invoice for a tenant we can actually email.
    if (unpaidAndLate && inv.tenant.email) {
      actions.push({
        label: "Send reminder",
        endpoint: "/api/inbox/send-reminders",
        method: "POST",
        body: { invoiceIds: [inv.id] },
      });
    }

    events.push({
      id: `RENT_DUE-${inv.id}`,
      refId: inv.id,
      type: "RENT_DUE",
      title: paid
        ? `${inv.tenant.name} — rent paid (${inv.invoiceNumber})`
        : `${inv.tenant.name} — rent due (${inv.invoiceNumber})`,
      feedSummary: `Rent ${paid ? "paid" : "due"} — Unit ${unitName}`,
      date: toDateStr(due),
      propertyId: prop.id,
      propertyName: prop.name,
      unitName,
      link: `/invoices?focus=${inv.id}`,
      daysUntil: days,
      urgency: paid ? "ok" : unpaidAndLate ? "critical" : days <= 3 ? "warning" : "ok",
      isOverdue: unpaidAndLate,
      actions,
      amount: paid ? undefined : outstanding,
      currency: prop.currency,
    });
  }

  // ── Recurring maintenance schedules ────────────────────────────────────────
  for (const s of maintenanceSchedules) {
    if (!s.nextDue) continue;
    const prop = s.property ?? s.asset?.property;
    if (!prop) continue;
    const due = new Date(s.nextDue);
    const days = daysFromToday(due, today);
    events.push({
      id: `MAINTENANCE_DUE-${s.id}`,
      refId: s.id,
      type: "MAINTENANCE_DUE",
      title: days < 0 ? `${s.taskName} — overdue` : s.taskName,
      feedSummary: `Maintenance due — ${s.taskName}`,
      date: toDateStr(due),
      propertyId: prop.id,
      propertyName: prop.name,
      link: "/maintenance",
      daysUntil: days,
      urgency: days < 0 ? "critical" : days <= 7 ? "warning" : "ok",
      isOverdue: days < 0,
      actions: [{ label: "Open maintenance", href: "/maintenance" }],
    });
  }

  // ── Booked contractor visits ───────────────────────────────────────────────
  for (const j of maintenanceJobs) {
    if (!j.scheduledDate) continue;
    const when = new Date(j.scheduledDate);
    const days = daysFromToday(when, today);
    const href = j.caseThreadId ? `/cases/${j.caseThreadId}` : `/maintenance?focus=${j.id}`;
    events.push({
      id: `MAINTENANCE_VISIT-${j.id}`,
      refId: j.id,
      type: "MAINTENANCE_VISIT",
      title: j.vendor?.name ? `${j.title} — ${j.vendor.name}` : j.title,
      feedSummary: j.unit?.unitNumber
        ? `Maintenance visit — Unit ${j.unit.unitNumber}`
        : "Maintenance visit",
      date: toDateStr(when),
      propertyId: j.property.id,
      propertyName: j.property.name,
      unitName: j.unit?.unitNumber,
      link: href,
      daysUntil: days,
      urgency: days < 0 ? "critical" : j.priority === "URGENT" ? "warning" : "ok",
      // Query already excludes DONE/CANCELLED, so a past visit is still open.
      isOverdue: days < 0,
      actions: [{ label: "Open job", href }],
      assigneeId: j.caseThread?.assignedToUserId ?? null,
    });
  }

  // ── Insurance ──────────────────────────────────────────────────────────────
  for (const p of insurancePolicies) {
    const end = new Date(p.endDate);
    const days = daysFromToday(end, today);
    events.push({
      id: `INSURANCE_RENEWAL-${p.id}`,
      refId: p.id,
      type: "INSURANCE_RENEWAL",
      title: `${p.insurer} — ${p.type.toLowerCase().replace(/_/g, " ")} policy ${days < 0 ? "expired" : "ends"}`,
      feedSummary: `Insurance ${days < 0 ? "expired" : "renewal due"}`,
      date: toDateStr(end),
      propertyId: p.property.id,
      propertyName: p.property.name,
      link: `/insurance?focus=${p.id}`,
      daysUntil: days,
      urgency: expiryUrgency(days),
      isOverdue: days < 0,
      actions: [{ label: "Open policy", href: `/insurance?focus=${p.id}` }],
    });
  }

  // ── Asset warranties ──────────────────────────────────────────────────────
  for (const a of assetWarranties) {
    if (!a.warrantyExpiry) continue;
    const end = new Date(a.warrantyExpiry);
    const days = daysFromToday(end, today);
    events.push({
      id: `WARRANTY_EXPIRY-${a.id}`,
      refId: a.id,
      type: "WARRANTY_EXPIRY",
      title: `${a.name} — warranty ${days < 0 ? "expired" : "ends"}`,
      feedSummary: `Asset warranty ${days < 0 ? "expired" : "ends"}`,
      date: toDateStr(end),
      propertyId: a.property.id,
      propertyName: a.property.name,
      link: `/assets?focus=${a.id}`,
      daysUntil: days,
      urgency: expiryUrgency(days),
      // An expired warranty is a fact, not an open obligation.
      isOverdue: false,
      actions: [{ label: "Open asset", href: `/assets?focus=${a.id}` }],
    });
  }

  // ── Compliance ─────────────────────────────────────────────────────────────
  for (const c of complianceCerts) {
    if (!c.expiryDate) continue;
    const exp = new Date(c.expiryDate);
    const days = daysFromToday(exp, today);
    events.push({
      id: `COMPLIANCE_EXPIRY-${c.id}`,
      refId: c.id,
      type: "COMPLIANCE_EXPIRY",
      title: `${c.certificateType} — ${days < 0 ? "expired" : "expires"}`,
      feedSummary: `Compliance ${days < 0 ? "expired" : "expires"} — ${c.certificateType}`,
      date: toDateStr(exp),
      propertyId: c.property.id,
      propertyName: c.property.name,
      link: `/compliance/certificates?focus=${c.id}`,
      daysUntil: days,
      urgency: expiryUrgency(days),
      isOverdue: days < 0,
      actions: [{ label: "Open certificate", href: `/compliance/certificates?focus=${c.id}` }],
    });
  }

  // ── Recurring expenses ─────────────────────────────────────────────────────
  for (const r of recurringExpenses) {
    const prop = r.property ?? r.unit?.property;
    if (!prop) continue;
    const due = new Date(r.nextDueDate);
    const days = daysFromToday(due, today);
    events.push({
      id: `RECURRING_EXPENSE-${r.id}`,
      refId: r.id,
      type: "RECURRING_EXPENSE",
      title: days < 0
        ? `${r.description} — not applied`
        : `${r.description} (${r.frequency.toLowerCase()})`,
      feedSummary: `Recurring expense due — ${r.description}`,
      date: toDateStr(due),
      propertyId: prop.id,
      propertyName: prop.name,
      // Unit-scoped standing costs were previously shown as property-level.
      unitName: r.unit?.unitNumber,
      link: "/recurring-expenses",
      daysUntil: days,
      urgency: days < 0 ? "critical" : "ok",
      isOverdue: days < 0,
      actions: [{ label: "Open recurring", href: "/recurring-expenses" }],
      amount: Number(r.amount),
      currency: prop.currency,
    });
  }

  // ── Agreement dates (synthesised per month) ────────────────────────────────
  // MGMT_FEE_INVOICE is derived from a configured day-of-month with no record
  // tracking completion — a past one is flagged but never counted overdue.
  // RENT_REMITTANCE is now verifiable via OwnerPayout: a period with a payout
  // drops off the calendar; a past day with no payout is genuinely overdue.
  const paidPeriods = new Set(
    payouts.map((p) => `${p.propertyId}:${p.periodYear}-${p.periodMonth}`)
  );
  for (const a of agreements) {
    const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
    const last = new Date(to.getFullYear(), to.getMonth(), 1);

    while (cursor <= last) {
      const y = cursor.getFullYear();
      const m = cursor.getMonth();
      const daysInMonth = new Date(y, m + 1, 0).getDate();

      const synth = (
        type: "RENT_REMITTANCE" | "MGMT_FEE_INVOICE",
        day: number,
        title: string
      ) => {
        if (day < 1 || day > daysInMonth) return;
        const when = new Date(y, m, day);
        if (when < from || when > to) return;

        // Remittance: settled periods drop off; unpaid past days are overdue.
        const isRemittance = type === "RENT_REMITTANCE";
        const remitted = isRemittance && paidPeriods.has(`${a.property.id}:${y}-${m + 1}`);
        if (remitted) return;

        const days = daysFromToday(when, today);
        const overdue = isRemittance && days < 0;
        events.push({
          id: `${type}-${a.id}-${y}-${String(m + 1).padStart(2, "0")}`,
          refId: a.id,
          type,
          title,
          feedSummary: title,
          date: toDateStr(when),
          propertyId: a.property.id,
          propertyName: a.property.name,
          link: isRemittance ? "/report" : `/properties/${a.property.id}/agreement`,
          daysUntil: days,
          urgency: overdue ? "critical" : days === 0 ? "critical" : days < 0 ? "warning" : "ok",
          isOverdue: overdue,
          actions: isRemittance
            ? [{ label: "Record remittance", href: "/report" }]
            : [{ label: "Open agreement", href: `/properties/${a.property.id}/agreement` }],
        });
      };

      synth("RENT_REMITTANCE", a.rentRemittanceDay, "Rent remittance due");
      synth("MGMT_FEE_INVOICE", a.mgmtFeeInvoiceDay, "Mgmt fee invoice due");

      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  // ── Approval deadlines ─────────────────────────────────────────────────────
  for (const ap of approvals) {
    const when = new Date(ap.expiresAt);
    const days = daysFromToday(when, today);
    const prop = ap.caseThread.property;
    events.push({
      id: `APPROVAL_DEADLINE-${ap.id}`,
      refId: ap.id,
      type: "APPROVAL_DEADLINE",
      title: `Approval expires — ${ap.caseThread.title}`,
      feedSummary: "Approval request expires",
      date: toDateStr(when),
      propertyId: prop.id,
      propertyName: prop.name,
      link: `/cases/${ap.caseThread.id}`,
      daysUntil: days,
      urgency: days <= 1 ? "critical" : "warning",
      isOverdue: days < 0,
      actions: [{ label: "Open case", href: `/cases/${ap.caseThread.id}` }],
      // The requester is the one waiting on the answer.
      assigneeId: ap.requestedByUserId,
    });
  }

  // ── Case SLA deadlines ─────────────────────────────────────────────────────
  for (const c of openCases) {
    const due = computeCaseSlaDueDate(c);
    if (!due || due < from || due > to) continue;
    const days = daysFromToday(due, today);
    events.push({
      id: `CASE_SLA-${c.id}`,
      refId: c.id,
      type: "CASE_SLA",
      title: `SLA ${days < 0 ? "breached" : "due"} — ${c.title}`,
      feedSummary: `Case SLA ${days < 0 ? "breached" : "due"}${c.stage ? ` — ${c.stage}` : ""}`,
      date: toDateStr(due),
      propertyId: c.property.id,
      propertyName: c.property.name,
      unitName: c.unit?.unitNumber,
      link: `/cases/${c.id}`,
      daysUntil: days,
      urgency: days < 0 ? "critical" : days <= 1 ? "warning" : "ok",
      isOverdue: days < 0,
      actions: [{ label: "Open case", href: `/cases/${c.id}` }],
      assigneeId: c.assignedToUserId,
    });
  }

  events.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  return events;
}
