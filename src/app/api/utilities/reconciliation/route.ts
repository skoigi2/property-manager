import { requireManager, requirePropertyAccess } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { buildUtilityReconciliation, monthsOfYear, type ReconReading } from "@/lib/utility-reconciliation";
import { resolveTariffForPeriod } from "@/lib/utility-billing";

/**
 * GET /api/utilities/reconciliation?propertyId=&year= — manager tier.
 * Month by month for the year, per utility: units billed / vacant / common /
 * bulk, billed, collected, supplier paid (WATER → council, ELECTRICITY → KPLC
 * expenses), generator fuel (GENERATOR expenses) and the surplus that goes
 * back to the owner. Costs are what was recorded on the Expenses page for the
 * property, VAT included (that is what left the account).
 */
export async function GET(req: Request) {
  const { error } = await requireManager();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const propertyId = searchParams.get("propertyId");
  const year = Number(searchParams.get("year")) || new Date().getFullYear();
  if (!propertyId) return Response.json({ error: "Pick a property" }, { status: 400 });
  const access = await requirePropertyAccess(propertyId);
  if (!access.ok) return access.error!;

  const from = new Date(year, 0, 1);
  const to = new Date(year + 1, 0, 1);

  const [readings, income, expenses, tariffs, property] = await Promise.all([
    prisma.meterReading.findMany({
      // SUBMITTED readings ride along as "awaiting approval": metered, unpriced.
      where: { status: { in: ["APPROVED", "SUBMITTED"] }, periodYear: year, meter: { propertyId } },
      select: {
        status: true,
        periodYear: true, periodMonth: true, consumption: true, amount: true, supplyRate: true, fuelRate: true, tenantId: true,
        meter: { select: { utility: true, role: true } },
      },
    }),
    prisma.incomeEntry.findMany({
      where: { type: "UTILITY_RECOVERY", date: { gte: from, lt: to }, unit: { propertyId } },
      select: { date: true, grossAmount: true, utilityType: true },
    }),
    prisma.expenseEntry.findMany({
      where: {
        category: { in: ["WATER", "ELECTRICITY", "GENERATOR"] },
        isSunkCost: false,
        date: { gte: from, lt: to },
        OR: [{ propertyId }, { unit: { propertyId } }],
      },
      select: { date: true, amount: true, vatAmount: true, category: true },
    }),
    prisma.utilityTariff.findMany({ where: { propertyId } }),
    prisma.property.findUnique({ where: { id: propertyId }, select: { name: true, currency: true } }),
  ]);
  if (!property) return Response.json({ error: "Property not found" }, { status: 404 });

  const recon: ReconReading[] = readings.map((r) => ({
    utility: r.meter.utility,
    role: r.meter.role,
    periodYear: r.periodYear,
    periodMonth: r.periodMonth,
    consumption: r.consumption,
    amount: r.amount,
    supplyRate: r.supplyRate,
    fuelRate: r.fuelRate,
    hasTenant: !!r.tenantId,
    // A bulk reading counts as purchased the moment it is read.
    pending: r.status === "SUBMITTED" && r.meter.role !== "BULK",
  }));
  const cost = (category: string) =>
    expenses.filter((e) => e.category === category).map((e) => ({ date: e.date, amount: e.amount + (e.vatAmount ?? 0) }));
  const collected = (utility: "WATER" | "ELECTRICITY") =>
    income.filter((i) => i.utilityType === utility).map((i) => ({ date: i.date, amount: i.grossAmount }));
  const months = monthsOfYear(year);
  const now = new Date();

  const currentTariff = (utility: "WATER" | "ELECTRICITY") => {
    const t = resolveTariffForPeriod(tariffs.filter((x) => x.utility === utility), now.getFullYear(), now.getMonth() + 1);
    return t ? { supplyRate: t.supplyRate, fuelRate: t.fuelRate, ratePerUnit: Math.round((t.supplyRate + t.fuelRate) * 10000) / 10000 } : null;
  };

  return Response.json({
    property,
    year,
    water: {
      ...buildUtilityReconciliation({ utility: "WATER", months, readings: recon, collections: collected("WATER"), supplierCosts: cost("WATER") }),
      tariff: currentTariff("WATER"),
    },
    electricity: {
      ...buildUtilityReconciliation({
        utility: "ELECTRICITY", months, readings: recon,
        collections: collected("ELECTRICITY"), supplierCosts: cost("ELECTRICITY"), fuelCosts: cost("GENERATOR"),
      }),
      tariff: currentTariff("ELECTRICITY"),
    },
    // Utility receipts recorded by hand without saying which utility.
    untaggedCollected: Math.round(income.filter((i) => !i.utilityType).reduce((s, i) => s + i.grossAmount, 0) * 100) / 100,
  });
}
