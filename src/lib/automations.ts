import type { CaseType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { esc, sendNotificationEmail } from "@/lib/email";
import { getPropertyManagers } from "@/lib/notifications/checkers";
import { getWorkflow, computeDefaultStageSlaHours } from "@/lib/case-workflows";
import { logAudit } from "@/lib/audit";
import { AUTOMATION_DEFS, ensureAutomationTemplates, isAutomationEnabled, wantsEmail } from "@/lib/automation-registry";
import { generateInvoicesForTenants } from "@/lib/invoice-generation";
import { emailInvoiceToTenant } from "@/lib/invoice-email";
import { format } from "date-fns";

const DAY = 86400_000;

// WORKFLOW automations only — the keys this engine has handlers for. The shared
// registry (automation-registry.ts) also holds NOTIFICATION + REMINDER toggles,
// which gate the cron checkers rather than create cases here.
const WORKFLOW_KEYS = AUTOMATION_DEFS.filter((d) => d.category === "WORKFLOW").map((d) => d.key);

// ─── Shared helpers ────────────────────────────────────────────────────────────

async function alreadyExecuted(automationKey: string, subjectId: string): Promise<boolean> {
  const existing = await prisma.automationExecution.findUnique({
    where: { automationKey_subjectId: { automationKey, subjectId } },
    select: { id: true },
  });
  return !!existing;
}

function caseEmailHtml(title: string, triggerLine: string, propertyName: string): string {
  const appUrl = process.env.NEXTAUTH_URL ?? "https://groundworkpm.com";
  return `
    <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
      <p style="color:#c9a84c; font-size:12px; font-weight:600; letter-spacing:0.05em; text-transform:uppercase; margin:0 0 4px;">Automation</p>
      <h2 style="color:#1a1a2e; font-size:20px; margin:0 0 8px;">${esc(title)}</h2>
      <p style="color:#6b7280; font-size:14px; line-height:1.6; margin:0 0 4px;">
        A case was created automatically because: <strong>${esc(triggerLine)}</strong>.
      </p>
      <p style="color:#6b7280; font-size:14px; margin:0 0 20px;">Property: ${esc(propertyName)}</p>
      <a href="${appUrl}/inbox"
         style="display:inline-block; background:#c9a84c; color:white; padding:12px 28px;
                border-radius:8px; text-decoration:none; font-size:14px; font-weight:600;">
        Open the Inbox →
      </a>
      <p style="color:#9ca3af; font-size:11px; margin-top:24px;">Groundwork PM · Automated workflow</p>
    </div>`;
}

interface CreateCaseArgs {
  automationKey: string;
  caseType: CaseType;
  subjectId: string;
  organizationId: string;
  propertyId: string;
  propertyName: string;
  unitId?: string | null;
  title: string;
  triggerLine: string;
  /** Initial timeline comment body. */
  body: string;
}

/**
 * Create a CaseThread + initial CaseEvent for an automation, notify managers, and
 * record the execution. Idempotent via AutomationExecution + open-case guard.
 * Returns true if a case was created, false if skipped (dedup).
 */
async function createCaseFromAutomation(args: CreateCaseArgs): Promise<boolean> {
  // Per-property override: skip (without recording an execution) when this
  // property has the workflow turned off, so it fires later if re-enabled.
  if (!(await isAutomationEnabled(args.organizationId, args.automationKey, args.propertyId))) return false;

  if (await alreadyExecuted(args.automationKey, args.subjectId)) return false;

  // Don't create a second open case of the same type for the same subject.
  const openExisting = await prisma.caseThread.findFirst({
    where: { caseType: args.caseType, subjectId: args.subjectId, status: { notIn: ["RESOLVED", "CLOSED"] } },
    select: { id: true },
  });

  const now = new Date();

  if (openExisting) {
    // Record execution so we stop re-evaluating this subject, but leave the
    // existing case untouched.
    await prisma.automationExecution.create({
      data: { organizationId: args.organizationId, automationKey: args.automationKey, subjectId: args.subjectId },
    });
    return false;
  }

  const wf = getWorkflow(args.caseType);
  const stage0 = wf.stages[0];
  const waitingOn = stage0.requiresAction ?? "MANAGER";

  const thread = await prisma.caseThread.create({
    data: {
      caseType: args.caseType,
      subjectId: args.subjectId,
      propertyId: args.propertyId,
      unitId: args.unitId ?? null,
      organizationId: args.organizationId,
      title: args.title,
      status: "OPEN",
      stage: stage0.label,
      currentStageIndex: 0,
      workflowKey: wf.key,
      stageSlaHours: computeDefaultStageSlaHours(wf),
      stageStartedAt: now,
      lastActivityAt: now,
      waitingOn,
    },
  });

  await prisma.caseEvent.create({
    data: {
      caseThreadId: thread.id,
      kind: "COMMENT",
      actorName: "system",
      body: args.body,
      meta: { automationKey: args.automationKey } as Prisma.InputJsonValue,
    },
  });

  await prisma.automationExecution.create({
    data: { organizationId: args.organizationId, automationKey: args.automationKey, subjectId: args.subjectId },
  });

  // Notify managers (separate from the existing cron alerts — no NotificationLog
  // write, so we never interfere with their dedup windows).
  try {
    const managers = await getPropertyManagers(args.propertyId, args.organizationId);
    const subject = `Automation: ${args.title}`;
    const html = caseEmailHtml(args.title, args.triggerLine, args.propertyName);
    for (const mgr of managers) {
      if (!(await wantsEmail(mgr.userId, "WORKFLOW"))) continue;
      await sendNotificationEmail(mgr.email, subject, html, {
        organizationId: args.organizationId,
        caseThreadId: thread.id,
      });
    }
  } catch (e) {
    console.error("[automations] notify failed:", e);
  }

  await logAudit({
    userId: "system",
    userEmail: "system@automations",
    action: "CREATE",
    resource: "CaseThread",
    resourceId: thread.id,
    organizationId: args.organizationId,
    after: { automationKey: args.automationKey, caseType: args.caseType, subjectId: args.subjectId },
  });

  return true;
}

// ─── Handlers ───────────────────────────────────────────────────────────────--
// Each returns { created, skipped } scoped to one organization.

type HandlerResult = { created: number; skipped: number };

async function runLeaseRenewal90d(organizationId: string): Promise<HandlerResult> {
  const today = new Date();
  let created = 0, skipped = 0;

  const tenants = await prisma.tenant.findMany({
    where: {
      isActive: true,
      leaseEnd: { gte: today, lte: new Date(today.getTime() + 90 * DAY) },
      unit: { property: { organizationId } },
    },
    include: { unit: { include: { property: { select: { id: true, name: true } } } } },
  });

  for (const t of tenants) {
    if (!t.unit?.property) continue;
    const ok = await createCaseFromAutomation({
      automationKey: "LEASE_RENEWAL_90D",
      caseType: "LEASE_RENEWAL",
      subjectId: t.id,
      organizationId,
      propertyId: t.unit.property.id,
      propertyName: t.unit.property.name,
      unitId: t.unitId,
      title: `Lease renewal — ${t.name}`,
      triggerLine: "lease expires within 90 days",
      body: `Lease for ${t.name} (Unit ${t.unit.unitNumber}) expires within 90 days. Renewal case opened automatically.`,
    });
    ok ? created++ : skipped++;
  }
  return { created, skipped };
}

async function runArrears7d(organizationId: string): Promise<HandlerResult> {
  const cutoff = new Date(Date.now() - 7 * DAY);
  let created = 0, skipped = 0;

  const invoices = await prisma.invoice.findMany({
    where: {
      status: { in: ["SENT", "OVERDUE"] },
      dueDate: { lte: cutoff },
      tenant: { unit: { property: { organizationId } } },
    },
    include: { tenant: { include: { unit: { include: { property: { select: { id: true, name: true } } } } } } },
  });

  // One arrears case per tenant — collapse multiple overdue invoices.
  const seen = new Set<string>();
  for (const inv of invoices) {
    const t = inv.tenant;
    if (!t?.unit?.property || seen.has(t.id)) continue;
    seen.add(t.id);
    const ok = await createCaseFromAutomation({
      automationKey: "ARREARS_7D",
      caseType: "ARREARS",
      subjectId: t.id,
      organizationId,
      propertyId: t.unit.property.id,
      propertyName: t.unit.property.name,
      unitId: t.unitId,
      title: `Arrears — ${t.name}`,
      triggerLine: "rent is more than 7 days overdue",
      body: `${t.name} (Unit ${t.unit.unitNumber}) has rent more than 7 days overdue. Arrears case opened automatically.`,
    });
    ok ? created++ : skipped++;
  }
  return { created, skipped };
}

async function runCompliance30d(organizationId: string): Promise<HandlerResult> {
  const today = new Date();
  let created = 0, skipped = 0;

  const certs = await prisma.complianceCertificate.findMany({
    where: {
      expiryDate: { gte: today, lte: new Date(today.getTime() + 30 * DAY) },
      property: { organizationId },
    },
    include: { property: { select: { id: true, name: true } } },
  });

  for (const c of certs) {
    if (!c.property) continue;
    const ok = await createCaseFromAutomation({
      automationKey: "COMPLIANCE_30D",
      caseType: "COMPLIANCE",
      subjectId: c.id,
      organizationId,
      propertyId: c.property.id,
      propertyName: c.property.name,
      title: `Compliance renewal — ${c.certificateType}`,
      triggerLine: "compliance certificate expires within 30 days",
      body: `${c.certificateType} for ${c.property.name} expires within 30 days. Compliance case opened automatically.`,
    });
    ok ? created++ : skipped++;
  }
  return { created, skipped };
}

async function runInsurance30d(organizationId: string): Promise<HandlerResult> {
  const today = new Date();
  let created = 0, skipped = 0;

  const policies = await prisma.insurancePolicy.findMany({
    where: {
      endDate: { gte: today, lte: new Date(today.getTime() + 30 * DAY) },
      property: { organizationId },
    },
    include: { property: { select: { id: true, name: true } } },
  });

  for (const p of policies) {
    if (!p.property) continue;
    const ok = await createCaseFromAutomation({
      automationKey: "INSURANCE_30D",
      caseType: "COMPLIANCE",
      subjectId: p.id,
      organizationId,
      propertyId: p.property.id,
      propertyName: p.property.name,
      title: `Insurance renewal — ${p.type}`,
      triggerLine: "insurance policy expires within 30 days",
      body: `${p.type} policy for ${p.property.name} expires within 30 days. Insurance renewal case opened automatically.`,
    });
    ok ? created++ : skipped++;
  }
  return { created, skipped };
}

async function runUrgentMaintenance(organizationId: string): Promise<HandlerResult> {
  let created = 0, skipped = 0;

  const jobs = await prisma.maintenanceJob.findMany({
    where: {
      priority: "URGENT",
      status: "OPEN",
      property: { organizationId },
    },
    include: {
      property: { select: { id: true, name: true } },
      caseThread: { select: { id: true, assignedToUserId: true } },
    },
  });

  for (const job of jobs) {
    if (!job.property) continue;
    if (!(await isAutomationEnabled(organizationId, "URGENT_MAINTENANCE", job.propertyId))) { skipped++; continue; }
    if (await alreadyExecuted("URGENT_MAINTENANCE", job.id)) { skipped++; continue; }

    // Maintenance cases are auto-created on POST. If the linked case has no
    // assignee, assign the first available manager and emit an ASSIGNMENT event.
    const threadId = job.caseThread?.id ?? null;
    if (!threadId) { skipped++; continue; } // no case to act on; backfill handles it

    if (!job.caseThread?.assignedToUserId) {
      const managerUserId = await prisma.user.findFirst({
        where: {
          isActive: true,
          OR: [
            { organizationId, role: "ADMIN" },
            { role: "MANAGER", propertyAccess: { some: { propertyId: job.propertyId } } },
          ],
        },
        select: { id: true, name: true, email: true },
        orderBy: { createdAt: "asc" },
      });

      if (managerUserId) {
        await prisma.caseThread.update({
          where: { id: threadId },
          data: { assignedToUserId: managerUserId.id, lastActivityAt: new Date() },
        });
        await prisma.caseEvent.create({
          data: {
            caseThreadId: threadId,
            kind: "ASSIGNMENT",
            actorName: "system",
            body: `Auto-assigned to ${managerUserId.name ?? managerUserId.email ?? "manager"} (urgent maintenance).`,
            meta: { automationKey: "URGENT_MAINTENANCE" } as Prisma.InputJsonValue,
          },
        });
      }
    }

    await prisma.automationExecution.create({
      data: { organizationId, automationKey: "URGENT_MAINTENANCE", subjectId: job.id },
    });

    try {
      const managers = await getPropertyManagers(job.propertyId, organizationId);
      const subject = `Automation: Urgent maintenance — ${job.title}`;
      const html = caseEmailHtml(`Urgent maintenance — ${job.title}`, "an urgent maintenance job is open", job.property.name);
      for (const mgr of managers) {
        if (!(await wantsEmail(mgr.userId, "WORKFLOW"))) continue;
        await sendNotificationEmail(mgr.email, subject, html, { organizationId, caseThreadId: threadId });
      }
    } catch (e) {
      console.error("[automations] notify failed:", e);
    }

    await logAudit({
      userId: "system",
      userEmail: "system@automations",
      action: "UPDATE",
      resource: "CaseThread",
      resourceId: threadId,
      organizationId,
      after: { automationKey: "URGENT_MAINTENANCE", subjectId: job.id },
    });

    created++;
  }
  return { created, skipped };
}

// ─── Monthly rent invoice generation (AUTO_INVOICE_GENERATION) ─────────────────
// Runs daily but is idempotent per (tenant, period): the AutomationExecution
// ledger records every tenant evaluated for the month (created / already had an
// invoice / not due on their quarterly-annual schedule), so a manager deleting
// an auto-generated invoice doesn't get it re-created the next morning, while a
// tenant added mid-month is picked up on the next run. Invoices are created as
// DRAFT and flip to SENT only once the email actually goes out; tenants without
// an email address keep a DRAFT for manual delivery and are listed in the
// manager summary email.
async function runAutoInvoiceGeneration(organizationId: string): Promise<HandlerResult> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const periodKey = `${year}-${String(month).padStart(2, "0")}`;
  const periodLabel = format(new Date(year, month - 1, 1), "MMMM yyyy");
  let skipped = 0;

  const tenants = await prisma.tenant.findMany({
    where: {
      isActive: true,
      unit: { property: { organizationId, type: "LONGTERM" } },
    },
    include: {
      unit: { select: { id: true, unitNumber: true, propertyId: true, property: { select: { id: true, name: true } } } },
      rentHistory: { select: { monthlyRent: true, effectiveDate: true } },
    },
  });

  // Per-property toggle + write-once dedup ledger.
  const eligible: typeof tenants = [];
  for (const t of tenants) {
    if (!(await isAutomationEnabled(organizationId, "AUTO_INVOICE_GENERATION", t.unit.propertyId))) { skipped++; continue; }
    if (await alreadyExecuted("AUTO_INVOICE_GENERATION", `${t.id}:${periodKey}`)) { skipped++; continue; }
    eligible.push(t);
  }
  if (eligible.length === 0) return { created: 0, skipped };

  const result = await generateInvoicesForTenants({
    tenants: eligible,
    year,
    month,
    status: "DRAFT",
  });

  // Record every evaluated tenant (not the errored ones — those retry tomorrow).
  const evaluatedTenantIds = [
    ...result.created.map((c) => c.tenantId),
    ...result.skipped.map((s) => s.tenantId),
    ...result.notDue.map((s) => s.tenantId),
  ];
  if (evaluatedTenantIds.length > 0) {
    await prisma.automationExecution.createMany({
      data: evaluatedTenantIds.map((tenantId) => ({
        organizationId,
        automationKey: "AUTO_INVOICE_GENERATION",
        subjectId: `${tenantId}:${periodKey}`,
      })),
      skipDuplicates: true,
    });
  }
  for (const err of result.errors) {
    console.error(`[automations] invoice generation failed for ${err.tenant}: ${err.error}`);
  }

  // Email each created invoice; failures (incl. no email address) stay DRAFT.
  const tenantById = new Map(eligible.map((t) => [t.id, t]));
  const emailed: string[] = [];
  const notEmailed: string[] = [];
  for (const c of result.created) {
    try {
      await emailInvoiceToTenant(c.invoiceId, { loggedByEmail: "system@automations", loggedByName: "Automation" });
      emailed.push(c.tenantName);
    } catch {
      notEmailed.push(c.tenantName);
    }
  }

  // Manager summary, grouped per property.
  const byProperty = new Map<string, { propertyName: string; created: string[]; emailed: string[]; notEmailed: string[] }>();
  for (const c of result.created) {
    const t = tenantById.get(c.tenantId);
    if (!t) continue;
    const key = t.unit.propertyId;
    let group = byProperty.get(key);
    if (!group) {
      group = { propertyName: t.unit.property.name, created: [], emailed: [], notEmailed: [] };
      byProperty.set(key, group);
    }
    group.created.push(c.tenantName);
    (emailed.includes(c.tenantName) ? group.emailed : group.notEmailed).push(c.tenantName);
  }

  const appUrl = process.env.NEXTAUTH_URL ?? "https://groundworkpm.com";
  for (const [propertyId, group] of Array.from(byProperty.entries())) {
    try {
      const managers = await getPropertyManagers(propertyId, organizationId);
      const subject = `Automation: ${group.created.length} rent invoice${group.created.length !== 1 ? "s" : ""} generated — ${group.propertyName}, ${periodLabel}`;
      const html = `
        <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
          <p style="color:#c9a84c; font-size:12px; font-weight:600; letter-spacing:0.05em; text-transform:uppercase; margin:0 0 4px;">Automation</p>
          <h2 style="color:#1a1a2e; font-size:20px; margin:0 0 8px;">Monthly rent invoices — ${esc(group.propertyName)}</h2>
          <p style="color:#6b7280; font-size:14px; line-height:1.6; margin:0 0 12px;">
            ${group.created.length} invoice${group.created.length !== 1 ? "s were" : " was"} generated for <strong>${esc(periodLabel)}</strong>.
            ${group.emailed.length} emailed to tenants automatically.
          </p>
          ${group.notEmailed.length > 0 ? `
          <p style="color:#b45309; font-size:13px; line-height:1.6; margin:0 0 12px;">
            Needs manual delivery (no email address or send failed): <strong>${esc(group.notEmailed.join(", "))}</strong> — these remain drafts.
          </p>` : ""}
          <a href="${appUrl}/invoices"
             style="display:inline-block; background:#c9a84c; color:white; padding:12px 28px;
                    border-radius:8px; text-decoration:none; font-size:14px; font-weight:600;">
            Review invoices →
          </a>
          <p style="color:#9ca3af; font-size:11px; margin-top:24px;">Groundwork PM · Automated workflow</p>
        </div>`;
      for (const mgr of managers) {
        if (!(await wantsEmail(mgr.userId, "WORKFLOW"))) continue;
        await sendNotificationEmail(mgr.email, subject, html, { organizationId });
      }
    } catch (e) {
      console.error("[automations] invoice summary notify failed:", e);
    }
  }

  if (result.created.length > 0) {
    await logAudit({
      userId: "system",
      userEmail: "system@automations",
      action: "CREATE",
      resource: "Invoice",
      resourceId: `auto-generation ${periodKey}`,
      organizationId,
      after: {
        automationKey: "AUTO_INVOICE_GENERATION",
        period: periodKey,
        created: result.created.length,
        emailed: emailed.length,
        awaitingManualDelivery: notEmailed,
      },
    });
  }

  return {
    created: result.created.length,
    skipped: skipped + result.skipped.length + result.notDue.length,
  };
}

