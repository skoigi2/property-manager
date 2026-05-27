/**
 * Backfill ActionableHint-era CaseThread rows with workflowKey + stageSlaHours.
 * Self-contained: doesn't import @/lib/* so ts-node can run it without tsconfig-paths.
 */
import { PrismaClient, CaseType } from "@prisma/client";

const prisma = new PrismaClient();

interface Stage {
  key: string;
  label: string;
  terminal?: boolean;
  defaultSlaHours?: number | null;
}

// Mirror of src/lib/case-workflows.ts WORKFLOWS — kept in sync manually.
const WORKFLOWS: Record<CaseType, { key: string; stages: Stage[] }> = {
  MAINTENANCE: {
    key: "MAINTENANCE_V1",
    stages: [
      { key: "reported",           label: "Reported" },
      { key: "triaged",            label: "Triaged",            defaultSlaHours: 96 },
      { key: "quote_requested",    label: "Quote requested",    defaultSlaHours: 96 },
      { key: "quote_received",     label: "Quote received",     defaultSlaHours: 48 },
      { key: "approval_requested", label: "Approval requested", defaultSlaHours: 72 },
      { key: "approved",           label: "Approved",           defaultSlaHours: 48 },
      { key: "scheduled",          label: "Scheduled",          defaultSlaHours: null },
      { key: "in_progress",        label: "In progress",        defaultSlaHours: 168 },
      { key: "completed",          label: "Completed",          defaultSlaHours: 168 },
      { key: "invoiced",           label: "Invoiced",           defaultSlaHours: 336 },
      { key: "closed",             label: "Closed",             terminal: true },
    ],
  },
  LEASE_RENEWAL: {
    key: "LEASE_RENEWAL_V1",
    stages: [
      { key: "notice_due",       label: "Notice due",       defaultSlaHours: 168 },
      { key: "notice_sent",      label: "Notice sent",      defaultSlaHours: 336 },
      { key: "terms_drafted",    label: "Terms drafted",    defaultSlaHours: 72 },
      { key: "terms_sent",       label: "Terms sent",       defaultSlaHours: 336 },
      { key: "negotiating",      label: "Negotiating",      defaultSlaHours: 504 },
      { key: "terms_agreed",     label: "Terms agreed",     defaultSlaHours: 168 },
      { key: "documents_signed", label: "Documents signed", defaultSlaHours: 72 },
      { key: "renewed",          label: "Renewed",          terminal: true },
    ],
  },
  ARREARS: {
    key: "ARREARS_V1",
    stages: [
      { key: "informal_reminder", label: "Informal reminder", defaultSlaHours: 72 },
      { key: "formal_notice",     label: "Formal notice",     defaultSlaHours: 168 },
      { key: "demand_letter",     label: "Demand letter",     defaultSlaHours: 336 },
      { key: "legal_action",      label: "Legal action",      defaultSlaHours: null },
      { key: "settled",           label: "Settled",           terminal: true },
      { key: "closed",            label: "Closed",            terminal: true },
    ],
  },
  COMPLIANCE: {
    key: "COMPLIANCE_V1",
    stages: [
      { key: "identified",           label: "Identified",           defaultSlaHours: 168 },
      { key: "quote_requested",      label: "Quote requested",      defaultSlaHours: 168 },
      { key: "scheduled",            label: "Scheduled",            defaultSlaHours: null },
      { key: "in_progress",          label: "In progress",          defaultSlaHours: 336 },
      { key: "certificate_received", label: "Certificate received", defaultSlaHours: 72 },
      { key: "filed",                label: "Filed",                terminal: true },
    ],
  },
  GENERAL: {
    key: "GENERAL_V1",
    stages: [
      { key: "open",        label: "Open",        defaultSlaHours: null },
      { key: "in_progress", label: "In progress", defaultSlaHours: null },
      { key: "resolved",    label: "Resolved",    terminal: true },
      { key: "closed",      label: "Closed",      terminal: true },
    ],
  },
};

function computeStageSlaHours(
  wf: { stages: Stage[] },
  opts: { caseType: CaseType; isEmergency?: boolean; agreement?: { kpiEmergencyResponseHrs: number; kpiStandardResponseHrs: number } | null },
): Record<string, number | null> {
  const map: Record<string, number | null> = {};
  for (const s of wf.stages) map[s.key] = s.defaultSlaHours ?? null;
  if (opts.caseType === "MAINTENANCE" && opts.agreement) {
    const hrs = opts.isEmergency ? opts.agreement.kpiEmergencyResponseHrs : opts.agreement.kpiStandardResponseHrs;
    if (typeof hrs === "number" && hrs > 0) {
      map.triaged = hrs;
      map.quote_requested = hrs;
    }
  }
  return map;
}

async function main() {
  const cases = await prisma.caseThread.findMany({
    where: { workflowKey: null },
    select: {
      id: true, caseType: true, propertyId: true,
      currentStageIndex: true, stage: true, updatedAt: true,
    },
  });

  console.log(`Found ${cases.length} case(s) without workflowKey.`);
  let updated = 0;
  let skipped = 0;

  for (const c of cases) {
    const wf = WORKFLOWS[c.caseType];
    if (!wf) { skipped++; continue; }

    let isEmergency = false;
    let agreement: { kpiEmergencyResponseHrs: number; kpiStandardResponseHrs: number } | null = null;
    if (c.caseType === "MAINTENANCE") {
      const job = await prisma.maintenanceJob.findFirst({
        where: { caseThreadId: c.id },
        select: { isEmergency: true },
      });
      isEmergency = job?.isEmergency ?? false;
      agreement = await prisma.managementAgreement.findUnique({
        where: { propertyId: c.propertyId },
        select: { kpiEmergencyResponseHrs: true, kpiStandardResponseHrs: true },
      });
    }

    const stageSlaHours = computeStageSlaHours(wf, { caseType: c.caseType, isEmergency, agreement });

    // Seed the index from the existing stage label when possible (so Phase-1 cases keep their place).
    let stageIndex = c.currentStageIndex;
    if (c.stage) {
      const match = wf.stages.findIndex((s) => s.label === c.stage);
      if (match >= 0) stageIndex = match;
    }

    await prisma.caseThread.update({
      where: { id: c.id },
      data: {
        workflowKey: wf.key,
        currentStageIndex: stageIndex,
        stage: wf.stages[stageIndex]?.label ?? wf.stages[0].label,
        stageSlaHours,
      },
    });
    updated++;
  }

  console.log(`✅ Updated ${updated} case(s); skipped ${skipped}.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
