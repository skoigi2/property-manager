import type { CaseType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { esc, sendNotificationEmail } from "@/lib/email";
import { getPropertyManagers } from "@/lib/notifications/checkers";
import { getWorkflow, computeDefaultStageSlaHours } from "@/lib/case-workflows";
import { logAudit } from "@/lib/audit";

const DAY = 86400_000;

// ─── Registry ─────────────────────────────────────────────────────────────────
// Single source of truth for the predefined automation templates. The display
// metadata (trigger/actions) powers the /automations UI; caseType drives the
// engine. Adding an entry here surfaces it everywhere once ensureAutomationTemplates
// runs and a matching handler is wired into runAutomations.

export interface AutomationDef {
  key: string;
  name: string;
  description: string;
  /** Human-readable trigger line for the UI. */
  trigger: string;
  /** Action checklist shown on the card. */
  actions: string[];
  caseType: CaseType;
}

export const AUTOMATION_DEFS: AutomationDef[] = [
  {
    key: "LEASE_RENEWAL_90D",
    name: "Lease Renewal",
    description: "Automatically create a renewal case 90 days before lease expiry.",
    trigger: "90 days before lease expiry",
    actions: ["Create Case", "Notify Manager", "Add Inbox Item"],
    caseType: "LEASE_RENEWAL",
  },
  {
    key: "ARREARS_7D",
    name: "Arrears",
    description: "Automatically create an arrears case after rent is 7 days overdue.",
    trigger: "7 days after rent overdue",
    actions: ["Create Case", "Notify Manager", "Add Inbox Item"],
    caseType: "ARREARS",
  },
  {
    key: "COMPLIANCE_30D",
    name: "Compliance",
    description: "Automatically create a compliance case 30 days before certificate expiry.",
    trigger: "30 days before certificate expiry",
    actions: ["Create Case", "Notify Manager", "Add Inbox Item"],
    caseType: "COMPLIANCE",
  },
  {
    key: "INSURANCE_30D",
    name: "Insurance",
    description: "Automatically create an insurance renewal case 30 days before policy expiry.",
    trigger: "30 days before policy expiry",
    actions: ["Create Case", "Notify Manager", "Add Inbox Item"],
    // No INSURANCE case type — insurance renewals run on the COMPLIANCE workflow.
    caseType: "COMPLIANCE",
  },
  {
    key: "URGENT_MAINTENANCE",
    name: "Urgent Maintenance",
    description: "Automatically assign a manager and start the SLA clock on urgent maintenance.",
    trigger: "Urgent maintenance job stays open",
    actions: ["Create Case", "Assign Manager", "Start SLA"],
    caseType: "MAINTENANCE",
  },
];

const DEF_BY_KEY = new Map(AUTOMATION_DEFS.map((d) => [d.key, d]));

/**
 * Ensure the 5 predefined templates exist for an org. Create-only on the
 * descriptive fields so a user's `enabled` choice is never clobbered. Lazy —
 * called from the GET route and the cron, so existing orgs get rows on first touch.
 */
export async function ensureAutomationTemplates(organizationId: string): Promise<void> {
  for (const def of AUTOMATION_DEFS) {
    await prisma.automationTemplate.upsert({
      where: { organizationId_key: { organizationId, key: def.key } },
      create: {
        organizationId,
        key: def.key,
        name: def.name,
        description: def.description,
        enabled: false,
      },
      // Refresh name/description only (keep user's enabled choice).
      update: { name: def.name, description: def.description },
    });
  }
}

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

const HANDLERS: Record<string, (organizationId: string) => Promise<HandlerResult>> = {
  LEASE_RENEWAL_90D: runLeaseRenewal90d,
  ARREARS_7D: runArrears7d,
  COMPLIANCE_30D: runCompliance30d,
  INSURANCE_30D: runInsurance30d,
  URGENT_MAINTENANCE: runUrgentMaintenance,
};

// ─── Engine entry (called by the cron) ─────────────────────────────────────────

export async function runAutomations(): Promise<Record<string, HandlerResult>> {
  const totals: Record<string, HandlerResult> = {};
  for (const def of AUTOMATION_DEFS) totals[def.key] = { created: 0, skipped: 0 };

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

    const enabled = await prisma.automationTemplate.findMany({
      where: { organizationId: org.id, enabled: true },
      select: { key: true },
    });

    for (const tpl of enabled) {
      const handler = HANDLERS[tpl.key];
      if (!handler || !DEF_BY_KEY.has(tpl.key)) continue;
      try {
        const res = await handler(org.id);
        totals[tpl.key].created += res.created;
        totals[tpl.key].skipped += res.skipped;
      } catch (e) {
        console.error(`[automations] handler ${tpl.key} failed for org ${org.id}:`, e);
      }
    }
  }

  return totals;
}
