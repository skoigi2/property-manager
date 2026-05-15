import { PrismaClient } from "@prisma/client";
import { WORKFLOWS, computeDefaultStageSlaHours } from "../src/lib/case-workflows";

const prisma = new PrismaClient();

async function main() {
  const cases = await prisma.caseThread.findMany({
    where: { workflowKey: null },
    select: { id: true, caseType: true, propertyId: true, subjectId: true, currentStageIndex: true, stage: true, updatedAt: true },
  });

  console.log(`Found ${cases.length} case(s) without workflowKey.`);
  let updated = 0;
  let skipped = 0;

  for (const c of cases) {
    const wf = WORKFLOWS[c.caseType];
    if (!wf) { skipped++; continue; }

    // For MAINTENANCE cases, look up the agreement + the linked job to determine isEmergency
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

    const stageSlaHours = computeDefaultStageSlaHours(wf, { isEmergency, agreement });

    // Use the case's current stage label to infer index when possible (so we don't reset to 0
    // for cases that already had a labelled stage from Phase 1).
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
