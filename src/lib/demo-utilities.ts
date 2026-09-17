import "server-only";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { calcConsumption, calcReadingCharge, previousPeriod } from "@/lib/utility-billing";

/**
 * Demo data that shows utility metering WORKING end to end on a demo
 * property whose tenants and three months of rent invoices already exist
 * (Kilimani Court):
 *
 * - a water and an electricity meter per unit, the KPLC bulk meter and a
 *   common-areas meter, with tariffs (water 150; power 28 + 4 generator fuel);
 * - three months of readings. Each month's readings are billed on the NEXT
 *   month's rent invoice, so every invoice in the window carries water and
 *   electricity lines;
 * - a realistic payment mix for the "Paid & unpaid" statement and the portal:
 *   most tenants paid in full (rent + tagged UTILITY_RECOVERY receipts), one
 *   pays the rent only for two months running (utilities unpaid), one has
 *   part-paid this month's electricity, and the tenant already in rent
 *   arrears owes everything;
 * - last month's readings for two units still SUBMITTED — one of them an
 *   obvious spike — so the Review tab has something to check and approve;
 * - council, KPLC and generator-fuel costs sized so the Reconciliation tab
 *   shows a borehole surplus and a small electricity surplus to the owner.
 *
 * Deterministic: every demo org sees the same numbers. Idempotency is the
 * caller's job (run once per property; `demoUtilitiesState` says whether it
 * has been).
 */

const WATER_RATE = 150;
const POWER_RATE = 28;
const FUEL_RATE = 4;
const DEMO_READER = "Demo Caretaker";

const COSTS = {
  WATER: { amount: 3200, description: "Nairobi Water & Sewerage — council supply (the borehole covers the rest)" },
  ELECTRICITY: { amount: 28000, description: "KPLC — bulk supply for the whole property (tokens)" },
  GENERATOR: { amount: 4000, description: "Generator diesel — standby power" },
} as const;

const round2 = (n: number) => Math.round(n * 100) / 100;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** "none" → safe to seed; "demo" → only this seeder's rows exist; "user" → someone has used it for real. */
export async function demoUtilitiesState(propertyId: string): Promise<"none" | "demo" | "demo-billed" | "user"> {
  const [meters, foreign, billed] = await Promise.all([
    prisma.utilityMeter.count({ where: { propertyId } }),
    prisma.meterReading.count({ where: { meter: { propertyId }, NOT: { readByName: DEMO_READER } } }),
    prisma.meterReading.count({ where: { meter: { propertyId }, invoiceId: { not: null } } }),
  ]);
  if (meters === 0) return "none";
  if (foreign > 0) return "user";
  return billed > 0 ? "demo-billed" : "demo";
}

/** Removes this seeder's meters (readings cascade) and tariffs — only ever called in the "demo" state. */
export async function clearDemoUtilities(propertyId: string): Promise<void> {
  await prisma.utilityMeter.deleteMany({ where: { propertyId } });
  await prisma.utilityTariff.deleteMany({ where: { propertyId } });
}

