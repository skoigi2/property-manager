import { PrismaClient, PropertyType, UnitType, UnitStatus, IncomeType, Platform, ExpenseCategory, ExpenseScope, PettyCashType, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting seed...");

  // ─── CLEAN UP ───────────────────────────────────────────────────────────────
  await prisma.managementFeeConfig.deleteMany();
  await prisma.incomeEntry.deleteMany();
  await prisma.expenseEntry.deleteMany();
  await prisma.pettyCash.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.unit.deleteMany();
  await prisma.property.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();

  // ─── USERS ──────────────────────────────────────────────────────────────────
  const managerPassword = await bcrypt.hash("manager123", 10);
  const ownerPassword = await bcrypt.hash("owner123", 10);

  const manager = await prisma.user.create({
    data: {
      name: "Property Manager",
      email: "manager@alba.co.ke",
      password: managerPassword,
      role: UserRole.MANAGER,
    },
  });

  const owner = await prisma.user.create({
    data: {
      name: "Pauline Wanjiku",
      email: "owner@alba.co.ke",
      password: ownerPassword,
      role: UserRole.OWNER,
    },
  });

  console.log("✓ Users seeded");

  // ─── PROPERTIES ─────────────────────────────────────────────────────────────
  const riaraOne = await prisma.property.create({
    data: { name: "Riara One", type: PropertyType.LONGTERM },
  });

  const albaGardens = await prisma.property.create({
    data: { name: "Alba Gardens", type: PropertyType.AIRBNB },
  });

  console.log("✓ Properties seeded");

  // ─── UNITS ──────────────────────────────────────────────────────────────────
  // Riara One units
  const unitA141C = await prisma.unit.create({
    data: { unitNumber: "A14-1C", propertyId: riaraOne.id, type: UnitType.ONE_BED, monthlyRent: 75000, status: UnitStatus.ACTIVE },
  });
  const unitC1106 = await prisma.unit.create({
    data: { unitNumber: "C11-06", propertyId: riaraOne.id, type: UnitType.TWO_BED, monthlyRent: 110000, status: UnitStatus.ACTIVE },
  });
  const unitC1107 = await prisma.unit.create({
    data: { unitNumber: "C11-07", propertyId: riaraOne.id, type: UnitType.TWO_BED, monthlyRent: 110000, status: UnitStatus.ACTIVE },
  });
  const unitC1108 = await prisma.unit.create({
    data: { unitNumber: "C11-08", propertyId: riaraOne.id, type: UnitType.ONE_BED, monthlyRent: 75000, status: UnitStatus.ACTIVE },
  });
  const unitC1008 = await prisma.unit.create({
    data: { unitNumber: "C10-08", propertyId: riaraOne.id, type: UnitType.ONE_BED, monthlyRent: 75000, status: UnitStatus.ACTIVE },
  });

  // Alba Gardens units
  const unitA1506 = await prisma.unit.create({
    data: { unitNumber: "A1506", propertyId: albaGardens.id, type: UnitType.TWO_BED, monthlyRent: null, status: UnitStatus.ACTIVE },
  });
  const unitA901 = await prisma.unit.create({
    data: { unitNumber: "A901", propertyId: albaGardens.id, type: UnitType.ONE_BED, monthlyRent: null, status: UnitStatus.ACTIVE },
  });
  const unitA1205 = await prisma.unit.create({
    data: { unitNumber: "A1205", propertyId: albaGardens.id, type: UnitType.ONE_BED, monthlyRent: null, status: UnitStatus.ACTIVE },
  });

  console.log("✓ Units seeded");

  // ─── TENANTS ────────────────────────────────────────────────────────────────
  await prisma.tenant.createMany({
    data: [
      {
        name: "Brenda Bett & Leonard Kip",
        unitId: unitA141C.id,
        depositAmount: 150000,
        leaseStart: new Date("2024-07-01"),
        leaseEnd: new Date("2026-06-30"),
        monthlyRent: 75000,
        serviceCharge: 5000,
        isActive: true,
      },
      {
        name: "Carol Chepchirchir",
        unitId: unitC1106.id,
        depositAmount: 220000,
        leaseStart: new Date("2023-01-01"),
        leaseEnd: null, // TBC — persistent alert
        monthlyRent: 110000,
        serviceCharge: 7000,
        isActive: true,
      },
      {
        name: "Mary Karimi Nyaga",
        unitId: unitC1107.id,
        depositAmount: 160000,
        leaseStart: new Date("2025-10-01"),
        leaseEnd: new Date("2026-10-01"),
        monthlyRent: 110000,
        serviceCharge: 7000,
        isActive: true,
      },
      {
        name: "Edwin Livingstone",
        unitId: unitC1108.id,
        depositAmount: 150000,
        leaseStart: new Date("2024-06-01"),
        leaseEnd: new Date("2026-05-31"),
        monthlyRent: 75000,
        serviceCharge: 5000,
        isActive: true,
      },
      {
        name: "Karen Rose Wagaki",
        unitId: unitC1008.id,
        depositAmount: 150000,
        leaseStart: new Date("2024-07-01"),
        leaseEnd: new Date("2026-06-30"),
        monthlyRent: 75000,
        serviceCharge: 5000,
        isActive: true,
      },
    ],
  });

  console.log("✓ Tenants seeded");

  // ─── MANAGEMENT FEE CONFIGS ─────────────────────────────────────────────────
  const feeStart = new Date("2025-06-01");

  // Riara One — flat fees
  await prisma.managementFeeConfig.createMany({
    data: [
      { unitId: unitA141C.id, ratePercent: 0, flatAmount: 6000, effectiveFrom: feeStart },
      { unitId: unitC1106.id, ratePercent: 0, flatAmount: 8800, effectiveFrom: feeStart },
      { unitId: unitC1107.id, ratePercent: 0, flatAmount: 8800, effectiveFrom: feeStart },
      { unitId: unitC1108.id, ratePercent: 0, flatAmount: 6000, effectiveFrom: feeStart },
      { unitId: unitC1008.id, ratePercent: 0, flatAmount: 6000, effectiveFrom: feeStart },
      // Alba Gardens — 10% of gross
      { unitId: unitA1506.id, ratePercent: 10, flatAmount: null, effectiveFrom: feeStart },
      { unitId: unitA901.id, ratePercent: 10, flatAmount: null, effectiveFrom: feeStart },
      { unitId: unitA1205.id, ratePercent: 10, flatAmount: null, effectiveFrom: feeStart },
    ],
  });

  console.log("✓ Management fee configs seeded");

  // ─── HISTORICAL INCOME ENTRIES ───────────────────────────────────────────────
  // Based on extracted Excel data (Jun–Oct 2025)

  // Helper: Riara One monthly rent entry
  async function addRent(unitId: string, date: Date, amount: number, svcCharge: number, note?: string) {
    await prisma.incomeEntry.create({
      data: { unitId, type: IncomeType.LONGTERM_RENT, date, grossAmount: amount + svcCharge, agentCommission: 0, note: note ?? `Rent + service charge ${date.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}` },
    });
  }

  // Helper: Alba Gardens booking
  async function addBooking(unitId: string, date: Date, grossAmount: number, commission: number, platform: Platform, agentName?: string, note?: string, checkIn?: Date, checkOut?: Date) {
    await prisma.incomeEntry.create({
      data: { unitId, type: IncomeType.AIRBNB, date, grossAmount, agentCommission: commission, platform, agentName, note, checkIn, checkOut },
    });
  }

  // ── JUNE 2025 ─────────────────────────────────────────────────────────────
  // Riara One — 3 units paying (C11-07 was old tenant Michael, transitioning)
  await addRent(unitA141C.id, new Date("2025-06-01"), 75000, 5000);
  await addRent(unitC1106.id, new Date("2025-06-01"), 110000, 7000);
  await addRent(unitC1108.id, new Date("2025-06-01"), 75000, 5000);
  await addRent(unitC1008.id, new Date("2025-06-01"), 75000, 5000);
  // C11-07 paid partial / deposit refund month

  // Alba Gardens June
  await addBooking(unitA901.id, new Date("2025-06-05"), 55986, 3200, Platform.AGENT, "Brenda", "June booking via Brenda", new Date("2025-06-05"), new Date("2025-06-15"));
  await addBooking(unitA1205.id, new Date("2025-06-10"), 50000, 3200, Platform.AGENT, "Maggie", "June booking via Maggie", new Date("2025-06-10"), new Date("2025-06-20"));

  // ── JULY 2025 ─────────────────────────────────────────────────────────────
  await addRent(unitA141C.id, new Date("2025-07-01"), 75000, 5000);
  await addRent(unitC1106.id, new Date("2025-07-01"), 110000, 7000);
  await addRent(unitC1107.id, new Date("2025-07-01"), 110000, 7000); // Michael's last full month
  await addRent(unitC1108.id, new Date("2025-07-01"), 75000, 5000);
  await addRent(unitC1008.id, new Date("2025-07-01"), 75000, 5000);

  // Alba Gardens July — strong month
  await addBooking(unitA1506.id, new Date("2025-07-10"), 42155, 6444, Platform.AIRBNB, undefined, "July Airbnb booking", new Date("2025-07-10"), new Date("2025-07-15"));
  await addBooking(unitA901.id, new Date("2025-07-01"), 120000, 0, Platform.DIRECT, undefined, "Kevin — 40 days from 2 Aug (advance)", new Date("2025-07-01"), new Date("2025-07-15"));
  await addBooking(unitA901.id, new Date("2025-07-16"), 127938, 9000, Platform.AIRBNB, undefined, "July Airbnb", new Date("2025-07-16"), new Date("2025-07-31"));
  await addBooking(unitA1205.id, new Date("2025-07-05"), 61000, 700, Platform.AGENT, "Audrey", "July via Audrey", new Date("2025-07-05"), new Date("2025-07-20"));

  // ── AUGUST 2025 ───────────────────────────────────────────────────────────
  await addRent(unitA141C.id, new Date("2025-08-01"), 75000, 5000);
  await addRent(unitC1106.id, new Date("2025-08-01"), 110000, 7000);
  await addRent(unitC1108.id, new Date("2025-08-01"), 75000, 5000);
  await addRent(unitC1008.id, new Date("2025-08-01"), 75000, 5000);
  // C11-07: reinstatement month, Michael departed, Mary not yet arrived

  // Alba Gardens August — quiet month
  await addBooking(unitA901.id, new Date("2025-08-02"), 39996, 0, Platform.DIRECT, undefined, "Kevin balance payment", new Date("2025-08-02"), new Date("2025-08-19"));
  // A1506 and A1205: owner-occupied / vacant August

  // ── SEPTEMBER 2025 ────────────────────────────────────────────────────────
  await addRent(unitA141C.id, new Date("2025-09-01"), 75000, 5000);
  await addRent(unitC1106.id, new Date("2025-09-01"), 110000, 7000);
  await addRent(unitC1107.id, new Date("2025-09-01"), 110000, 7000); // New: Mary Karimi advance
  await addRent(unitC1108.id, new Date("2025-09-01"), 75000, 5000);
  await addRent(unitC1008.id, new Date("2025-09-01"), 75000, 5000);

  await addBooking(unitA1506.id, new Date("2025-09-05"), 147666.67, 14766.67, Platform.AIRBNB, undefined, "September bookings", new Date("2025-09-05"), new Date("2025-09-25"));
  await addBooking(unitA901.id, new Date("2025-09-12"), 60000, 0, Platform.DIRECT, undefined, "Direct booking Sep", new Date("2025-09-12"), new Date("2025-09-19"));
  // A1205: vacant September

  // ── OCTOBER 2025 ──────────────────────────────────────────────────────────
  await addRent(unitA141C.id, new Date("2025-10-01"), 75000, 5000);
  await addRent(unitC1106.id, new Date("2025-10-01"), 110000, 7000);
  await addRent(unitC1107.id, new Date("2025-10-01"), 110000, 7000); // Mary first official month
  await addRent(unitC1108.id, new Date("2025-10-01"), 75000, 5000);
  await addRent(unitC1008.id, new Date("2025-10-01"), 75000, 5000);

  await addBooking(unitA1506.id, new Date("2025-10-03"), 115000, 11500, Platform.AIRBNB, undefined, "Oct early bookings", new Date("2025-10-03"), new Date("2025-10-14"));
  await addBooking(unitA1506.id, new Date("2025-10-18"), 108014.29, 10801.43, Platform.BOOKING_COM, undefined, "Oct Booking.com", new Date("2025-10-18"), new Date("2025-10-28"));
  await addBooking(unitA901.id, new Date("2025-10-01"), 72000, 0, Platform.DIRECT, undefined, "Oct direct", new Date("2025-10-01"), new Date("2025-10-10"));
  await addBooking(unitA901.id, new Date("2025-10-14"), 69000, 0, Platform.AGENT, "Koka", "Oct via Koka", new Date("2025-10-14"), new Date("2025-10-25"));
  // A1205: vacant October

  console.log("✓ Historical income entries seeded");

  // ─── HISTORICAL EXPENSE ENTRIES ──────────────────────────────────────────────
  // Alba Gardens fixed costs per unit per month (Jun–Oct 2025)
  const albaMonths = [
    { date: new Date("2025-06-01"), month: "June 2025" },
    { date: new Date("2025-07-01"), month: "July 2025" },
    { date: new Date("2025-08-01"), month: "August 2025" },
    { date: new Date("2025-09-01"), month: "September 2025" },
    { date: new Date("2025-10-01"), month: "October 2025" },
  ];

  for (const { date, month } of albaMonths) {
    // A1506 (2 bed): svc 13000, wifi 3000, water 500, cleaner 5000
    await prisma.expenseEntry.createMany({
      data: [
        { unitId: unitA1506.id, propertyId: albaGardens.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.SERVICE_CHARGE, amount: 13000, date, description: `Service charge ${month}`, isSunkCost: false },
        { unitId: unitA1506.id, propertyId: albaGardens.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.WIFI, amount: 3000, date, description: `Wi-Fi ${month}`, isSunkCost: false },
        { unitId: unitA1506.id, propertyId: albaGardens.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.WATER, amount: 500, date, description: `Water ${month}`, isSunkCost: false },
        { unitId: unitA1506.id, propertyId: albaGardens.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.CLEANER, amount: 5000, date, description: `Cleaner (Eunice) ${month}`, isSunkCost: false },
        // A901 (1 bed): svc 10500, wifi 3000, water 500, cleaner 5000
        { unitId: unitA901.id, propertyId: albaGardens.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.SERVICE_CHARGE, amount: 10500, date, description: `Service charge ${month}`, isSunkCost: false },
        { unitId: unitA901.id, propertyId: albaGardens.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.WIFI, amount: 3000, date, description: `Wi-Fi ${month}`, isSunkCost: false },
        { unitId: unitA901.id, propertyId: albaGardens.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.WATER, amount: 500, date, description: `Water ${month}`, isSunkCost: false },
        { unitId: unitA901.id, propertyId: albaGardens.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.CLEANER, amount: 5000, date, description: `Cleaner (Eunice) ${month}`, isSunkCost: false },
        // A1205 (1 bed): same as A901
        { unitId: unitA1205.id, propertyId: albaGardens.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.SERVICE_CHARGE, amount: 10500, date, description: `Service charge ${month}`, isSunkCost: false },
        { unitId: unitA1205.id, propertyId: albaGardens.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.WIFI, amount: 3000, date, description: `Wi-Fi ${month}`, isSunkCost: false },
        { unitId: unitA1205.id, propertyId: albaGardens.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.WATER, amount: 500, date, description: `Water ${month}`, isSunkCost: false },
        { unitId: unitA1205.id, propertyId: albaGardens.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.CLEANER, amount: 5000, date, description: `Cleaner (Eunice) ${month}`, isSunkCost: false },
      ],
    });
  }

  // Variable expenses (electricity, consumables) — from Excel
  await prisma.expenseEntry.createMany({
    data: [
      // June
      { unitId: unitA1506.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.ELECTRICITY, amount: 736.67, date: new Date("2025-06-30"), description: "Electricity June", isSunkCost: false },
      { unitId: unitA901.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.ELECTRICITY, amount: 1715.55, date: new Date("2025-06-30"), description: "Electricity June", isSunkCost: false },
      { unitId: unitA1205.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.ELECTRICITY, amount: 1736.67, date: new Date("2025-06-30"), description: "Electricity June", isSunkCost: false },
      { unitId: unitA901.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.CONSUMABLES, amount: 2000, date: new Date("2025-06-15"), description: "Consumables June", isSunkCost: false },
      { unitId: unitA1205.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.CONSUMABLES, amount: 2000, date: new Date("2025-06-15"), description: "Consumables June", isSunkCost: false },
      // July
      { unitId: unitA1506.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.ELECTRICITY, amount: 656.07, date: new Date("2025-07-31"), description: "Electricity July", isSunkCost: false },
      { unitId: unitA901.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.ELECTRICITY, amount: 2930.71, date: new Date("2025-07-31"), description: "Electricity July", isSunkCost: false },
      { unitId: unitA1205.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.ELECTRICITY, amount: 1475.67, date: new Date("2025-07-31"), description: "Electricity July", isSunkCost: false },
      { unitId: unitA1506.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.CONSUMABLES, amount: 3000, date: new Date("2025-07-20"), description: "Consumables July", isSunkCost: false },
      { unitId: unitA901.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.CONSUMABLES, amount: 5000, date: new Date("2025-07-20"), description: "Consumables July", isSunkCost: false },
      // August
      { unitId: unitA901.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.ELECTRICITY, amount: 576.18, date: new Date("2025-08-31"), description: "Electricity August", isSunkCost: false },
      { unitId: unitA1506.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.ELECTRICITY, amount: 481.5, date: new Date("2025-08-31"), description: "Electricity August", isSunkCost: false },
      // September
      { unitId: unitA1506.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.ELECTRICITY, amount: 2343.33, date: new Date("2025-09-30"), description: "Electricity September", isSunkCost: false },
      { unitId: unitA1506.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.CONSUMABLES, amount: 4500, date: new Date("2025-09-20"), description: "Consumables September", isSunkCost: false },
      { unitId: unitA901.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.ELECTRICITY, amount: 1310, date: new Date("2025-09-30"), description: "Electricity September", isSunkCost: false },
      // October
      { unitId: unitA1506.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.ELECTRICITY, amount: 2752.48, date: new Date("2025-10-31"), description: "Electricity October", isSunkCost: false },
      { unitId: unitA901.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.ELECTRICITY, amount: 2625.33, date: new Date("2025-10-31"), description: "Electricity October", isSunkCost: false },
      { unitId: unitA1506.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.CONSUMABLES, amount: 3000, date: new Date("2025-10-15"), description: "Consumables October", isSunkCost: false },
    ],
  });

  // Sunk costs / capital items (from Excel)
  await prisma.expenseEntry.createMany({
    data: [
      { unitId: unitA1506.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.CAPITAL, amount: 1200, date: new Date("2025-07-15"), description: "Carpet cleaning A1506", isSunkCost: true },
      { unitId: unitA901.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.CAPITAL, amount: 2300, date: new Date("2025-07-15"), description: "Carpet cleaning A901", isSunkCost: true },
      { unitId: unitA1506.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.CAPITAL, amount: 5555, date: new Date("2025-08-10"), description: "Hanging line installation", isSunkCost: true },
      { unitId: unitA901.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.CAPITAL, amount: 2985, date: new Date("2025-08-10"), description: "Blender", isSunkCost: true },
    ],
  });

  // Management fees paid (from Excel — Pauline paid these months)
  await prisma.expenseEntry.createMany({
    data: [
      { scope: ExpenseScope.PORTFOLIO, category: ExpenseCategory.MANAGEMENT_FEE, amount: 25717, date: new Date("2025-06-30"), description: "Management fee June 2025 — paid by Pauline", isSunkCost: false },
      { scope: ExpenseScope.PORTFOLIO, category: ExpenseCategory.MANAGEMENT_FEE, amount: 80062, date: new Date("2025-07-31"), description: "Management fee July 2025 — paid by Pauline", isSunkCost: false },
      { scope: ExpenseScope.PORTFOLIO, category: ExpenseCategory.MANAGEMENT_FEE, amount: 39000, date: new Date("2025-08-31"), description: "Management fee August 2025 — paid by Pauline", isSunkCost: false },
      { scope: ExpenseScope.PORTFOLIO, category: ExpenseCategory.MANAGEMENT_FEE, amount: 48900, date: new Date("2025-09-30"), description: "Management fee September 2025 — paid by Pauline", isSunkCost: false },
    ],
  });

  // Reinstatement costs for C11-07 (August 2025)
  await prisma.expenseEntry.create({
    data: { unitId: unitC1107.id, propertyId: riaraOne.id, scope: ExpenseScope.UNIT, category: ExpenseCategory.REINSTATEMENT, amount: 37073, date: new Date("2025-08-20"), description: "Unit C11-07 reinstatement after Michael departure", isSunkCost: false },
  });

  console.log("✓ Historical expense entries seeded");

  // ─── PETTY CASH ──────────────────────────────────────────────────────────────
  await prisma.pettyCash.createMany({
    data: [
      { date: new Date("2025-06-01"), type: PettyCashType.IN, amount: 5000, description: "Petty cash from Pauline — June" },
      { date: new Date("2025-07-01"), type: PettyCashType.IN, amount: 5000, description: "Petty cash from Pauline — July" },
      { date: new Date("2025-08-01"), type: PettyCashType.IN, amount: 4667, description: "Petty cash from Pauline — August" },
      { date: new Date("2025-09-01"), type: PettyCashType.IN, amount: 3000, description: "Petty cash from Pauline — September" },
      // Total IN = 17,667 (matches Excel)
      { date: new Date("2025-06-15"), type: PettyCashType.OUT, amount: 2500, description: "Cleaning supplies A901 & A1205" },
      { date: new Date("2025-06-28"), type: PettyCashType.OUT, amount: 3200, description: "Electricity tokens June" },
      { date: new Date("2025-07-10"), type: PettyCashType.OUT, amount: 4200, description: "Emergency plumbing A1506" },
      { date: new Date("2025-07-22"), type: PettyCashType.OUT, amount: 3500, description: "Consumables top-up July" },
      { date: new Date("2025-08-05"), type: PettyCashType.OUT, amount: 4007, description: "Petty cash spent August" },
      { date: new Date("2025-08-25"), type: PettyCashType.OUT, amount: 4500, description: "Reinstatement misc costs" },
      { date: new Date("2025-09-10"), type: PettyCashType.OUT, amount: 5000, description: "Consumables & maintenance Sep" },
      { date: new Date("2025-09-25"), type: PettyCashType.OUT, amount: 7500, description: "Various petty expenses Sep" },
      // Total OUT = 34,407 (matches Excel) → deficit of -16,740
    ],
  });

  console.log("✓ Petty cash seeded");

  console.log("");
  console.log("✅ Seed complete!");
  console.log("");
  console.log("  Manager login: manager@alba.co.ke / manager123");
  console.log("  Owner login:   owner@alba.co.ke   / owner123");
  console.log("");
  console.log("  ⚠️  Change these passwords after first login!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
