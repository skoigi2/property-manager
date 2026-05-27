import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const invoices = await prisma.invoice.findMany({
    where: { caseThreadId: null },
    select: { id: true, invoiceNumber: true, tenant: { select: { unitId: true } } },
  });

  console.log(`Found ${invoices.length} invoice(s) without caseThreadId.${DRY_RUN ? " (dry-run)" : ""}`);
  let linked = 0;
  let unlinked = 0;
  let ambiguous = 0;

  for (const inv of invoices) {
    if (!inv.tenant?.unitId) { unlinked++; continue; }
    // Find candidate MAINTENANCE cases on the same unit
    const candidates = await prisma.caseThread.findMany({
      where: { unitId: inv.tenant.unitId, caseType: "MAINTENANCE", status: { notIn: ["RESOLVED", "CLOSED"] } },
      select: { id: true, title: true, currentStageIndex: true },
    });
    if (candidates.length === 0) { unlinked++; continue; }
    if (candidates.length > 1) {
      console.log(`  ⚠ ambiguous: invoice ${inv.invoiceNumber} → ${candidates.length} candidate cases (${candidates.map((c) => c.id).join(", ")})`);
      ambiguous++;
      continue;
    }
    if (!DRY_RUN) {
      await prisma.invoice.update({ where: { id: inv.id }, data: { caseThreadId: candidates[0].id } });
    }
    linked++;
  }

  console.log(`✅ linked ${linked}, unlinked ${unlinked}, ambiguous ${ambiguous}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
