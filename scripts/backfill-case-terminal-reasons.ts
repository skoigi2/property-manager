/**
 * Backfill `terminalReason` + `bypassedAtStage` for existing terminal cases.
 *
 * Rule:
 *   status IN (RESOLVED, CLOSED) AND terminalReason IS NULL →
 *     currentStageIndex >= naturalCompletionIndex → COMPLETED_NORMALLY
 *     else                                          → BYPASSED + bypassedAtStage
 *
 * Does NOT mutate currentStageIndex — historical record is preserved.
 * Writes scripts/backfill-output-<timestamp>.md with the per-case summary.
 */
import { PrismaClient, CaseTerminalReason, CaseType } from "@prisma/client";
import { writeFileSync } from "fs";
import { join } from "path";

const prisma = new PrismaClient();

const NATURAL_COMPLETION_INDEX: Record<CaseType, number> = {
  MAINTENANCE:   8,
  LEASE_RENEWAL: 6,
  ARREARS:       3,
  COMPLIANCE:    4,
  GENERAL:       1,
};

const WORKFLOW_STAGE_KEYS: Record<CaseType, string[]> = {
  MAINTENANCE:   ["reported","triaged","quote_requested","quote_received","approval_requested","approved","scheduled","in_progress","completed","invoiced","closed"],
  LEASE_RENEWAL: ["notice_due","notice_sent","terms_drafted","terms_sent","negotiating","terms_agreed","documents_signed","renewed"],
  ARREARS:       ["informal_reminder","formal_notice","demand_letter","legal_action","settled","closed"],
  COMPLIANCE:    ["identified","quote_requested","scheduled","in_progress","certificate_received","filed"],
  GENERAL:       ["open","in_progress","resolved","closed"],
};

async function main() {
  const cases = await prisma.caseThread.findMany({
    where: { status: { in: ["RESOLVED", "CLOSED"] }, terminalReason: null },
    select: {
      id: true, caseType: true, status: true, stage: true, currentStageIndex: true,
      property: { select: { name: true } },
    },
  });

  console.log(`Found ${cases.length} terminal case(s) without terminalReason.`);

  let completed = 0;
  let bypassed = 0;
  const lines: string[] = [
    `# backfill-case-terminal-reasons report — ${new Date().toISOString()}`,
    ``,
    `Found **${cases.length}** terminal case(s) without terminalReason.`,
    ``,
    `| Property | Status | Stage | currentStageIndex | naturalCompletion | terminalReason | bypassedAtStage |`,
    `|---|---|---|---|---|---|---|`,
  ];

  for (const c of cases) {
    const naturalIdx = NATURAL_COMPLETION_INDEX[c.caseType];
    const reachedNatural = c.currentStageIndex >= naturalIdx;
    const reason: CaseTerminalReason = reachedNatural ? "COMPLETED_NORMALLY" : "BYPASSED";
    const bypassedAtStage = reachedNatural
      ? null
      : (WORKFLOW_STAGE_KEYS[c.caseType][c.currentStageIndex] ?? null);

    await prisma.caseThread.update({
      where: { id: c.id },
      data: { terminalReason: reason, bypassedAtStage },
    });

    if (reachedNatural) completed++; else bypassed++;
    lines.push(`| ${c.property.name} | ${c.status} | ${c.stage ?? "—"} | ${c.currentStageIndex} | ${naturalIdx} | ${reason} | ${bypassedAtStage ?? "—"} |`);
  }

  lines.push(``);
  lines.push(`## Summary`);
  lines.push(`- **COMPLETED_NORMALLY**: ${completed}`);
  lines.push(`- **BYPASSED**: ${bypassed}`);

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = join(process.cwd(), "scripts", `backfill-output-${ts}.md`);
  writeFileSync(outPath, lines.join("\n"), "utf8");

  console.log(`✅ COMPLETED_NORMALLY: ${completed}, BYPASSED: ${bypassed}`);
  console.log(`📝 Report: ${outPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
