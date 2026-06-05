// One-off maintenance script: delete ALL expenses for a single property,
// after writing a full JSON backup. Intended for the "wipe and re-upload from
// Excel" workflow when an import created duplicates.
//
// SAFETY:
//   - Always writes a JSON backup of every expense (with line items, unit
//     allocations, and document paths) BEFORE deleting anything.
//   - Dry-run by default: prints what WOULD be deleted and exits. Nothing is
//     removed unless you pass --confirm.
//   - Scoped to ONE property. PORTFOLIO-scope expenses (propertyId = null) are
//     intentionally NOT touched.
//   - Cascade: line items, unit allocations, and ExpenseDocument rows are
//     removed automatically (FK onDelete: Cascade). Supabase storage files for
//     those documents are NOT deleted by this script — their paths are recorded
//     in the backup so you can clean them up later if needed.
//   - Petty cash: expenses paid from petty cash created SEPARATE, unlinked
//     PettyCash rows. This script does NOT delete them (can't match safely). It
//     warns you so you re-upload with Petty Cash = No to avoid double-counting.
//
// Run with:
//   # list properties + counts:
//   npx ts-node -P tsconfig.seed.json scripts/wipe-property-expenses.ts
//   # dry-run for one property (backup + report, no delete):
//   npx ts-node -P tsconfig.seed.json scripts/wipe-property-expenses.ts --property "Riara One"
//   # actually delete:
//   npx ts-node -P tsconfig.seed.json scripts/wipe-property-expenses.ts --property "Riara One" --confirm

import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "fs";
import { join } from "path";

const prisma = new PrismaClient();

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const propertyArg = argValue("--property");
  const confirm = process.argv.includes("--confirm");

  // No property given → list properties so the caller can pick one.
  if (!propertyArg) {
    const props = await prisma.property.findMany({
      select: { id: true, name: true, _count: { select: { expenses: true } } },
      orderBy: { name: "asc" },
    });
    console.log('Usage: --property "<name or id>" [--confirm]\n');
    console.log("Available properties:");
    for (const p of props) {
      console.log(`  ${p.name}  —  ${p._count.expenses} expenses  (id: ${p.id})`);
    }
    return;
  }

  const property = await prisma.property.findFirst({
    where: { OR: [{ id: propertyArg }, { name: { equals: propertyArg, mode: "insensitive" } }] },
    select: { id: true, name: true },
  });
  if (!property) {
    console.error(`No property matches "${propertyArg}". Run with no args to list properties.`);
    process.exit(1);
  }

  // Expenses tied to this property, directly or via a unit. PORTFOLIO-scope
  // (propertyId null, no unit) rows are excluded on purpose.
  const expenses = await prisma.expenseEntry.findMany({
    where: { OR: [{ propertyId: property.id }, { unit: { propertyId: property.id } }] },
    include: {
      lineItems: true,
      unitAllocations: true,
      documents: { select: { id: true, storagePath: true, fileName: true } },
      vendor: { select: { name: true } },
      unit: { select: { unitNumber: true } },
    },
    orderBy: { date: "asc" },
  });

  const ids = expenses.map((e) => e.id);
  const lineItemCount = expenses.reduce((s, e) => s + e.lineItems.length, 0);
  const allocCount = expenses.reduce((s, e) => s + e.unitAllocations.length, 0);
  const docPaths = expenses.flatMap((e) => e.documents.map((d) => d.storagePath));
  const pettyPaid = expenses.filter((e) => e.paidFromPettyCash).length;

  // Always back up first.
  const safeName = property.name.replace(/[^a-z0-9]+/gi, "-");
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(__dirname, `expense-backup-${safeName}-${ts}.json`);
  writeFileSync(
    backupPath,
    JSON.stringify(
      { property, exportedAt: new Date().toISOString(), count: expenses.length, expenses },
      null,
      2,
    ),
  );

  console.log(`Property:            ${property.name}  (${property.id})`);
  console.log(`Expenses to delete:  ${expenses.length}`);
  console.log(`  ↳ line items:      ${lineItemCount}  (cascade)`);
  console.log(`  ↳ unit allocs:     ${allocCount}  (cascade)`);
  console.log(`  ↳ document rows:   ${docPaths.length}  (cascade — ${docPaths.length} storage file(s) will be orphaned)`);
  console.log(`Backup written:      ${backupPath}`);

  if (pettyPaid > 0) {
    const pettyOut = await prisma.pettyCash.count({ where: { propertyId: property.id, type: "OUT" } });
    console.log(
      `\n⚠  ${pettyPaid} of these were paid from petty cash. The matching petty-cash OUT ` +
        `entries are NOT linked and will REMAIN (${pettyOut} OUT rows on this property). ` +
        `Re-upload your Excel with Petty Cash = No to avoid double-counting the petty-cash fund.`,
    );
  }

  if (!confirm) {
    console.log(`\nDRY RUN — nothing deleted. Re-run with --confirm to delete these ${expenses.length} expenses.`);
    return;
  }

  if (ids.length === 0) {
    console.log("\nNothing to delete.");
    return;
  }

  const res = await prisma.expenseEntry.deleteMany({ where: { id: { in: ids } } });
  console.log(`\n✅ Deleted ${res.count} expenses for ${property.name}. Backup retained at:\n   ${backupPath}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