const HANDLERS: Record<string, (organizationId: string) => Promise<HandlerResult>> = {
  LEASE_RENEWAL_90D: runLeaseRenewal90d,
  ARREARS_7D: runArrears7d,
  COMPLIANCE_30D: runCompliance30d,
  INSURANCE_30D: runInsurance30d,
  URGENT_MAINTENANCE: runUrgentMaintenance,
  AUTO_INVOICE_GENERATION: runAutoInvoiceGeneration,
};

// ─── Engine entry (called by the cron) ─────────────────────────────────────────

export async function runAutomations(): Promise<Record<string, HandlerResult>> {
  const totals: Record<string, HandlerResult> = {};
  for (const key of WORKFLOW_KEYS) totals[key] = { created: 0, skipped: 0 };

  const orgs = await prisma.organization.findMany({
    where: { isActive: true },
    select: { id: true },
  });

  for (const org of orgs) {
    try {
      await ensureAutomationTemplates(org.id);
    } catch (e) {
      console.error(`[automations] ensureTemplates failed for ${org.id}:`, e);
      continue;
    }

    // A workflow runs if the org toggle is on OR any property override enables it
    // (a property can be on even when the org default is off). The handler then
    // re-checks per property via createCaseFromAutomation / its own gate.
    const [orgEnabled, propOverrides] = await Promise.all([
      prisma.automationTemplate.findMany({
        where: { organizationId: org.id, enabled: true, key: { in: WORKFLOW_KEYS } },
        select: { key: true },
      }),
      prisma.automationPropertyOverride.findMany({
        where: { organizationId: org.id, enabled: true, automationKey: { in: WORKFLOW_KEYS } },
        select: { automationKey: true },
      }),
    ]);
    const keysToRun = Array.from(new Set<string>([
      ...orgEnabled.map((t) => t.key),
      ...propOverrides.map((o) => o.automationKey),
    ]));

    for (const key of keysToRun) {
      const handler = HANDLERS[key];
      if (!handler) continue;
      try {
        const res = await handler(org.id);
        totals[key].created += res.created;
        totals[key].skipped += res.skipped;
      } catch (e) {
        console.error(`[automations] handler ${key} failed for org ${org.id}:`, e);
      }
    }
  }

  return totals;
}