export async function seedDemoUtilities(propertyId: string, organizationId: string, now = new Date()): Promise<void> {
  const units = await prisma.unit.findMany({
    where: { propertyId },
    orderBy: { unitNumber: "asc" },
    select: { id: true, tenants: { where: { isActive: true }, select: { id: true, leaseStart: true }, take: 1 } },
  });
  if (units.length === 0) return;

  // Invoice periods: the property's three most recent rent-invoice months up
  // to this month — for a fresh seed that is two months ago, last month and
  // this month; for a demo seeded a while back it is ITS OWN window, so the
  // readings land on invoices that exist. Each is billed the readings of the
  // month before it.
  const thisMonth = { year: now.getFullYear(), month: now.getMonth() + 1 };
  const lastMonth = previousPeriod(thisMonth.year, thisMonth.month);
  let invoicePeriods = [previousPeriod(lastMonth.year, lastMonth.month), lastMonth, thisMonth];
  const invoiced = await prisma.invoice.groupBy({
    by: ["periodYear", "periodMonth"],
    where: {
      tenant: { unit: { propertyId } },
      status: { not: "CANCELLED" },
      rentAmount: { gt: 0 },
      OR: [{ periodYear: { lt: thisMonth.year } }, { periodYear: thisMonth.year, periodMonth: { lte: thisMonth.month } }],
    },
    orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
    take: 3,
  });
  if (invoiced.length === 3) {
    invoicePeriods = invoiced.map((p) => ({ year: p.periodYear, month: p.periodMonth })).reverse();
  }
  const readingPeriods = invoicePeriods.map((p) => previousPeriod(p.year, p.month));
  const lastDay = (p: { year: number; month: number }) => new Date(Date.UTC(p.year, p.month, 0, 12));
  const openingDate = lastDay(previousPeriod(readingPeriods[0].year, readingPeriods[0].month));

  const tariffFrom = new Date(Date.UTC(now.getFullYear() - 1, now.getMonth(), 1));
  await prisma.utilityTariff.createMany({
    data: [
      { propertyId, utility: "WATER", effectiveFrom: tariffFrom, supplyRate: WATER_RATE, fuelRate: 0, notes: "Borehole + council water, one rate", createdByName: "Demo Manager" },
      { propertyId, utility: "ELECTRICITY", effectiveFrom: tariffFrom, supplyRate: POWER_RATE, fuelRate: FUEL_RATE, notes: "KPLC domestic rate + generator fuel", createdByName: "Demo Manager" },
    ],
  });

  // ── Who plays which part ───────────────────────────────────────────────────
  const tenantIds = units.map((u) => u.tenants[0]?.id ?? null).filter((t): t is string => !!t);
  const invoices = await prisma.invoice.findMany({
    where: {
      tenantId: { in: tenantIds },
      status: { not: "CANCELLED" },
      rentAmount: { gt: 0 },
      OR: invoicePeriods.map((p) => ({ periodYear: p.year, periodMonth: p.month })),
    },
    select: {
      id: true, tenantId: true, periodYear: true, periodMonth: true, status: true, totalAmount: true, dueDate: true, paidAt: true,
      tenant: { select: { unitId: true } },
      incomeEntries: { select: { date: true, paymentMethod: true }, orderBy: { date: "asc" }, take: 1 },
    },
  });
  const invoiceFor = (tenantId: string, k: number) =>
    invoices.find((i) => i.tenantId === tenantId && i.periodYear === invoicePeriods[k].year && i.periodMonth === invoicePeriods[k].month) ?? null;
  // Tenants who paid all three rent invoices — the cast for the utility-only scenarios.
  const goodPayers = tenantIds.filter((t) => [0, 1, 2].every((k) => invoiceFor(t, k)?.status === "PAID"));
  const enoughCast = goodPayers.length >= 6;
  const rentOnlyTenant = enoughCast ? goodPayers[2] : null; // pays the rent, never the utilities
  const partPaidTenant = enoughCast ? goodPayers[4] : null; // half of this month's electricity
  const awaitingReview = enoughCast ? goodPayers.slice(-2) : []; // last month's readings not approved yet
  const spikeTenant = awaitingReview[1] ?? null;

  // ── Meters + readings ──────────────────────────────────────────────────────
  type ReadingRow = {
    id: string; meterId: string; periodYear: number; periodMonth: number; readingDate: Date;
    previousReading: number; currentReading: number; consumption: number; status: "SUBMITTED" | "APPROVED";
    tenantId: string | null; supplyRate: number | null; fuelRate: number | null; ratePerUnit: number | null; amount: number | null;
    readByName: string; approvedByName: string | null; approvedAt: Date | null; photoPaths: string[];
    notes: string | null;
  };
  const rows: ReadingRow[] = [];
  /** tenantId → per invoice period → the readings billed on it. */
  const billable = new Map<string, { id: string; utility: "WATER" | "ELECTRICITY"; amount: number }[][]>();
  const unitPower = [0, 0, 0];

  function addReadings(meterId: string, utility: "WATER" | "ELECTRICITY", opening: number, use: number[], occupants: (string | null)[], priced: boolean) {
    let previous = opening;
    for (let k = 0; k < 3; k++) {
      const p = readingPeriods[k];
      const tenantId = occupants[k];
      const current = round1(previous + use[k]);
      const consumption = calcConsumption(previous, current);
      const pending = k === 2 && !!tenantId && awaitingReview.includes(tenantId);
      const approved = !pending;
      const supplyRate = utility === "WATER" ? WATER_RATE : POWER_RATE;
      const fuelRate = utility === "WATER" ? 0 : FUEL_RATE;
      const amount = approved && priced ? calcReadingCharge(consumption, supplyRate + fuelRate) : null;
      const id = randomUUID();
      rows.push({
        id, meterId, periodYear: p.year, periodMonth: p.month, readingDate: lastDay(p),
        previousReading: previous, currentReading: current, consumption,
        status: approved ? "APPROVED" : "SUBMITTED",
        tenantId: priced ? tenantId : null,
        supplyRate: amount != null ? supplyRate : null,
        fuelRate: amount != null ? fuelRate : null,
        ratePerUnit: amount != null ? supplyRate + fuelRate : null,
        amount,
        readByName: DEMO_READER,
        approvedByName: approved ? "Demo Manager" : null,
        approvedAt: approved ? lastDay(p) : null,
        photoPaths: [],
        notes: pending && tenantId === spikeTenant && utility === "ELECTRICITY" ? "Tenant says they ran a welding machine this month." : null,
      });
      if (amount != null && amount > 0 && tenantId) {
        const perPeriod = billable.get(tenantId) ?? [[], [], []];
        perPeriod[k].push({ id, utility, amount });
        billable.set(tenantId, perPeriod);
      }
      previous = current;
    }
  }

  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    const tenant = u.tenants[0] ?? null;
    // Who was in the unit each reading month: a tenant whose lease started
    // later (someone added to the demo since) was not there — the unit reads
    // as vacant for that month and is never billed to them.
    const occupants = readingPeriods.map((p) => (tenant && tenant.leaseStart.getTime() <= lastDay(p).getTime() ? tenant.id : null));
    // A vacant unit barely moves; the spike tenant triples last month's power.
    const spike = tenant && tenant.id === spikeTenant ? 3.2 : 1;
    const waterUse = [4 + (i % 5), 5 + ((i * 3) % 4), 4 + ((i * 2) % 5)].map((x, k) => round1(x * (occupants[k] ? 1 : 0.1)));
    const powerUse = [120 + ((i * 17) % 90), 135 + ((i * 23) % 80), 128 + ((i * 13) % 85)].map((x, k) => Math.round(x * (occupants[k] ? 1 : 0.1) * (k === 2 ? spike : 1)));
    powerUse.forEach((x, k) => { unitPower[k] += x; });

    const water = await prisma.utilityMeter.create({
      data: { organizationId, propertyId, unitId: u.id, utility: "WATER", role: "UNIT", label: "Water", meterNumber: `W-${1000 + i}`, openingReading: 100 + i * 37, openingReadingDate: openingDate },
    });
    const power = await prisma.utilityMeter.create({
      data: { organizationId, propertyId, unitId: u.id, utility: "ELECTRICITY", role: "UNIT", label: "Electricity", meterNumber: `E-${5000 + i}`, openingReading: 2000 + i * 311, openingReadingDate: openingDate },
    });
    addReadings(water.id, "WATER", 100 + i * 37, waterUse, occupants, true);
    addReadings(power.id, "ELECTRICITY", 2000 + i * 311, powerUse, occupants, true);
  }

  const commonUse = [310, 295, 302];
  const common = await prisma.utilityMeter.create({
    data: { organizationId, propertyId, utility: "ELECTRICITY", role: "COMMON", label: "Common areas", meterNumber: "E-COMMON", openingReading: 8400, openingReadingDate: openingDate },
  });
  const bulk = await prisma.utilityMeter.create({
    data: { organizationId, propertyId, utility: "ELECTRICITY", role: "BULK", label: "KPLC bulk meter", meterNumber: "KPLC-BULK", openingReading: 152000, openingReadingDate: openingDate },
  });
  addReadings(common.id, "ELECTRICITY", 8400, commonUse, [null, null, null], false);
  // Bulk = everything downstream + ~3% line loss.
  addReadings(bulk.id, "ELECTRICITY", 152000, unitPower.map((x, k) => Math.round((x + commonUse[k]) * 1.03)), [null, null, null], false);

  await prisma.meterReading.createMany({ data: rows });

  // ── Bill the readings on the rent invoices + book the payments ─────────────
  for (const tenantId of tenantIds) {
    const perPeriod = billable.get(tenantId);
    if (!perPeriod) continue;
    for (let k = 0; k < 3; k++) {
      const inv = invoiceFor(tenantId, k);
      const readings = perPeriod[k];
      if (!inv || readings.length === 0) continue;

      const water = round2(readings.filter((r) => r.utility === "WATER").reduce((s, r) => s + r.amount, 0));
      const electricity = round2(readings.filter((r) => r.utility === "ELECTRICITY").reduce((s, r) => s + r.amount, 0));
      const rentSide = inv.totalAmount;
      const total = round2(rentSide + water + electricity);
      const wasPaid = inv.status === "PAID";
      const rentOnly = wasPaid && tenantId === rentOnlyTenant && k >= 1;
      const partPaid = wasPaid && tenantId === partPaidTenant && k === 2;
      const openStatus = inv.dueDate.getTime() < now.getTime() ? ("OVERDUE" as const) : ("SENT" as const);

      // What the tenant paid towards utilities (the rent receipt already exists).
      const paidWater = !wasPaid || rentOnly ? 0 : water;
      const paidElectricity = !wasPaid || rentOnly ? 0 : partPaid ? round2(electricity / 2) : electricity;
      const payDate = inv.incomeEntries[0]?.date ?? inv.paidAt ?? inv.dueDate;
      const paymentMethod = inv.incomeEntries[0]?.paymentMethod ?? null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ops: any[] = [
        prisma.invoice.update({
          where: { id: inv.id },
          data: {
            waterAmount: water,
            electricityAmount: electricity,
            totalAmount: total,
            meterReadings: { connect: readings.map((r) => ({ id: r.id })) },
            ...(wasPaid
              ? rentOnly || partPaid
                ? { status: openStatus, paidAt: null, paidAmount: round2(rentSide + paidWater + paidElectricity) }
                : { paidAmount: total }
              : {}),
          },
        }),
      ];
      for (const [utility, amount] of [["WATER", paidWater], ["ELECTRICITY", paidElectricity]] as const) {
        if (amount <= 0) continue;
        ops.push(
          prisma.incomeEntry.create({
            data: {
              date: payDate, unitId: inv.tenant.unitId, tenantId, invoiceId: inv.id,
              type: "UTILITY_RECOVERY", utilityType: utility, grossAmount: amount, agentCommission: 0,
              paymentMethod, note: `Auto-created from invoice payment (${utility === "WATER" ? "water" : "electricity"})`,
            },
          }),
        );
      }
      await prisma.$transaction(ops);
    }
  }

  // ── Supplier costs for the reconciliation ──────────────────────────────────
  // Re-size the demo's council and KPLC bills for a sub-metered building and
  // add generator diesel, month by month across the invoice window.
  for (const p of invoicePeriods) {
    const from = new Date(p.year, p.month - 1, 1);
    const to = new Date(p.year, p.month, 1);
    for (const category of ["WATER", "ELECTRICITY", "GENERATOR"] as const) {
      const cost = COSTS[category];
      const existing = await prisma.expenseEntry.findFirst({
        where: { propertyId, category, scope: "PROPERTY", date: { gte: from, lt: to } },
        select: { id: true },
      });
      if (existing) {
        await prisma.expenseEntry.update({ where: { id: existing.id }, data: { amount: cost.amount, description: cost.description } });
      } else {
        await prisma.expenseEntry.create({
          data: {
            date: from, propertyId, organizationId, scope: "PROPERTY", category,
            amount: cost.amount, description: cost.description, isSunkCost: false, paidFromPettyCash: false,
          },
        });
      }
    }
  }
}
