/**
 * Re-seeds demo properties from scratch with today's dates: deletes each one
 * (deletePropertyOps — the same FK-safe cascade as DELETE /api/properties/[id])
 * and seeds it again into the same org, granting every org member access.
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
  const { seedDemoProperty } = await import("@/lib/demo-seed");
  const { deletePropertyOps } = await import("@/lib/property-delete");

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
    const added = await prisma.tenant.findMany({
      where: { unit: { propertyId: p.id }, createdAt: { gt: new Date(p.createdAt.getTime() + 10 * 60 * 1000) } },
      select: { name: true },
    });
    const note = added.length ? ` — will remove tenants added since: ${added.map((t) => t.name).join(", ")}` : "";
    if (!apply) {
      console.log(`${label}: would re-seed "${demo.key}"${note}`);
      continue;
    }
    const started = Date.now();
    await prisma.$transaction(deletePropertyOps(p.id));
    const seeded = await seedDemoProperty(demo.key, p.organizationId!);
    if (!seeded) throw new Error(`No seed for ${demo.key}`);
    const members = await prisma.userOrganizationMembership.findMany({ where: { organizationId: p.organizationId! }, select: { userId: true } });
    await prisma.propertyAccess.createMany({ data: members.map((m) => ({ userId: m.userId, propertyId: seeded.id })), skipDuplicates: true });
    console.log(`${label}: re-seeded as ${seeded.id} in ${Math.round((Date.now() - started) / 1000)} s${note}`);
  }
  await prisma.$disconnect();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
