import "server-only";
import { ExpenseCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * This year's service charge budget for the Kilimani Court demo's shared
 * costs (split by floor area), so Service Charge shows budget vs actual
 * against the demo's expenses. Water / power / generator are metered, so not
 * budgeted. Does nothing when the property already has a budget for the year.
 */
export async function seedDemoServiceChargeBudget(propertyId: string, organizationId: string, now: Date = new Date()): Promise<boolean> {
  const year = now.getFullYear();
  const existing = await prisma.serviceChargeBudget.findUnique({ where: { propertyId_year: { propertyId, year } }, select: { id: true } });
  if (existing) return false;
  await prisma.serviceChargeBudget.create({
    data: {
      propertyId,
      organizationId,
      year,
      basis: "FLOOR_AREA",
      createdByName: "Demo",
      lines: {
        create: [
          { category: ExpenseCategory.SECURITY,           amount: 540000, notes: "3 guards, 24/7" },
          { category: ExpenseCategory.CLEANER,            amount: 264000, notes: "2 cleaners, common areas" },
          { category: ExpenseCategory.GARBAGE_COLLECTION, amount: 96000,  notes: "Weekly collection" },
          { category: ExpenseCategory.WIFI,               amount: 144000, notes: "Building fibre" },
          { category: ExpenseCategory.LANDSCAPING,        amount: 72000,  notes: "Gardens, monthly" },
          { category: ExpenseCategory.MAINTENANCE,        amount: 120000, notes: "Common-area repairs, lift & generator servicing" },
        ],
      },
    },
  });
  return true;
}
