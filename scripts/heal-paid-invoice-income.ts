/**
 * Heal reverse orphans: PAID invoices with no linked IncomeEntry — DRY-RUN BY DEFAULT.
 *
 *   npm run statements:heal-orphans            → dry run (no writes)
 *   npm run statements:heal-orphans -- --apply → create the income entries
 *
 * Every current seed path (seed-bahrain.ts, seed-demo.ts, and all four demo
 * cases in POST /api/demo/seed) already pairs a PAID tenant invoice with a
 * LONGTERM_RENT IncomeEntry — the mark-paid API route does the same. Rows
 * seeded by OLDER versions of the demo seed predate that pairing (the Phase 0
 * diagnostic found 20 on Al Seef Residences), so a PAID invoice exists with
 * no payment record behind it. On a tenant statement that renders as false
 * arrears (charges with no payments).
 *
 * For each PAID invoice with zero linked IncomeEntry rows this creates the
 * exact entry the mark-paid flow would have created:
 *   date          = paidAt (falling back to dueDate)
 *   grossAmount   = paidAmount (falling back to totalAmount)
 *   type          = LONGTERM_RENT, linked to the tenant, their unit, and the invoice
 *
 * Guardrails:
 *   - Creates IncomeEntry rows and NOTHING else. Invoice.status is already
 *     PAID and is never touched (no webhook/hint/case cascade).
 *   - Idempotent: only invoices with zero linked entries qualify, so a
 *     re-run finds nothing to do.
 *   - Chunked createMany, never one query per row.
 *   - Report written to scripts/backfill-output-<timestamp>.md.
 */
import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "fs";
import { join } from "path";

const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");
const CHUNK_SIZE = 100;

const num = (d: unknown): number => (d == null ? 0 : Number(d));
const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

async function main() {
  console.log(APPLY ? "⚠ APPLY mode — income entries will be created." : "Dry run — no writes. Pass --apply to heal.");

  const orphans = await prisma.invoice.findMany({
    where: { status: "PAID", incomeEntries: { none: {} } },
    select: {
      id: true,
      invoiceNumber: true,
      periodYear: true,
      periodMonth: true,
      totalAmount: true,
      paidAmount: true,
      paidAt: true,
      dueDate: true,
      tenant: {
        select: {
          id: true,
          name: true,
          unitId: true,
          unit: { select: { unitNumber: true, property: { select: { name: true } } } },
        },
      },
    },
    orderBy: [{ periodYear: "asc" }, { periodMonth: "asc" }],
  });

  console.log(`PAID invoices with no linked IncomeEntry: ${orphans.length}`);

  const rows = orphans.map((inv) => ({
    date: inv.paidAt ?? inv.dueDate,
    unitId: inv.tenant.unitId,
    tenantId: inv.tenant.id,
    invoiceId: inv.id,
    type: "LONGTERM_RENT" as const,
    grossAmount: num(inv.paidAmount ?? inv.totalAmount),
    agentCommission: 0,
  }));

  let created = 0;
  if (APPLY && rows.length > 0) {
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const res = await prisma.incomeEntry.createMany({ data: chunk });
      created += res.count;
      console.log(`  created ${Math.min(i + CHUNK_SIZE, rows.length)}/${rows.length}…`);
    }
  }

  const now = new Date();
  const lines: string[] = [
    `# heal-paid-invoice-income report — ${now.toISOString()}`,
    ``,
    `Mode: **${APPLY ? "APPLY" : "DRY RUN"}**`,
    ``,
    `- PAID invoices with no linked IncomeEntry: **${orphans.length}**`,
    `- Income entries ${APPLY ? "created" : "that would be created"}: **${rows.length}**${APPLY ? ` (rows written: ${created})` : ""}`,
    ``,
  ];

  if (orphans.length > 0) {
    lines.push(`| Property | Unit | Tenant | Invoice | Period | Entry date | Amount |`);
    lines.push(`|---|---|---|---|---|---|---|`);
    for (const inv of orphans) {
      lines.push(
        `| ${inv.tenant.unit.property.name} | ${inv.tenant.unit.unitNumber} | ${inv.tenant.name} | ${inv.invoiceNumber} | ${inv.periodYear}-${String(inv.periodMonth).padStart(2, "0")} | ${fmtDate(inv.paidAt ?? inv.dueDate)} | ${num(inv.paidAmount ?? inv.totalAmount).toFixed(2)} |`
      );
    }
    lines.push(``);
  }

  const ts = now.toISOString().replace(/[:.]/g, "-");
  const outPath = join(process.cwd(), "scripts", `backfill-output-${ts}.md`);
  writeFileSync(outPath, lines.join("\n"), "utf8");

  console.log(`\n${APPLY ? "✅ Created" : "Would create"} ${rows.length} income entr${rows.length === 1 ? "y" : "ies"}.`);
  console.log(`📝 Report: ${outPath}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
