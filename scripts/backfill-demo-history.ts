/**
 * Brings demo properties that were seeded before the current demo seed up to
 * date:
 *   - paid rent + running costs back to each lease start (seedPaidHistory), so
 *     old demos stop showing every tenant ~9 months in arrears;
 *   - Kilimani Court gets this year's service charge budget if it has none.
 *
 * Both steps are idempotent — a demo that is already up to date is left alone.
 *
 * Dry run (default — reports what would be written):
 *   npx tsx scripts/backfill-demo-history.ts
 * Write:
 *   npx tsx scripts/backfill-demo-history.ts --apply
 *
 * Uses DATABASE_URL; point it at another database by setting that env var.
 */
import Module from "module";
import path from "path";

// The libs guard themselves with `import "server-only"`, a marker Next.js
// resolves at build time and that isn't installed as a package. A script is
// server-side, so resolve it to an empty module.
const mod = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string };
const resolve = mod._resolveFilename;
mod._resolveFilename = function (request: string, ...rest: unknown[]) {
  return resolve.call(this, request === "server-only" ? path.join(__dirname, "empty-module.js") : request, ...rest);
};

async function main() {
  const { prisma } = await import("@/lib/prisma");
  const { seedPaidHistory } = await import("@/lib/demo-history");
  const { seedDemoServiceChargeBudget } = await import("@/lib/demo-service-charge");
  const apply = process.argv.includes("--apply");
  const now = new Date();
  const properties = await prisma.property.findMany({
    where: { isDemo: true },
    select: { id: true, name: true, organizationId: true, organization: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  console.log(`${apply ? "APPLY" : "DRY RUN"} — ${properties.length} demo properties\n`);

  let invoices = 0;
  let expenses = 0;
  let budgets = 0;
  for (const p of properties) {
    const r = await seedPaidHistory(p.id, now, { dryRun: !apply });
    let budget = "";
    if (p.name === "Kilimani Court" && p.organizationId) {
      const has = await prisma.serviceChargeBudget.count({ where: { propertyId: p.id, year: now.getFullYear() } });
      if (!has) {
        if (apply) await seedDemoServiceChargeBudget(p.id, p.organizationId, now);
        budget = ", + service charge budget";
        budgets++;
      }
    }
    const latest = await prisma.incomeEntry.findFirst({
      where: { unit: { propertyId: p.id }, type: "LONGTERM_RENT" },
      orderBy: { date: "desc" },
      select: { date: true },
    });
    const seededTo = latest ? latest.date.toISOString().slice(0, 7) : "none";
    invoices += r.invoices;
    expenses += r.expenses;
    console.log(`${p.organization?.name ?? "(no org)"} / ${p.name}: ${r.invoices} paid invoices, ${r.expenses} expenses${budget} (latest rent receipt ${seededTo})`);
  }
  console.log(`\nTotal: ${invoices} paid invoices (+ receipts), ${expenses} expenses, ${budgets} budgets ${apply ? "written" : "to write"}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
