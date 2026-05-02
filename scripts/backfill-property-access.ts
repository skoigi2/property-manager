// Backfill script: grant PropertyAccess to every MANAGER/ACCOUNTANT membership
// that currently has zero PropertyAccess rows in their org.
//
// Why this exists:
// Before commit 706cee9, getAccessiblePropertyIds() silently fell back to
// "all org properties" for managers without explicit PropertyAccess rows.
// That fallback was removed (it's a privilege-escalation footgun). This
// script grants the explicit access those users were already implicitly
// receiving, so nobody loses visibility on the upgrade.
//
// Idempotent: uses createMany({ skipDuplicates: true }) — safe to re-run.
//
// Run with:
//   npx ts-node -P tsconfig.seed.json scripts/backfill-property-access.ts
//
// Add --dry-run to see what would change without writing.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(dryRun ? "DRY RUN — no writes." : "Live run — writes enabled.");

  // All MANAGER / ACCOUNTANT memberships
  const memberships = await prisma.userOrganizationMembership.findMany({
    where: { role: { in: ["MANAGER", "ACCOUNTANT"] } },
    select: {
      userId: true,
      organizationId: true,
      role: true,
      user: { select: { email: true, name: true } },
      organization: { select: { name: true } },
    },
  });

  let totalGranted = 0;
  let usersAffected = 0;

  for (const m of memberships) {
    // Properties in this membership's org
    const orgProps = await prisma.property.findMany({
      where: { organizationId: m.organizationId },
      select: { id: true, name: true },
    });
    if (orgProps.length === 0) continue;

    // Existing PropertyAccess rows for this user, in this org
    const existing = await prisma.propertyAccess.findMany({
      where: {
        userId: m.userId,
        property: { organizationId: m.organizationId },
      },
      select: { propertyId: true },
    });
    const existingIds = new Set(existing.map((e) => e.propertyId));

    const toGrant = orgProps.filter((p) => !existingIds.has(p.id));
    if (toGrant.length === 0) continue;

    console.log(
      `  ${m.user.email ?? m.user.name ?? m.userId} → ${m.organization.name} ` +
      `(${m.role}): granting ${toGrant.length}/${orgProps.length} properties`,
    );
    for (const p of toGrant) {
      console.log(`    + ${p.name}`);
    }

    if (!dryRun) {
      await prisma.propertyAccess.createMany({
        data: toGrant.map((p) => ({ userId: m.userId, propertyId: p.id })),
        skipDuplicates: true,
      });
    }
    totalGranted += toGrant.length;
    usersAffected += 1;
  }

  console.log(`\nDone. ${usersAffected} users affected, ${totalGranted} PropertyAccess rows ${dryRun ? "would be" : ""} created.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
