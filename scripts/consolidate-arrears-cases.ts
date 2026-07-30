import { PrismaClient } from "@prisma/client";
import { LEGACY_STAGE_TO_KEY } from "../src/lib/arrears";
import { buildAgingSnapshot } from "../src/lib/arrears-aging";
import { getWorkflow, getStageByKey, getStageByIndex, computeDefaultStageSlaHours } from "../src/lib/case-workflows";

/**
 * Consolidates legacy `ArrearsCase` rows onto `CaseThread(caseType=ARREARS)`.
 *
 * Idempotent: a tenant that already has an ARREARS thread is skipped, so this
 * can be re-run safely. Nothing is deleted — `ArrearsCase` rows are left intact
 * so the migration stays reversible.
 *
 *   npm run arrears:consolidate -- --dry-run    # report only, no writes
 *   npm run arrears:consolidate                 # apply
 */

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const wf = getWorkflow("ARREARS");

  console.log(`ARREARS_V1 ladder: ${wf.stages.map((s, i) => `${i}:${s.key}`).join(" → ")}`);
  console.log(DRY_RUN ? "\n*** DRY RUN — no writes ***\n" : "\nApplying changes…\n");

  // ── Pass 1: repair indices shifted by the `eviction` insert ───────────────
  // getWorkflow() resolves by caseType and ignores the thread's stored
  // workflowKey, so inserting a stage silently reinterprets existing indices.
  // The stored `stage` label is the reliable anchor.
  const existing = await prisma.caseThread.findMany({
    where: { caseType: "ARREARS" },
    select: { id: true, stage: true, currentStageIndex: true, title: true },
  });

  let repaired = 0;
  for (const t of existing) {
    if (!t.stage) continue;
    const atIndex = getStageByIndex(wf, t.currentStageIndex);
    if (atIndex && atIndex.label === t.stage) continue; // already consistent

    const byLabel = wf.stages.findIndex((s) => s.label === t.stage);
    if (byLabel < 0) {
      console.log(`  ⚠ ${t.id} — stored stage "${t.stage}" is not in the current ladder; left alone for manual review`);
      continue;
    }
    console.log(`  ↻ ${t.id} "${t.title}" — index ${t.currentStageIndex} → ${byLabel} (${t.stage})`);
    if (!DRY_RUN) {
      await prisma.caseThread.update({
        where: { id: t.id },
        data: { currentStageIndex: byLabel },
      });
    }
    repaired++;
  }

  // ── Pass 2: migrate ArrearsCase → CaseThread ─────────────────────────────
  const legacy = await prisma.arrearsCase.findMany({
    include: {
      escalations: { orderBy: { createdAt: "asc" } },
      tenant: { select: { id: true, name: true, unitId: true } },
      property: { select: { id: true, name: true, organizationId: true, currency: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`\nFound ${legacy.length} legacy ArrearsCase row(s).`);

  // ── Variance report: was amountOwed used as an override? ─────────────────
  // amountOwed becomes derived from unpaid invoices. If managers were only ever
  // correcting the aging calculation the two figures agree and nothing is lost.
  // If they were recording *disputed* or *part-paid* balances, they agree
  // poorly — and switching to derived removes an escape hatch. This reports the
  // difference so that's a decision made on evidence rather than assumption.
  if (legacy.length > 0) {
    const propertyIds = Array.from(new Set(legacy.map((l) => l.propertyId)));
    const aging = await buildAgingSnapshot(propertyIds);
    const derivedByTenant = new Map(aging.rows.map((r) => [r.tenantId, r.outstanding]));

    let agree = 0;
    const diverged: string[] = [];

    for (const lc of legacy) {
      if (lc.stage === "RESOLVED") continue; // settled cases legitimately owe nothing
      const legacyAmount = Number(lc.amountOwed);
      const derived = derivedByTenant.get(lc.tenantId) ?? 0;
      // Tolerate rounding; flag anything a manager would notice.
      if (Math.abs(legacyAmount - derived) < 1) { agree++; continue; }
      diverged.push(
        `    ${lc.tenant.name.padEnd(26)} recorded ${String(legacyAmount).padStart(12)} vs derived ${String(derived).padStart(12)}` +
        (derived === 0 ? "  ← no unpaid invoices at all" : "")
      );
    }

    console.log(`\n  Amount check — ${agree} row(s) match the derived balance.`);
    if (diverged.length > 0) {
      console.log(`  ${diverged.length} row(s) DIVERGE. Review before relying on the derived figure:`);
      diverged.forEach((d) => console.log(d));
      console.log(
        `    A "derived 0" usually means the debt was tracked here but never invoiced —\n` +
        `    those tenants will show as owing nothing once the switch lands.`
      );
    }
  }

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const lc of legacy) {
    const orgId = lc.property.organizationId;
    if (!orgId) {
      console.log(`  ⚠ skip ${lc.id} — property "${lc.property.name}" has no organizationId`);
      failed++;
      continue;
    }

    // Idempotency: one ARREARS thread per tenant is enough. Matching on
    // subjectId means a thread the ARREARS_7D automation already created is
    // recognised rather than duplicated.
    const already = await prisma.caseThread.findFirst({
      where: { caseType: "ARREARS", subjectId: lc.tenantId },
      select: { id: true },
    });
    if (already) {
      console.log(`  = skip ${lc.tenantId} (${lc.tenant.name}) — thread ${already.id} already exists`);
      skipped++;
      continue;
    }

    const stageKey = LEGACY_STAGE_TO_KEY[lc.stage];
    const resolved = getStageByKey(wf, stageKey);
    if (!resolved) {
      console.log(`  ⚠ skip ${lc.id} — no stage for legacy value ${lc.stage}`);
      failed++;
      continue;
    }

    const isTerminal = lc.stage === "RESOLVED";
    const status = isTerminal ? "RESOLVED" : "IN_PROGRESS";

    console.log(
      `  + ${lc.tenant.name}: ${lc.stage} → ${stageKey} (index ${resolved.index}), ` +
      `status ${status}, ${lc.escalations.length} escalation(s), owed ${lc.amountOwed}`
    );

    if (DRY_RUN) { migrated++; continue; }

    try {
      const thread = await prisma.caseThread.create({
        data: {
          caseType: "ARREARS",
          subjectId: lc.tenantId,
          propertyId: lc.propertyId,
          unitId: lc.tenant.unitId ?? null,
          organizationId: orgId,
          title: `Arrears — ${lc.tenant.name}`,
          status,
          workflowKey: wf.key,
          currentStageIndex: resolved.index,
          stage: resolved.stage.label,
          // Anchor the SLA clock to the legacy record's last change, not now,
          // so migrated cases don't all read as instantly breached.
          stageStartedAt: lc.updatedAt,
          stageSlaHours: computeDefaultStageSlaHours(wf),
          waitingOn: isTerminal ? "NONE" : "MANAGER",
          terminalReason: isTerminal ? "COMPLETED_NORMALLY" : null,
          lastActivityAt: lc.updatedAt,
          createdAt: lc.createdAt,
        },
        select: { id: true },
      });

      // Preserve the historical figures in the timeline. amountOwed is now
      // derived from unpaid invoices, so this is the only place the original
      // manually-entered number survives.
      const events: { kind: "COMMENT" | "STAGE_CHANGE"; body: string; createdAt: Date }[] = [
        {
          kind: "COMMENT",
          body:
            `Migrated from the legacy arrears register (case ${lc.id}).\n` +
            `Recorded amount owed at migration: ${lc.amountOwed} ${lc.property.currency}.\n` +
            `Legacy stage: ${lc.stage}.` +
            (lc.notes ? `\n\nNotes: ${lc.notes}` : ""),
          createdAt: lc.createdAt,
        },
        ...lc.escalations.map((e) => ({
          kind: "STAGE_CHANGE" as const,
          body: `Escalated to ${e.stage}${e.notes ? ` — ${e.notes}` : ""}`,
          createdAt: e.createdAt,
        })),
      ];

      await prisma.caseEvent.createMany({
        data: events.map((e) => ({
          caseThreadId: thread.id,
          kind: e.kind,
          actorName: "system (migration)",
          body: e.body,
          createdAt: e.createdAt,
        })),
      });

      migrated++;
    } catch (err) {
      console.error(`  ✗ failed ${lc.id}:`, err instanceof Error ? err.message : err);
      failed++;
    }
  }

  console.log(
    `\n${DRY_RUN ? "Would apply" : "Applied"}: ` +
    `${repaired} index repair(s), ${migrated} migrated, ${skipped} already present, ${failed} failed.`
  );
  if (DRY_RUN) console.log("Re-run without --dry-run to apply.");
  else console.log("Legacy ArrearsCase rows were NOT deleted — rollback remains possible.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
