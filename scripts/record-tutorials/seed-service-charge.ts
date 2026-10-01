/**
 * Recording preconditions for `service-charge`.
 *
 * Same Kenyan org as `utilities-metering` (guide-utilities@groundworkpm.com,
 * "Nairobi Homes Management", KES): seedUtilities re-creates its Kilimani Court
 * demo. Then the demo's own budget is replaced by one for the service charge
 * year that has just ended — the 12 months to the end of last month, which
 * lines up with the demo's leases (they start a year back), so every tenant is
 * in for the whole year and only the vacant unit 301 falls to the landlord.
 * The current year has no budget: the video creates it from last year's.
 */
import type { PrismaClient } from "@prisma/client";
import { seedUtilities, UTILITIES_RECORD_EMAIL } from "./seed-utilities";

export function endedServiceChargeYear(now = new Date()): { year: number; startMonth: number } {
  return { year: now.getFullYear() - 1, startMonth: now.getMonth() + 1 };
}

export async function seedServiceCharge(prisma: PrismaClient, fixturesDir: string): Promise<void> {
  await seedUtilities(prisma, fixturesDir);

  const user = await prisma.user.findUnique({ where: { email: UTILITIES_RECORD_EMAIL }, select: { organizationId: true } });
  const property = await prisma.property.findFirst({
    where: { organizationId: user!.organizationId!, name: "Kilimani Court" },
    select: { id: true, organizationId: true },
  });
  if (!property) throw new Error("Kilimani Court not found after seeding");

  await prisma.serviceChargeBudget.deleteMany({ where: { propertyId: property.id } });
  const ended = endedServiceChargeYear();
  await prisma.serviceChargeBudget.create({
    data: {
      propertyId: property.id,
      organizationId: property.organizationId,
      year: ended.year,
      startMonth: ended.startMonth,
      basis: "FLOOR_AREA",
      createdByName: "Amina Otieno",
      lines: {
        create: [
          { category: "SECURITY", amount: 540000, notes: "3 guards, 24/7" },
          { category: "CLEANER", amount: 264000, notes: "2 cleaners, common areas" },
          { category: "GARBAGE_COLLECTION", amount: 96000, notes: "Weekly collection" },
          { category: "WIFI", amount: 144000, notes: "Building fibre" },
        ],
      },
    },
  });
  console.log(`  ✓ service charge: ${ended.year} budget (starts month ${ended.startMonth}) ready; ${ended.year + 1} left empty`);
}
