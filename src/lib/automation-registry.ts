import type { CaseType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// ─── Registry ─────────────────────────────────────────────────────────────────
// Single source of truth for every toggleable automation in the app. Three kinds:
//   WORKFLOW     — auto-creates a Case when its condition fires (default OFF, opt-in)
//   NOTIFICATION — emails managers + raises an Inbox hint (default ON — these are
//                  the long-standing cron alerts; toggling OFF silences them)
//   REMINDER     — hint-only (no email); surfaced in the Inbox (default ON)
//
// This module deliberately has no dependency on the cron checkers so both the
// engine (automations.ts) and the checkers (notifications/checkers.ts) can import
// it without a circular reference.

export type AutomationCategory = "WORKFLOW" | "NOTIFICATION" | "REMINDER";

export interface AutomationDef {
  key: string;
  name: string;
  description: string;
  /** Human-readable trigger line for the UI. */
  trigger: string;
  /** Action checklist shown on the card. */
  actions: string[];
  category: AutomationCategory;
  /** Seed value for new orgs. Existing alerts default ON; opt-in workflows OFF. */
  defaultEnabled: boolean;
  /** Only set for WORKFLOW automations. */
  caseType?: CaseType;
}

export const AUTOMATION_DEFS: AutomationDef[] = [
  // ── Workflow automations (create Cases) — opt-in ────────────────────────────
  {
    key: "LEASE_RENEWAL_90D",
    name: "Lease Renewal",
    description: "Automatically open a renewal case 90 days before a lease expires.",
    trigger: "90 days before lease expiry",
    actions: ["Create Case", "Notify Manager", "Add Inbox Item"],
    category: "WORKFLOW",
    defaultEnabled: false,
    caseType: "LEASE_RENEWAL",
  },
  {
    key: "ARREARS_7D",
    name: "Arrears",
    description: "Automatically open an arrears case once rent is 7 days overdue.",
    trigger: "7 days after rent overdue",
    actions: ["Create Case", "Notify Manager", "Add Inbox Item"],
    category: "WORKFLOW",
    defaultEnabled: false,
    caseType: "ARREARS",
  },
  {
    key: "COMPLIANCE_30D",
    name: "Compliance",
    description: "Automatically open a compliance case 30 days before a certificate expires.",
    trigger: "30 days before certificate expiry",
    actions: ["Create Case", "Notify Manager", "Add Inbox Item"],
    category: "WORKFLOW",
    defaultEnabled: false,
    caseType: "COMPLIANCE",
  },
  {
    key: "INSURANCE_30D",
    name: "Insurance",
    description: "Automatically open an insurance renewal case 30 days before a policy expires.",
    trigger: "30 days before policy expiry",
    actions: ["Create Case", "Notify Manager", "Add Inbox Item"],
    category: "WORKFLOW",
    defaultEnabled: false,
    // No INSURANCE case type — insurance renewals run on the COMPLIANCE workflow.
    caseType: "COMPLIANCE",
  },
  {
    key: "URGENT_MAINTENANCE",
    name: "Urgent Maintenance",
    description: "Automatically assign a manager and start the SLA clock on urgent maintenance.",
    trigger: "Urgent maintenance job stays open",
    actions: ["Create Case", "Assign Manager", "Start SLA"],
    category: "WORKFLOW",
    defaultEnabled: false,
    caseType: "MAINTENANCE",
  },

  // ── Email notifications (email managers + Inbox hint) — on by default ────────
  {
    key: "NOTIFY_LEASE_EXPIRY",
    name: "Lease expiry alerts",
    description: "Email managers when a lease is within 30 days (and again within 7 days) of expiring.",
    trigger: "Lease expires within 30 / 7 days",
    actions: ["Email Manager", "Add Inbox Item"],
    category: "NOTIFICATION",
    defaultEnabled: true,
  },
  {
    key: "NOTIFY_INVOICE_OVERDUE",
    name: "Overdue rent alerts",
    description: "Email managers when a rent invoice is more than 7 days overdue.",
    trigger: "Invoice more than 7 days overdue",
    actions: ["Email Manager", "Add Inbox Item"],
    category: "NOTIFICATION",
    defaultEnabled: true,
  },
  {
    key: "NOTIFY_COMPLIANCE_EXPIRY",
    name: "Compliance expiry alerts",
    description: "Email managers when a compliance certificate is within 30 / 7 days of expiring.",
    trigger: "Certificate expires within 30 / 7 days",
    actions: ["Email Manager", "Add Inbox Item"],
    category: "NOTIFICATION",
    defaultEnabled: true,
  },
  {
    key: "NOTIFY_INSURANCE_EXPIRY",
    name: "Insurance expiry alerts",
    description: "Email managers when an insurance policy is within 30 / 7 days of expiring.",
    trigger: "Policy expires within 30 / 7 days",
    actions: ["Email Manager", "Add Inbox Item"],
    category: "NOTIFICATION",
    defaultEnabled: true,
  },
  {
    key: "NOTIFY_URGENT_MAINTENANCE",
    name: "Urgent maintenance alerts",
    description: "Email managers when an urgent maintenance job stays open for more than 4 hours.",
    trigger: "Urgent job open for 4+ hours",
    actions: ["Email Manager", "Add Inbox Item"],
    category: "NOTIFICATION",
    defaultEnabled: true,
  },

  // ── Smart reminders (Inbox hint only, no email) — on by default ─────────────
  {
    key: "REMINDER_VACANT_UNIT",
    name: "Vacant unit reminder",
    description: "Flag units that have been vacant for more than 30 days.",
    trigger: "Unit vacant for 30+ days",
    actions: ["Add Inbox Item"],
    category: "REMINDER",
    defaultEnabled: true,
  },
  {
    key: "REMINDER_DEPOSIT_NOT_SETTLED",
    name: "Deposit settlement reminder",
    description: "Flag vacated tenants whose deposit hasn't been settled after 14 days.",
    trigger: "Deposit unsettled 14+ days after move-out",
    actions: ["Add Inbox Item"],
    category: "REMINDER",
    defaultEnabled: true,
  },
  {
    key: "REMINDER_RECURRING_EXPENSE_DUE",
    name: "Recurring expense reminder",
    description: "Flag recurring expenses that are due within 3 days so they can be posted.",
    trigger: "Recurring expense due within 3 days",
    actions: ["Add Inbox Item"],
    category: "REMINDER",
    defaultEnabled: true,
  },
  {
    key: "REMINDER_LOW_PETTY_CASH",
    name: "Low petty cash reminder",
    description: "Flag a property whose petty-cash balance drops below 20% of its average outflow.",
    trigger: "Petty cash below 20% of average outflow",
    actions: ["Add Inbox Item"],
    category: "REMINDER",
    defaultEnabled: true,
  },
  {
    key: "REMINDER_NEGATIVE_CASHFLOW",
    name: "Negative cashflow reminder",
    description: "Flag a property forecast to run a negative cashflow in any of the next 3 months.",
    trigger: "Negative cashflow forecast in next 3 months",
    actions: ["Add Inbox Item"],
    category: "REMINDER",
    defaultEnabled: true,
  },
  {
    key: "REMINDER_SLA_BREACH",
    name: "Case SLA breach reminder",
    description: "Flag open cases that have exceeded the SLA for their current stage.",
    trigger: "Case stage exceeds its SLA",
    actions: ["Add Inbox Item"],
    category: "REMINDER",
    defaultEnabled: true,
  },
];

export const DEF_BY_KEY = new Map(AUTOMATION_DEFS.map((d) => [d.key, d]));

/**
 * Ensure every registry template exists for an org. Create-only on the toggle so
 * a user's enabled/disabled choice is never clobbered; descriptive fields refresh
 * on every call. Lazy — called from the GET route and the cron, so existing orgs
 * gain new rows on first touch (no data migration needed).
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
        enabled: def.defaultEnabled,
      },
      update: { name: def.name, description: def.description },
    });
  }
}

// ─── Per-run enabled cache + gate ───────────────────────────────────────────────
// The cron reads each toggle many times across checkers. Cache per org for the
// duration of a run; resetAutomationCache() is called at the top of the cron so a
// warm serverless instance never serves a stale toggle.

const enabledCache = new Map<string, Map<string, boolean>>();

export function resetAutomationCache(): void {
  enabledCache.clear();
}

/**
 * Whether an automation is enabled for an org. Falls back to the registry default
 * when no row exists yet (e.g. a checker runs before ensureAutomationTemplates).
 */
export async function isAutomationEnabled(organizationId: string | null | undefined, key: string): Promise<boolean> {
  if (!organizationId) return false;
  let orgMap = enabledCache.get(organizationId);
  if (!orgMap) {
    const rows = await prisma.automationTemplate.findMany({
      where: { organizationId },
      select: { key: true, enabled: true },
    });
    orgMap = new Map(rows.map((r) => [r.key, r.enabled]));
    enabledCache.set(organizationId, orgMap);
  }
  if (orgMap.has(key)) return orgMap.get(key)!;
  return DEF_BY_KEY.get(key)?.defaultEnabled ?? false;
}
