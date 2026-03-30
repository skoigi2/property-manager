/**
 * seed-mayfair.ts
 * Idempotent script — safe to run against production.
 * Adds Mayfair Suites (5 units, Jan–Mar 2026 demo data) without touching any existing data.
 *
 * Run with:  npx ts-node -P tsconfig.seed.json prisma/seed-mayfair.ts
 */
import { PrismaClient, PropertyType, UnitType, UnitStatus, IncomeType, Platform, ExpenseCategory, ExpenseScope, PettyCashType } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding Mayfair Suites...");

  // ── Find Alba Gardens to copy organisationId and existing user access ──────
  const albaGardens = await prisma.property.findFirst({ where: { name: "Alba Gardens" } });
  if (!albaGardens) {
    throw new Error("Alba Gardens not found. Make sure you are connected to the correct database.");
  }
  const orgId = albaGardens.organizationId;
  console.log(`✓ Found Alba Gardens (orgId: ${orgId ?? "null — super-admin context"})`);

  // ── Property (upsert by name) ──────────────────────────────────────────────
  const mayfairSuites = await prisma.property.upsert({
    where: { name: "Mayfair Suites" } as any,
    create: {
      name: "Mayfair Suites",
      type: PropertyType.AIRBNB,
      ...(orgId ? { organizationId: orgId } : {}),
    },
    update: {},
  });
  console.log(`✓ Property: ${mayfairSuites.name} (${mayfairSuites.id})`);

  // ── Copy PropertyAccess from Alba Gardens to Mayfair Suites ───────────────
  const albaAccess = await prisma.propertyAccess.findMany({
    where: { propertyId: albaGardens.id },
    select: { userId: true },
  });
  for (const { userId } of albaAccess) {
    await prisma.propertyAccess.upsert({
      where: { userId_propertyId: { userId, propertyId: mayfairSuites.id } },
      create: { userId, propertyId: mayfairSuites.id },
      update: {},
    });
  }
  console.log(`✓ PropertyAccess copied for ${albaAccess.length} user(s)`);

  // ── Units (upsert by propertyId + unitNumber) ─────────────────────────────
  async function upsertUnit(unitNumber: string, type: UnitType) {
    return prisma.unit.upsert({
      where: { propertyId_unitNumber: { propertyId: mayfairSuites.id, unitNumber } },
      create: { unitNumber, propertyId: mayfairSuites.id, type, monthlyRent: null, status: UnitStatus.ACTIVE },
      update: {},
    });
  }

  const unitM101 = await upsertUnit("M101", UnitType.ONE_BED);
  const unitM102 = await upsertUnit("M102", UnitType.ONE_BED);
  const unitM201 = await upsertUnit("M201", UnitType.TWO_BED);
  const unitM202 = await upsertUnit("M202", UnitType.TWO_BED);
  const unitM301 = await upsertUnit("M301", UnitType.THREE_BED);
  console.log("✓ Units upserted: M101, M102, M201, M202, M301");

  // ── Helper: only create a booking if none exists for that unit + checkIn ──
  async function addBooking(
    unitId: string, date: Date, grossAmount: number, commission: number,
    platform: Platform, agentName?: string, note?: string,
    checkIn?: Date, checkOut?: Date
  ) {
    const existing = await prisma.incomeEntry.findFirst({
      where: { unitId, type: IncomeType.AIRBNB, checkIn: checkIn ?? null },
    });
    if (!existing) {
      await prisma.incomeEntry.create({
        data: { unitId, type: IncomeType.AIRBNB, date, grossAmount, agentCommission: commission, platform, agentName, note, checkIn, checkOut },
      });
    }
  }

  // ── JANUARY 2026 ──────────────────────────────────────────────────────────
  await addBooking(unitM101.id, new Date("2026-01-03"), 47500, 0, Platform.DIRECT, undefined, "Direct — Jan early stay", new Date("2026-01-03"), new Date("2026-01-08"));
  await addBooking(unitM101.id, new Date("2026-01-14"), 70000, 7000, Platform.AIRBNB, undefined, "Airbnb — Jan mid", new Date("2026-01-14"), new Date("2026-01-21"));
  await addBooking(unitM101.id, new Date("2026-01-25"), 76000, 3500, Platform.AGENT, "James", "Via James — Jan into Feb", new Date("2026-01-25"), new Date("2026-02-02"));
  await addBooking(unitM102.id, new Date("2026-01-06"), 66500, 6650, Platform.AIRBNB, undefined, "Airbnb — Jan", new Date("2026-01-06"), new Date("2026-01-13"));
  await addBooking(unitM102.id, new Date("2026-01-18"), 70000, 7000, Platform.BOOKING_COM, undefined, "Booking.com — Jan mid", new Date("2026-01-18"), new Date("2026-01-25"));
  await addBooking(unitM102.id, new Date("2026-01-29"), 73500, 0, Platform.DIRECT, undefined, "Direct — Jan into Feb", new Date("2026-01-29"), new Date("2026-02-05"));
  await addBooking(unitM201.id, new Date("2026-01-02"), 98000, 9800, Platform.AIRBNB, undefined, "Airbnb — Jan week 1", new Date("2026-01-02"), new Date("2026-01-09"));
  await addBooking(unitM201.id, new Date("2026-01-13"), 105000, 0, Platform.DIRECT, undefined, "Direct — Jan week 3", new Date("2026-01-13"), new Date("2026-01-20"));
  await addBooking(unitM201.id, new Date("2026-01-25"), 130500, 13050, Platform.BOOKING_COM, undefined, "Booking.com — Jan into Feb", new Date("2026-01-25"), new Date("2026-02-03"));
  await addBooking(unitM202.id, new Date("2026-01-05"), 94500, 9450, Platform.BOOKING_COM, undefined, "Booking.com — Jan", new Date("2026-01-05"), new Date("2026-01-12"));
  await addBooking(unitM202.id, new Date("2026-01-16"), 98000, 4500, Platform.AGENT, "Sarah", "Via Sarah — Jan week 3", new Date("2026-01-16"), new Date("2026-01-23"));
  await addBooking(unitM202.id, new Date("2026-01-28"), 98000, 0, Platform.DIRECT, undefined, "Direct — Jan into Feb", new Date("2026-01-28"), new Date("2026-02-04"));
  await addBooking(unitM301.id, new Date("2026-01-03"), 154000, 0, Platform.DIRECT, undefined, "Direct — Jan week 1", new Date("2026-01-03"), new Date("2026-01-10"));
  await addBooking(unitM301.id, new Date("2026-01-14"), 161000, 16100, Platform.AIRBNB, undefined, "Airbnb — Jan week 3", new Date("2026-01-14"), new Date("2026-01-21"));
  await addBooking(unitM301.id, new Date("2026-01-25"), 210000, 8500, Platform.AGENT, "David", "Via David — Jan into Feb (10 nights)", new Date("2026-01-25"), new Date("2026-02-04"));

  // ── FEBRUARY 2026 ─────────────────────────────────────────────────────────
  await addBooking(unitM101.id, new Date("2026-02-07"), 77000, 7700, Platform.BOOKING_COM, undefined, "Booking.com — Feb week 2", new Date("2026-02-07"), new Date("2026-02-14"));
  await addBooking(unitM101.id, new Date("2026-02-18"), 60000, 0, Platform.DIRECT, undefined, "Direct — Feb week 3", new Date("2026-02-18"), new Date("2026-02-24"));
  await addBooking(unitM102.id, new Date("2026-02-10"), 57000, 3200, Platform.AGENT, "Sarah", "Via Sarah — Feb mid", new Date("2026-02-10"), new Date("2026-02-16"));
  await addBooking(unitM102.id, new Date("2026-02-20"), 77000, 7700, Platform.AIRBNB, undefined, "Airbnb — Feb week 4", new Date("2026-02-20"), new Date("2026-02-27"));
  await addBooking(unitM201.id, new Date("2026-02-08"), 98000, 4500, Platform.AGENT, "Grace", "Via Grace — Feb week 2", new Date("2026-02-08"), new Date("2026-02-15"));
  await addBooking(unitM201.id, new Date("2026-02-19"), 105000, 10500, Platform.AIRBNB, undefined, "Airbnb — Feb week 3", new Date("2026-02-19"), new Date("2026-02-26"));
  await addBooking(unitM202.id, new Date("2026-02-09"), 101500, 10150, Platform.AIRBNB, undefined, "Airbnb — Feb week 2", new Date("2026-02-09"), new Date("2026-02-16"));
  await addBooking(unitM202.id, new Date("2026-02-20"), 94500, 9450, Platform.BOOKING_COM, undefined, "Booking.com — Feb week 4", new Date("2026-02-20"), new Date("2026-02-27"));
  await addBooking(unitM301.id, new Date("2026-02-09"), 168000, 16800, Platform.BOOKING_COM, undefined, "Booking.com — Feb week 2", new Date("2026-02-09"), new Date("2026-02-16"));
  await addBooking(unitM301.id, new Date("2026-02-20"), 154000, 0, Platform.DIRECT, undefined, "Direct — Feb week 4", new Date("2026-02-20"), new Date("2026-02-27"));

  // ── MARCH 2026 ────────────────────────────────────────────────────────────
  await addBooking(unitM101.id, new Date("2026-03-01"), 66000, 6600, Platform.AIRBNB, undefined, "Airbnb — Mar week 1", new Date("2026-03-01"), new Date("2026-03-07"));
  await addBooking(unitM101.id, new Date("2026-03-12"), 73500, 3500, Platform.AGENT, "Grace", "Via Grace — Mar week 2", new Date("2026-03-12"), new Date("2026-03-19"));
  await addBooking(unitM101.id, new Date("2026-03-24"), 66000, 0, Platform.DIRECT, undefined, "Direct — Mar week 4", new Date("2026-03-24"), new Date("2026-03-30"));
  await addBooking(unitM102.id, new Date("2026-03-04"), 73500, 7350, Platform.BOOKING_COM, undefined, "Booking.com — Mar week 1", new Date("2026-03-04"), new Date("2026-03-11"));
  await addBooking(unitM102.id, new Date("2026-03-16"), 66000, 0, Platform.DIRECT, undefined, "Direct — Mar week 3", new Date("2026-03-16"), new Date("2026-03-22"));
  await addBooking(unitM102.id, new Date("2026-03-27"), 70000, 3500, Platform.AGENT, "James", "Via James — Mar into Apr", new Date("2026-03-27"), new Date("2026-04-03"));
  await addBooking(unitM201.id, new Date("2026-03-02"), 105000, 0, Platform.DIRECT, undefined, "Direct — Mar week 1", new Date("2026-03-02"), new Date("2026-03-09"));
  await addBooking(unitM201.id, new Date("2026-03-13"), 101500, 10150, Platform.BOOKING_COM, undefined, "Booking.com — Mar week 2", new Date("2026-03-13"), new Date("2026-03-20"));
  await addBooking(unitM201.id, new Date("2026-03-24"), 108500, 10850, Platform.AIRBNB, undefined, "Airbnb — Mar week 4", new Date("2026-03-24"), new Date("2026-03-31"));
  await addBooking(unitM202.id, new Date("2026-03-04"), 112000, 5000, Platform.AGENT, "James", "Via James — Mar week 1", new Date("2026-03-04"), new Date("2026-03-12"));
  await addBooking(unitM202.id, new Date("2026-03-16"), 105000, 0, Platform.DIRECT, undefined, "Direct — Mar week 3", new Date("2026-03-16"), new Date("2026-03-23"));
  await addBooking(unitM202.id, new Date("2026-03-27"), 101500, 10150, Platform.AIRBNB, undefined, "Airbnb — Mar into Apr", new Date("2026-03-27"), new Date("2026-04-03"));
  await addBooking(unitM301.id, new Date("2026-03-03"), 168000, 16800, Platform.AIRBNB, undefined, "Airbnb — Mar week 1", new Date("2026-03-03"), new Date("2026-03-10"));
  await addBooking(unitM301.id, new Date("2026-03-14"), 184000, 18400, Platform.BOOKING_COM, undefined, "Booking.com — Mar week 2", new Date("2026-03-14"), new Date("2026-03-22"));
  await addBooking(unitM301.id, new Date("2026-03-26"), 168000, 0, Platform.DIRECT, undefined, "Direct — Mar into Apr", new Date("2026-03-26"), new Date("2026-04-02"));

  console.log("✓ Bookings inserted (45 entries across Jan–Mar 2026)");

  // ── EXPENSES ──────────────────────────────────────────────────────────────
  // Only create if no expenses exist for this property yet
  const existingExpenses = await prisma.expenseEntry.count({ where: { propertyId: mayfairSuites.id } });
  if (existingExpenses === 0) {
    const months = [
      { date: new Date("2026-01-01"), month: "January 2026" },
      { date: new Date("2026-02-01"), month: "February 2026" },
      { date: new Date("2026-03-01"), month: "March 2026" },
    ];

    for (const { date, month } of months) {
      await prisma.expenseEntry.createMany({
        data: [
          { unitId: unitM101.id, propertyId: mayfairSuites.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.SERVICE_CHARGE, amount: 10500, date, description: `Service charge ${month}`, isSunkCost: false },
          { unitId: unitM101.id, propertyId: mayfairSuites.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.WIFI, amount: 3000, date, description: `Wi-Fi ${month}`, isSunkCost: false },
          { unitId: unitM101.id, propertyId: mayfairSuites.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.WATER, amount: 500, date, description: `Water ${month}`, isSunkCost: false },
          { unitId: unitM101.id, propertyId: mayfairSuites.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.CLEANER, amount: 5500, date, description: `Cleaner ${month}`, isSunkCost: false },
          { unitId: unitM102.id, propertyId: mayfairSuites.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.SERVICE_CHARGE, amount: 10500, date, description: `Service charge ${month}`, isSunkCost: false },
          { unitId: unitM102.id, propertyId: mayfairSuites.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.WIFI, amount: 3000, date, description: `Wi-Fi ${month}`, isSunkCost: false },
          { unitId: unitM102.id, propertyId: mayfairSuites.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.WATER, amount: 500, date, description: `Water ${month}`, isSunkCost: false },
          { unitId: unitM102.id, propertyId: mayfairSuites.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.CLEANER, amount: 5500, date, description: `Cleaner ${month}`, isSunkCost: false },
          { unitId: unitM201.id, propertyId: mayfairSuites.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.SERVICE_CHARGE, amount: 13000, date, description: `Service charge ${month}`, isSunkCost: false },
          { unitId: unitM201.id, propertyId: mayfairSuites.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.WIFI, amount: 3500, date, description: `Wi-Fi ${month}`, isSunkCost: false },
          { unitId: unitM201.id, propertyId: mayfairSuites.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.WATER, amount: 800, date, description: `Water ${month}`, isSunkCost: false },
          { unitId: unitM201.id, propertyId: mayfairSuites.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.CLEANER, amount: 7000, date, description: `Cleaner ${month}`, isSunkCost: false },
          { unitId: unitM202.id, propertyId: mayfairSuites.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.SERVICE_CHARGE, amount: 13000, date, description: `Service charge ${month}`, isSunkCost: false },
          { unitId: unitM202.id, propertyId: mayfairSuites.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.WIFI, amount: 3500, date, description: `Wi-Fi ${month}`, isSunkCost: false },
          { unitId: unitM202.id, propertyId: mayfairSuites.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.WATER, amount: 800, date, description: `Water ${month}`, isSunkCost: false },
          { unitId: unitM202.id, propertyId: mayfairSuites.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.CLEANER, amount: 7000, date, description: `Cleaner ${month}`, isSunkCost: false },
          { unitId: unitM301.id, propertyId: mayfairSuites.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.SERVICE_CHARGE, amount: 16000, date, description: `Service charge ${month}`, isSunkCost: false },
          { unitId: unitM301.id, propertyId: mayfairSuites.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.WIFI, amount: 4000, date, description: `Wi-Fi ${month}`, isSunkCost: false },
          { unitId: unitM301.id, propertyId: mayfairSuites.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.WATER, amount: 1200, date, description: `Water ${month}`, isSunkCost: false },
          { unitId: unitM301.id, propertyId: mayfairSuites.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.CLEANER, amount: 10000, date, description: `Cleaner ${month}`, isSunkCost: false },
        ],
      });
    }

    // Variable electricity & consumables
    await prisma.expenseEntry.createMany({
      data: [
        // January electricity
        { unitId: unitM101.id, propertyId: mayfairSuites.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.ELECTRICITY, amount: 1480, date: new Date("2026-01-31"), description: "Electricity January", isSunkCost: false },
        { unitId: unitM102.id, propertyId: mayfairSuites.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.ELECTRICITY, amount: 1320, date: new Date("2026-01-31"), description: "Electricity January", isSunkCost: false },
        { unitId: unitM201.id, propertyId: mayfairSuites.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.ELECTRICITY, amount: 2150, date: new Date("2026-01-31"), description: "Electricity January", isSunkCost: false },
        { unitId: unitM202.id, propertyId: mayfairSuites.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.ELECTRICITY, amount: 1980, date: new Date("2026-01-31"), description: "Electricity January", isSunkCost: false },
        { unitId: unitM301.id, propertyId: mayfairSuites.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.ELECTRICITY, amount: 3240, date: new Date("2026-01-31"), description: "Electricity January", isSunkCost: false },
        // January consumables
        { unitId: unitM101.id, propertyId: mayfairSuites.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.CONSUMABLES, amount: 2000, date: new Date("2026-01-15"), description: "Consumables January", isSunkCost: false },
        { unitId: unitM102.id, propertyId: mayfairSuites.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.CONSUMABLES, amount: 2000, date: new Date("2026-01-15"), description: "Consumables January", isSunkCost: false },
        { unitId: unitM201.id, propertyId: mayfairSuites.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.CONSUMABLES, amount: 2500, date: new Date("2026-01-15"), description: "Consumables January", isSunkCost: false },
        { unitId: unitM202.id, propertyId: mayfairSuites.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.CONSUMABLES, amount: 2500, date: new Date("2026-01-15"), description: "Consumables January", isSunkCost: false },
        { unitId: unitM301.id, propertyId: mayfairSuites.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.CONSUMABLES, amount: 3500, date: new Date("2026-01-15"), description: "Consumables January", isSunkCost: false },
        // February electricity
        { unitId: unitM101.id, propertyId: mayfairSuites.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.ELECTRICITY, amount: 1210, date: new Date("2026-02-28"), description: "Electricity February", isSunkCost: false },
        { unitId: unitM102.id, propertyId: mayfairSuites.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.ELECTRICITY, amount: 1390, date: new Date("2026-02-28"), description: "Electricity February", isSunkCost: false },
        { unitId: unitM201.id, propertyId: mayfairSuites.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.ELECTRICITY, amount: 1870, date: new Date("2026-02-28"), description: "Electricity February", isSunkCost: false },
        { unitId: unitM202.id, propertyId: mayfairSuites.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.ELECTRICITY, amount: 2230, date: new Date("2026-02-28"), description: "Electricity February", isSunkCost: false },
        { unitId: unitM301.id, propertyId: mayfairSuites.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.ELECTRICITY, amount: 2980, date: new Date("2026-02-28"), description: "Electricity February", isSunkCost: false },
        // March electricity
        { unitId: unitM101.id, propertyId: mayfairSuites.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.ELECTRICITY, amount: 1560, date: new Date("2026-03-31"), description: "Electricity March", isSunkCost: false },
        { unitId: unitM102.id, propertyId: mayfairSuites.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.ELECTRICITY, amount: 1440, date: new Date("2026-03-31"), description: "Electricity March", isSunkCost: false },
        { unitId: unitM201.id, propertyId: mayfairSuites.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.ELECTRICITY, amount: 2080, date: new Date("2026-03-31"), description: "Electricity March", isSunkCost: false },
        { unitId: unitM202.id, propertyId: mayfairSuites.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.ELECTRICITY, amount: 1950, date: new Date("2026-03-31"), description: "Electricity March", isSunkCost: false },
        { unitId: unitM301.id, propertyId: mayfairSuites.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.ELECTRICITY, amount: 3110, date: new Date("2026-03-31"), description: "Electricity March", isSunkCost: false },
        // March consumables
        { unitId: unitM201.id, propertyId: mayfairSuites.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.CONSUMABLES, amount: 2500, date: new Date("2026-03-18"), description: "Consumables March", isSunkCost: false },
        { unitId: unitM202.id, propertyId: mayfairSuites.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.CONSUMABLES, amount: 2500, date: new Date("2026-03-18"), description: "Consumables March", isSunkCost: false },
        { unitId: unitM301.id, propertyId: mayfairSuites.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.CONSUMABLES, amount: 3500, date: new Date("2026-03-18"), description: "Consumables March", isSunkCost: false },
      ],
    });

    // Capital / sunk costs
    await prisma.expenseEntry.createMany({
      data: [
        { unitId: unitM201.id, propertyId: mayfairSuites.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.CAPITAL, amount: 35000, date: new Date("2026-01-15"), description: "Smart TV replacement M201", isSunkCost: true },
        { unitId: unitM301.id, propertyId: mayfairSuites.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.CAPITAL, amount: 8500, date: new Date("2026-01-20"), description: "Coffee machine M301", isSunkCost: true },
        { unitId: unitM101.id, propertyId: mayfairSuites.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.CAPITAL, amount: 18000, date: new Date("2026-02-10"), description: "Mattress replacement M101", isSunkCost: true },
        { unitId: unitM301.id, propertyId: mayfairSuites.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.CAPITAL, amount: 15000, date: new Date("2026-03-05"), description: "Deep clean & carpet treatment M301", isSunkCost: true },
      ],
    });

    // Management fees
    await prisma.expenseEntry.createMany({
      data: [
        { propertyId: mayfairSuites.id, scope: ExpenseScope.PORTFOLIO, category: ExpenseCategory.MANAGEMENT_FEE, amount: 155000, date: new Date("2026-01-31"), description: "Management fee January 2026 — Mayfair Suites", isSunkCost: false },
        { propertyId: mayfairSuites.id, scope: ExpenseScope.PORTFOLIO, category: ExpenseCategory.MANAGEMENT_FEE, amount: 99000, date: new Date("2026-02-28"), description: "Management fee February 2026 — Mayfair Suites", isSunkCost: false },
        { propertyId: mayfairSuites.id, scope: ExpenseScope.PORTFOLIO, category: ExpenseCategory.MANAGEMENT_FEE, amount: 157000, date: new Date("2026-03-31"), description: "Management fee March 2026 — Mayfair Suites", isSunkCost: false },
      ],
    });

    console.log("✓ Expenses inserted");
  } else {
    console.log(`⚠️  Expenses already exist (${existingExpenses} rows) — skipped`);
  }

  // ── PETTY CASH ────────────────────────────────────────────────────────────
  const existingPettyCash = await prisma.pettyCash.count({ where: { propertyId: mayfairSuites.id } });
  if (existingPettyCash === 0) {
    await prisma.pettyCash.createMany({
      data: [
        { propertyId: mayfairSuites.id, date: new Date("2026-01-05"), type: PettyCashType.IN, amount: 15000, description: "Opening petty cash float — Mayfair Suites" },
        { propertyId: mayfairSuites.id, date: new Date("2026-02-01"), type: PettyCashType.IN, amount: 12000, description: "Petty cash top-up February" },
        { propertyId: mayfairSuites.id, date: new Date("2026-03-01"), type: PettyCashType.IN, amount: 12000, description: "Petty cash top-up March" },
        { propertyId: mayfairSuites.id, date: new Date("2026-01-12"), type: PettyCashType.OUT, amount: 3500, description: "Cleaning supplies all units Jan" },
        { propertyId: mayfairSuites.id, date: new Date("2026-01-20"), type: PettyCashType.OUT, amount: 5000, description: "Electricity tokens January" },
        { propertyId: mayfairSuites.id, date: new Date("2026-01-28"), type: PettyCashType.OUT, amount: 4200, description: "Minor repairs M101 & M102" },
        { propertyId: mayfairSuites.id, date: new Date("2026-02-08"), type: PettyCashType.OUT, amount: 6000, description: "Consumables restock February" },
        { propertyId: mayfairSuites.id, date: new Date("2026-02-15"), type: PettyCashType.OUT, amount: 3800, description: "Emergency shower fix M202" },
        { propertyId: mayfairSuites.id, date: new Date("2026-02-25"), type: PettyCashType.OUT, amount: 5500, description: "Various maintenance February" },
        { propertyId: mayfairSuites.id, date: new Date("2026-03-07"), type: PettyCashType.OUT, amount: 4500, description: "Cleaning equipment purchase" },
        { propertyId: mayfairSuites.id, date: new Date("2026-03-15"), type: PettyCashType.OUT, amount: 6000, description: "Consumables & guest supplies Mar" },
        { propertyId: mayfairSuites.id, date: new Date("2026-03-22"), type: PettyCashType.OUT, amount: 5500, description: "Miscellaneous expenses March" },
      ],
    });
    console.log("✓ Petty cash inserted");
  } else {
    console.log(`⚠️  Petty cash already exists (${existingPettyCash} rows) — skipped`);
  }

  console.log("");
  console.log("✅ Mayfair Suites seed complete!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
