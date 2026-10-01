/**
 * Re-seeds demo properties from scratch with today's dates — the same
 * refreshDemoProperty as the in-app "Refresh sample data" banner: deletes each
 * one (FK-safe, like DELETE /api/properties/[id]) and seeds it again under the
 * same id, granting every org member access.
 * Anything added to a demo since it was loaded is lost — the dry run lists
 * tenants created after the seed so you can check first.
 *
 * Dry run (default):
 *   npx tsx scripts/reseed-demos.ts [--only=<propertyId>,<propertyId>]
 * Write:
 *   npx tsx scripts/reseed-demos.ts --apply [--only=...]
 *
 * Demos without an organisation are skipped. Uses DATABASE_URL.
 */
import "./server-only-shim";

async function main() {
  const { prisma } = await import("@/lib/prisma");
  const { DEMO_PROPERTIES } = await import("@/lib/demo-definitions");
  const { demoAddedSinceSeed, refreshDemoProperty } = await import("@/lib/demo-seed");
  const { describeAddedSinceSeed } = await import("@/lib/demo-refresh");

  const apply = process.argv.includes("--apply");
  const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",").filter(Boolean);
  const properties = await prisma.property.findMany({
    where: { isDemo: true, organizationId: { not: null }, ...(only ? { id: { in: only } } : {}) },
    select: { id: true, name: true, createdAt: true, organizationId: true, organization: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  console.log(`${apply ? "APPLY" : "DRY RUN"} — ${properties.length} demo properties\n`);

  for (const p of properties) {
    const demo = DEMO_PROPERTIES.find((d) => d.name === p.name);
    const label = `${p.organization?.name} / ${p.name} (${p.id}, seeded ${p.createdAt.toISOString().slice(0, 10)})`;
    if (!demo) {
      console.log(`${label}: no demo definition with this name — skipped`);
      continue;
    }
    const added = describeAddedSinceSeed(await demoAddedSinceSeed(p.id, p.createdAt));
    const note = added ? ` — will remove what was added since: ${added}` : "";
    if (!apply) {
      console.log(`${label}: would re-seed "${demo.key}"${note}`);
      continue;
    }
    const started = Date.now();
    await refreshDemoProperty(p.id);
    console.log(`${label}: re-seeded in ${Math.round((Date.now() - started) / 1000)} s${note}`);
  }
  await prisma.$disconnect();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
