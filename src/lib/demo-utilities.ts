import "server-only";
import { prisma } from "@/lib/prisma";
import { calcConsumption, calcReadingCharge, previousPeriod } from "@/lib/utility-billing";

/**
 * Demo data for utility metering: a water and an electricity meter per unit,
 * a KPLC bulk meter, a common-area meter, tariffs, and two months of readings
 * — the older month APPROVED (ready for "Bill approved readings"), last month
 * SUBMITTED (waiting on the Review tab). Deterministic, so every demo org
 * sees the same numbers. Called once, right after the demo property and its
 * tenants exist.
 */
export async function seedDemoUtilities(propertyId: string, organizationId: string, now = new Date()): Promise<void> {
  const units = await prisma.unit.findMany({
    where: { propertyId },
    orderBy: { unitNumber: "asc" },
    select: { id: true, tenants: { where: { isActive: true }, select: { id: true }, take: 1 } },
  });
  if (units.length === 0) return;

  const WATER_RATE = 150;
  const POWER_RATE = 28;
  const FUEL_RATE = 4;
  const tariffFrom = new Date(Date.UTC(now.getFullYear() - 1, now.getMonth(), 1));
  await prisma.utilityTariff.createMany({
    data: [
      { propertyId, utility: "WATER", effectiveFrom: tariffFrom, supplyRate: WATER_RATE, fuelRate: 0, notes: "Borehole + council water, one rate" },
      { propertyId, utility: "ELECTRICITY", effectiveFrom: tariffFrom, supplyRate: POWER_RATE, fuelRate: FUEL_RATE, notes: "KPLC domestic rate + generator fuel" },
    ],
  });

  const last = previousPeriod(now.getFullYear(), now.getMonth() + 1);
  const older = previousPeriod(last.year, last.month);
  const periods = [
    { ...older, status: "APPROVED" as const },
    { ...last, status: "SUBMITTED" as const },
  ];
  const lastDay = (p: { year: number; month: number }) => new Date(Date.UTC(p.year, p.month, 0, 12));

  type Plan = { meterId: string; utility: "WATER" | "ELECTRICITY"; billable: boolean; tenantId: string | null; opening: number; use: number[] };
  const plans: Plan[] = [];
  let unitPower = [0, 0];

  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    const tenantId = u.tenants[0]?.id ?? null;
    const waterOpening = 100 + i * 37;
    const powerOpening = 2000 + i * 311;
    const waterUse = [4 + (i % 5), 5 + ((i * 3) % 4)];
    const powerUse = [120 + ((i * 17) % 90), 135 + ((i * 23) % 80)];
    // A vacant unit barely moves.
    const factor = tenantId ? 1 : 0.1;
    const water = await prisma.utilityMeter.create({
      data: { organizationId, propertyId, unitId: u.id, utility: "WATER", role: "UNIT", label: "Water", meterNumber: `W-${1000 + i}`, openingReading: waterOpening, openingReadingDate: lastDay(previousPeriod(older.year, older.month)) },
    });
    const power = await prisma.utilityMeter.create({
      data: { organizationId, propertyId, unitId: u.id, utility: "ELECTRICITY", role: "UNIT", label: "Electricity", meterNumber: `E-${5000 + i}`, openingReading: powerOpening, openingReadingDate: lastDay(previousPeriod(older.year, older.month)) },
    });
    const pu = powerUse.map((x) => Math.round(x * factor));
    unitPower = [unitPower[0] + pu[0], unitPower[1] + pu[1]];
    plans.push({ meterId: water.id, utility: "WATER", billable: true, tenantId, opening: waterOpening, use: waterUse.map((x) => Math.round(x * factor * 10) / 10) });
    plans.push({ meterId: power.id, utility: "ELECTRICITY", billable: true, tenantId, opening: powerOpening, use: pu });
  }

  const commonUse = [310, 295];
  const common = await prisma.utilityMeter.create({
    data: { organizationId, propertyId, utility: "ELECTRICITY", role: "COMMON", label: "Common areas", meterNumber: "E-COMMON", openingReading: 8400 },
  });
  const bulk = await prisma.utilityMeter.create({
    data: { organizationId, propertyId, utility: "ELECTRICITY", role: "BULK", label: "KPLC bulk meter", meterNumber: "KPLC-BULK", openingReading: 152000 },
  });
  plans.push({ meterId: common.id, utility: "ELECTRICITY", billable: false, tenantId: null, opening: 8400, use: commonUse });
  // Bulk = everything downstream + ~3% line loss.
  plans.push({
    meterId: bulk.id, utility: "ELECTRICITY", billable: false, tenantId: null, opening: 152000,
    use: [Math.round((unitPower[0] + commonUse[0]) * 1.03), Math.round((unitPower[1] + commonUse[1]) * 1.03)],
  });

  const rows = [];
  for (const plan of plans) {
    let previous = plan.opening;
    for (let k = 0; k < periods.length; k++) {
      const p = periods[k];
      const current = Math.round((previous + plan.use[k]) * 10) / 10;
      const consumption = calcConsumption(previous, current);
      const approved = p.status === "APPROVED";
      const priced = approved && plan.billable;
      const supplyRate = plan.utility === "WATER" ? WATER_RATE : POWER_RATE;
      const fuelRate = plan.utility === "WATER" ? 0 : FUEL_RATE;
      rows.push({
        meterId: plan.meterId,
        periodYear: p.year,
        periodMonth: p.month,
        readingDate: lastDay(p),
        previousReading: previous,
        currentReading: current,
        consumption,
        status: p.status,
        tenantId: plan.billable ? plan.tenantId : null,
        supplyRate: priced ? supplyRate : null,
        fuelRate: priced ? fuelRate : null,
        ratePerUnit: priced ? supplyRate + fuelRate : null,
        amount: priced ? calcReadingCharge(consumption, supplyRate + fuelRate) : null,
        readByName: "Demo Caretaker",
        approvedByName: approved ? "Demo Manager" : null,
        approvedAt: approved ? lastDay(p) : null,
        photoPaths: [],
      });
      previous = current;
    }
  }
  await prisma.meterReading.createMany({ data: rows });
}
