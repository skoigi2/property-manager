import {
  PrismaClient, PropertyType, PropertyCategory, UnitType, UnitStatus,
  IncomeType, ExpenseCategory, ExpenseScope, PettyCashType, UserRole,
  InsuranceType, PremiumFrequency, AssetCategory, MaintenanceFrequency,
  RecurringFrequency, ArrearsStage, InvoiceStatus,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// ── Helpers ──────────────────────────────────────────────────────────────────

function d(dateStr: string) { return new Date(dateStr); }

function monthStart(year: number, month: number) {
  return new Date(year, month, 1);
}

// ── Seed ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱 Seeding Parkview Heights demo property...");

  // ── OWNER USER ─────────────────────────────────────────────────────────────
  const ownerPassword = await bcrypt.hash("demo123", 10);

  const owner = await prisma.user.upsert({
    where: { email: "demo@owner.co.ke" },
    create: {
      name: "James Kariuki",
      email: "demo@owner.co.ke",
      password: ownerPassword,
      role: UserRole.OWNER,
      phone: "+254 712 345 678",
      isActive: true,
    },
    update: { name: "James Kariuki", phone: "+254 712 345 678" },
  });
  console.log("✓ Owner user: demo@owner.co.ke / demo123");

  // ── PROPERTY ───────────────────────────────────────────────────────────────
  let property = await prisma.property.findFirst({ where: { name: "Parkview Heights" } });

  if (property) {
    // Cleanup existing child data scoped to this property
    const existingUnits = await prisma.unit.findMany({
      where: { propertyId: property.id },
      select: { id: true },
    });
    const unitIds = existingUnits.map((u) => u.id);

    const existingTenants = unitIds.length > 0
      ? await prisma.tenant.findMany({ where: { unitId: { in: unitIds } }, select: { id: true } })
      : [];
    const tenantIds = existingTenants.map((t) => t.id);

    await prisma.arrearsCase.deleteMany({ where: { propertyId: property.id } });
    if (unitIds.length > 0) await prisma.managementFeeConfig.deleteMany({ where: { unitId: { in: unitIds } } });
    if (tenantIds.length > 0) await prisma.invoice.deleteMany({ where: { tenantId: { in: tenantIds } } });
    if (unitIds.length > 0) await prisma.incomeEntry.deleteMany({ where: { unitId: { in: unitIds } } });
    if (unitIds.length > 0) await prisma.tenant.deleteMany({ where: { unitId: { in: unitIds } } });
    await prisma.expenseEntry.deleteMany({ where: { propertyId: property.id } });
    if (unitIds.length > 0) await prisma.expenseEntry.deleteMany({ where: { unitId: { in: unitIds } } });
    await prisma.pettyCash.deleteMany({ where: { propertyId: property.id } });
    await prisma.insurancePolicy.deleteMany({ where: { propertyId: property.id } });
    await prisma.asset.deleteMany({ where: { propertyId: property.id } });
    await prisma.recurringExpense.deleteMany({ where: { propertyId: property.id } });
    await prisma.unit.deleteMany({ where: { propertyId: property.id } });

    property = await prisma.property.update({
      where: { id: property.id },
      data: { ownerId: owner.id },
    });
    console.log("✓ Cleaned up existing Parkview Heights data");
  } else {
    property = await prisma.property.create({
      data: {
        name: "Parkview Heights",
        type: PropertyType.LONGTERM,
        category: PropertyCategory.RESIDENTIAL,
        address: "Parklands Road, Nairobi",
        city: "Nairobi",
        description: "Modern 5-storey residential apartment block in Parklands. 20 units with backup generator, lift, and 24/7 security.",
        ownerId: owner.id,
        serviceChargeDefault: 3000,
      },
    });
  }
  console.log("✓ Property: Parkview Heights");

  // ── PROPERTY ACCESS ────────────────────────────────────────────────────────
  // Give existing manager access to Parkview Heights
  const manager = await prisma.user.findUnique({ where: { email: "manager@alba.co.ke" } });
  if (manager) {
    await prisma.propertyAccess.upsert({
      where: { userId_propertyId: { userId: manager.id, propertyId: property.id } },
      create: { userId: manager.id, propertyId: property.id },
      update: {},
    });
    console.log("✓ Manager access granted to Parkview Heights");
  }

  // ── UNITS ──────────────────────────────────────────────────────────────────
  const unitDefs = [
    // Floor 1
    { number: "101", type: UnitType.ONE_BED,   rent: 45000, floor: 1, status: UnitStatus.ACTIVE },
    { number: "102", type: UnitType.ONE_BED,   rent: 45000, floor: 1, status: UnitStatus.ACTIVE },
    { number: "103", type: UnitType.TWO_BED,   rent: 65000, floor: 1, status: UnitStatus.ACTIVE },
    { number: "104", type: UnitType.TWO_BED,   rent: 65000, floor: 1, status: UnitStatus.ACTIVE },
    // Floor 2
    { number: "201", type: UnitType.ONE_BED,   rent: 45000, floor: 2, status: UnitStatus.ACTIVE },
    { number: "202", type: UnitType.ONE_BED,   rent: 45000, floor: 2, status: UnitStatus.ACTIVE },
    { number: "203", type: UnitType.TWO_BED,   rent: 65000, floor: 2, status: UnitStatus.ACTIVE },
    { number: "204", type: UnitType.TWO_BED,   rent: 65000, floor: 2, status: UnitStatus.ACTIVE },
    // Floor 3
    { number: "301", type: UnitType.ONE_BED,   rent: 45000, floor: 3, status: UnitStatus.ACTIVE },
    { number: "302", type: UnitType.ONE_BED,   rent: 45000, floor: 3, status: UnitStatus.VACANT },
    { number: "303", type: UnitType.TWO_BED,   rent: 65000, floor: 3, status: UnitStatus.ACTIVE },
    { number: "304", type: UnitType.TWO_BED,   rent: 65000, floor: 3, status: UnitStatus.ACTIVE },
    // Floor 4
    { number: "401", type: UnitType.ONE_BED,   rent: 45000, floor: 4, status: UnitStatus.ACTIVE },
    { number: "402", type: UnitType.ONE_BED,   rent: 45000, floor: 4, status: UnitStatus.ACTIVE },
    { number: "403", type: UnitType.TWO_BED,   rent: 65000, floor: 4, status: UnitStatus.ACTIVE },
    { number: "404", type: UnitType.THREE_BED, rent: 85000, floor: 4, status: UnitStatus.ACTIVE },
    // Floor 5
    { number: "501", type: UnitType.TWO_BED,   rent: 65000, floor: 5, status: UnitStatus.ACTIVE },
    { number: "502", type: UnitType.TWO_BED,   rent: 65000, floor: 5, status: UnitStatus.ACTIVE },
    { number: "503", type: UnitType.THREE_BED, rent: 85000, floor: 5, status: UnitStatus.ACTIVE },
    { number: "504", type: UnitType.THREE_BED, rent: 85000, floor: 5, status: UnitStatus.UNDER_NOTICE },
  ];

  const units: Record<string, any> = {};
  for (const u of unitDefs) {
    const sc = u.type === UnitType.ONE_BED ? 3000 : u.type === UnitType.TWO_BED ? 4500 : 6000;
    units[u.number] = await prisma.unit.create({
      data: {
        unitNumber: u.number,
        propertyId: property.id,
        type: u.type,
        floor: u.floor,
        monthlyRent: u.rent,
        status: u.status,
        amenities: ["WiFi", "24/7 Security", "Backup Generator", ...(u.floor >= 3 ? ["Balcony"] : [])],
        description: `${u.type.replace("_", "-").toLowerCase().replace("bed", "-bedroom")} apartment on floor ${u.floor}`,
        sizeSqm: u.type === UnitType.ONE_BED ? 52 : u.type === UnitType.TWO_BED ? 78 : 105,
      },
    });
  }
  console.log(`✓ 20 units created`);

  // ── SERVICE CHARGE HELPER ──────────────────────────────────────────────────
  function sc(unitNumber: string): number {
    const u = unitDefs.find((u) => u.number === unitNumber)!;
    return u.type === UnitType.ONE_BED ? 3000 : u.type === UnitType.TWO_BED ? 4500 : 6000;
  }

  // ── TENANTS ────────────────────────────────────────────────────────────────
  const tenantDefs = [
    { unit: "101", name: "Grace Wanjiku Mwangi",     rent: 45000, deposit: 90000,  leaseStart: "2024-03-01", leaseEnd: "2026-02-28", phone: "+254 721 001 101", email: "grace.wanjiku@gmail.com",   nationalId: "28456712" },
    { unit: "102", name: "Peter Kamau Njoroge",       rent: 45000, deposit: 90000,  leaseStart: "2023-09-01", leaseEnd: null,         phone: "+254 722 001 102", email: "peter.kamau@gmail.com",      nationalId: "31245678" },
    { unit: "103", name: "Sarah & David Ochieng",     rent: 65000, deposit: 130000, leaseStart: "2024-01-01", leaseEnd: "2026-12-31", phone: "+254 723 001 103", email: "sochieng@gmail.com",          nationalId: "29345612" },
    { unit: "104", name: "Fatuma Hassan",             rent: 65000, deposit: 130000, leaseStart: "2023-07-01", leaseEnd: null,         phone: "+254 724 001 104", email: "fatuma.hassan@yahoo.com",     nationalId: "34561230" },
    { unit: "201", name: "Kevin Otieno Ouma",         rent: 45000, deposit: 90000,  leaseStart: "2024-06-01", leaseEnd: "2026-05-31", phone: "+254 725 001 201", email: "kevin.otieno@gmail.com",      nationalId: "32156789" },
    { unit: "202", name: "Nancy Chebet Korir",        rent: 45000, deposit: 90000,  leaseStart: "2025-01-01", leaseEnd: "2026-12-31", phone: "+254 726 001 202", email: "nancy.chebet@gmail.com",      nationalId: "35678901" },
    { unit: "203", name: "James & Alice Mutua",       rent: 65000, deposit: 130000, leaseStart: "2023-11-01", leaseEnd: null,         phone: "+254 727 001 203", email: "jamesmutua@gmail.com",         nationalId: "27890123" },
    { unit: "204", name: "Brian Kipchoge",            rent: 65000, deposit: 130000, leaseStart: "2024-04-01", leaseEnd: "2027-03-31", phone: "+254 728 001 204", email: "brian.kipchoge@gmail.com",    nationalId: "33012345" },
    { unit: "301", name: "Miriam Akinyi Odhiambo",   rent: 45000, deposit: 90000,  leaseStart: "2025-03-01", leaseEnd: "2027-02-28", phone: "+254 729 001 301", email: "miriam.akinyi@gmail.com",     nationalId: "36123456" },
    { unit: "303", name: "Anthony Mwaura",            rent: 65000, deposit: 130000, leaseStart: "2024-08-01", leaseEnd: "2026-07-31", phone: "+254 730 001 303", email: "a.mwaura@gmail.com",          nationalId: "30234567" },
    { unit: "304", name: "Esther Njeri Kimani",       rent: 65000, deposit: 130000, leaseStart: "2023-05-01", leaseEnd: null,         phone: "+254 731 001 304", email: "esther.njeri@gmail.com",      nationalId: "28345678" },
    { unit: "401", name: "Daniel Wekesa Barasa",      rent: 45000, deposit: 90000,  leaseStart: "2024-10-01", leaseEnd: "2026-09-30", phone: "+254 732 001 401", email: "d.wekesa@gmail.com",          nationalId: "33456789" },
    { unit: "402", name: "Christine Waithera",        rent: 45000, deposit: 90000,  leaseStart: "2025-02-01", leaseEnd: "2027-01-31", phone: "+254 733 001 402", email: "c.waithera@gmail.com",        nationalId: "36567890" },
    { unit: "403", name: "Moses Kipkirui",            rent: 65000, deposit: 130000, leaseStart: "2024-05-01", leaseEnd: "2026-04-30", phone: "+254 734 001 403", email: "moses.kipkirui@gmail.com",    nationalId: "31678901" },
    { unit: "404", name: "Robert & Jane Maina",       rent: 85000, deposit: 170000, leaseStart: "2023-12-01", leaseEnd: "2026-11-30", phone: "+254 735 001 404", email: "rmaina@gmail.com",            nationalId: "29789012" },
    { unit: "501", name: "Jackline Adhiambo",         rent: 65000, deposit: 130000, leaseStart: "2024-09-01", leaseEnd: "2026-08-31", phone: "+254 736 001 501", email: "jackline.adhiambo@gmail.com", nationalId: "34890123" },
    { unit: "503", name: "Paul & Winnie Ndungu",      rent: 85000, deposit: 170000, leaseStart: "2024-02-01", leaseEnd: "2027-01-31", phone: "+254 737 001 503", email: "pndungu@gmail.com",           nationalId: "32901234" },
    { unit: "504", name: "Victor Simiyu",             rent: 85000, deposit: 170000, leaseStart: "2024-07-01", leaseEnd: "2026-06-30", phone: "+254 738 001 504", email: "victor.simiyu@gmail.com",     nationalId: "35012345" },
  ];

  const tenants: Record<string, any> = {};
  for (const t of tenantDefs) {
    tenants[t.unit] = await prisma.tenant.create({
      data: {
        name: t.name,
        unitId: units[t.unit].id,
        depositAmount: t.deposit,
        depositPaidDate: d(t.leaseStart),
        leaseStart: d(t.leaseStart),
        leaseEnd: t.leaseEnd ? d(t.leaseEnd) : null,
        monthlyRent: t.rent,
        serviceCharge: sc(t.unit),
        rentDueDay: 1,
        isActive: true,
        phone: t.phone,
        email: t.email,
        nationalId: t.nationalId,
        renewalStage: t.unit === "504" ? "NOTICE_SENT" : "NONE",
        notes: t.unit === "504" ? "Tenant has given notice. Vacating end of June 2026." : null,
      },
    });
  }
  console.log(`✓ 18 tenants created`);

  // ── MANAGEMENT FEE CONFIGS ─────────────────────────────────────────────────
  const feeConfigs = unitDefs.map((u) => ({
    unitId: units[u.number].id,
    flatAmount: u.type === UnitType.ONE_BED ? 3000 : u.type === UnitType.TWO_BED ? 4500 : 6000,
    ratePercent: 0,
    effectiveFrom: d("2024-01-01"),
  }));
  await prisma.managementFeeConfig.createMany({ data: feeConfigs });
  console.log("✓ Management fee configs created");

  // ── INCOME & INVOICES ──────────────────────────────────────────────────────
  const MONTHS = [0, 1, 2, 3, 4, 5]; // Jan–Jun 2026
  const YEAR = 2026;

  // Units that have arrears in specific months (0-indexed)
  const arrears: Record<string, number[]> = {
    "102": [1, 2], // Peter: no payment Feb (1) or Mar (2)
    "304": [2],    // Esther: no payment Mar (2)
  };

  let invoiceSeq = 1;

  for (const month of MONTHS) {
    for (const t of tenantDefs) {
      const unit = units[t.unit];
      const tenant = tenants[t.unit];
      const grossAmount = t.rent + sc(t.unit);
      const skipMonths = arrears[t.unit] ?? [];
      const isArrears = skipMonths.includes(month);

      const invoiceNum = `PKH-${YEAR}-${String(month + 1).padStart(2, "0")}-${String(invoiceSeq++).padStart(3, "0")}`;
      const dueDate = new Date(YEAR, month, 5);
      const payDate = new Date(YEAR, month, 1);

      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber: invoiceNum,
          tenantId: tenant.id,
          periodYear: YEAR,
          periodMonth: month + 1,
          rentAmount: t.rent,
          serviceCharge: sc(t.unit),
          totalAmount: grossAmount,
          dueDate,
          status: isArrears ? InvoiceStatus.OVERDUE : InvoiceStatus.PAID,
          paidAt: isArrears ? null : payDate,
          paidAmount: isArrears ? null : grossAmount,
        },
      });

      if (!isArrears) {
        await prisma.incomeEntry.create({
          data: {
            date: monthStart(YEAR, month),
            unitId: unit.id,
            tenantId: tenant.id,
            invoiceId: invoice.id,
            type: IncomeType.LONGTERM_RENT,
            grossAmount,
            agentCommission: 0,
          },
        });
      }
    }
  }
  console.log(`✓ Income entries & invoices created (${invoiceSeq - 1} invoices)`);

  // ── EXPENSES ───────────────────────────────────────────────────────────────
  // Monthly property-level expenses
  const monthlyPropExpenses = [
    { category: ExpenseCategory.MANAGEMENT_FEE, amount: 95000, desc: "Monthly management fee" },
    { category: ExpenseCategory.WATER,          amount: 38000, desc: "Water bill — Nairobi Water & Sewerage" },
    { category: ExpenseCategory.ELECTRICITY,    amount: 52000, desc: "KPLC — common areas & lifts" },
    { category: ExpenseCategory.WIFI,           amount: 18000, desc: "Safaricom Fibre — building internet" },
    { category: ExpenseCategory.CLEANER,        amount: 45000, desc: "3× cleaning staff — monthly wages" },
  ];

  for (const month of MONTHS) {
    for (const e of monthlyPropExpenses) {
      await prisma.expenseEntry.create({
        data: {
          date: monthStart(YEAR, month),
          propertyId: property.id,
          scope: ExpenseScope.PROPERTY,
          category: e.category,
          amount: e.amount,
          description: e.desc,
          isSunkCost: false,
          paidFromPettyCash: false,
        },
      });
    }
    // Quarterly consumables (Jan, Apr)
    if (month === 0 || month === 3) {
      await prisma.expenseEntry.create({
        data: {
          date: monthStart(YEAR, month),
          propertyId: property.id,
          scope: ExpenseScope.PROPERTY,
          category: ExpenseCategory.CONSUMABLES,
          amount: 22000,
          description: "Cleaning supplies, lightbulbs & sundries",
          isSunkCost: false,
        },
      });
    }
  }

  // Ad-hoc unit-level expenses
  const adHocExpenses = [
    { month: 0, unit: "103", cat: ExpenseCategory.MAINTENANCE,   amount: 15000, desc: "Plumbing repair — bathroom", sunk: false },
    { month: 1, unit: "201", cat: ExpenseCategory.MAINTENANCE,   amount: 8500,  desc: "Electrical fault — kitchen wiring", sunk: false },
    { month: 1, unit: "404", cat: ExpenseCategory.MAINTENANCE,   amount: 32000, desc: "AC unit replacement — master bedroom", sunk: true },
    { month: 2, unit: "302", cat: ExpenseCategory.REINSTATEMENT, amount: 85000, desc: "Vacant unit repaint, deep clean & touch-ups", sunk: true },
    { month: 3, unit: "101", cat: ExpenseCategory.MAINTENANCE,   amount: 12000, desc: "Window frame repair & resealing", sunk: false },
    { month: 4, unit: "203", cat: ExpenseCategory.MAINTENANCE,   amount: 9000,  desc: "Cracked tiles — bathroom floor replacement", sunk: false },
    { month: 5, unit: "501", cat: ExpenseCategory.MAINTENANCE,   amount: 18000, desc: "Kitchen fittings — cabinet replacements", sunk: false },
    { month: 5, unit: "PROP", cat: ExpenseCategory.CAPITAL,       amount: 280000, desc: "Perimeter wall repairs & gate reinforcement", sunk: true },
  ];

  for (const e of adHocExpenses) {
    await prisma.expenseEntry.create({
      data: {
        date: monthStart(YEAR, e.month),
        ...(e.unit === "PROP"
          ? { propertyId: property.id, scope: ExpenseScope.PROPERTY }
          : { unitId: units[e.unit].id, scope: ExpenseScope.UNIT }),
        category: e.cat,
        amount: e.amount,
        description: e.desc,
        isSunkCost: e.sunk,
        paidFromPettyCash: false,
      },
    });
  }
  console.log("✓ Expenses created");

  // ── PETTY CASH ─────────────────────────────────────────────────────────────
  const pettyCashOut: Array<{ month: number; amount: number; desc: string }> = [
    { month: 0, amount: 6500,  desc: "Lightbulbs & electrical fittings — common areas" },
    { month: 0, amount: 4200,  desc: "Emergency plumber call-out — unit 103 overflow" },
    { month: 0, amount: 1800,  desc: "Stationery & notice printing" },
    { month: 1, amount: 5800,  desc: "Cleaning materials & detergents restock" },
    { month: 1, amount: 12000, desc: "Emergency electrician — lift panel fault" },
    { month: 1, amount: 2100,  desc: "Padlocks & keys — main gate" },
    { month: 2, amount: 7200,  desc: "Garden tools & fertiliser" },
    { month: 2, amount: 3500,  desc: "Postage & courier — lease renewal notices" },
    { month: 2, amount: 9800,  desc: "Minor plumbing repairs — multiple units" },
    { month: 3, amount: 6100,  desc: "Lightbulbs & LED replacements — stairwells" },
    { month: 3, amount: 14500, desc: "Emergency pump repair — water pressure loss" },
    { month: 4, amount: 4800,  desc: "Cleaning materials top-up" },
    { month: 4, amount: 2400,  desc: "Stationery, printing & courier" },
    { month: 5, amount: 8300,  desc: "Paint & materials — common area touch-up" },
    { month: 5, amount: 5500,  desc: "Miscellaneous repairs & sundries" },
    { month: 5, amount: 1900,  desc: "Postage & administration" },
  ];

  for (const month of MONTHS) {
    await prisma.pettyCash.create({
      data: {
        date: monthStart(YEAR, month),
        type: PettyCashType.IN,
        amount: 50000,
        description: "Monthly petty cash top-up — James Kariuki",
        propertyId: property.id,
      },
    });
  }

  for (const p of pettyCashOut) {
    await prisma.pettyCash.create({
      data: {
        date: new Date(YEAR, p.month, Math.floor(Math.random() * 20) + 5),
        type: PettyCashType.OUT,
        amount: p.amount,
        description: p.desc,
        propertyId: property.id,
      },
    });
  }
  console.log("✓ Petty cash entries created");

  // ── INSURANCE ──────────────────────────────────────────────────────────────
  await prisma.insurancePolicy.createMany({
    data: [
      {
        propertyId: property.id,
        type: InsuranceType.BUILDING,
        insurer: "Jubilee Insurance",
        policyNumber: "JI-BLD-2025-0847",
        startDate: d("2025-01-01"),
        endDate: d("2025-12-31"),
        premiumAmount: 180000,
        premiumFrequency: PremiumFrequency.ANNUALLY,
        coverageAmount: 150000000,
        brokerName: "Glenwood Insurance Brokers",
        brokerContact: "+254 700 111 222",
        notes: "Full building structure coverage. Renewal due January 2026.",
      },
      {
        propertyId: property.id,
        type: InsuranceType.PUBLIC_LIABILITY,
        insurer: "CIC Insurance Group",
        policyNumber: "CIC-PL-2025-3312",
        startDate: d("2025-06-01"),
        endDate: d("2026-05-31"),
        premiumAmount: 45000,
        premiumFrequency: PremiumFrequency.BIANNUALLY,
        coverageAmount: 20000000,
        brokerName: "Glenwood Insurance Brokers",
        brokerContact: "+254 700 111 222",
        notes: "Covers third-party injury and property damage claims.",
      },
    ],
  });
  console.log("✓ 2 insurance policies created");

  // ── ASSETS ─────────────────────────────────────────────────────────────────
  const assetDefs = [
    {
      name: "Parkview Standby Generator",
      category: AssetCategory.GENERATOR,
      serialNumber: "CAT-3516C-00142",
      purchaseDate: d("2020-03-15"),
      purchaseCost: 2800000,
      warrantyExpiry: d("2025-03-15"),
      serviceProvider: "CAT Kenya Ltd",
      serviceContact: "0722 100 200",
      notes: "500 kVA Caterpillar generator. Powers all common areas and lifts during outages.",
      schedule: { taskName: "Monthly Service Check", frequency: MaintenanceFrequency.MONTHLY, nextDue: d("2026-04-15") },
    },
    {
      name: "Otis Passenger Lift",
      category: AssetCategory.LIFT,
      serialNumber: "OTIS-MRL-2019-KE-007",
      purchaseDate: d("2019-06-01"),
      purchaseCost: 4500000,
      warrantyExpiry: null,
      serviceProvider: "Otis East Africa",
      serviceContact: "0711 200 300",
      notes: "8-person capacity machine-room-less lift. Annual statutory inspection by KEBS required.",
      schedule: { taskName: "Quarterly Lift Servicing", frequency: MaintenanceFrequency.QUARTERLY, nextDue: d("2026-04-01") },
    },
    {
      name: "Pedrollo Submersible Water Pump",
      category: AssetCategory.PLUMBING,
      serialNumber: "PED-4SR-2022-0091",
      purchaseDate: d("2022-08-10"),
      purchaseCost: 320000,
      warrantyExpiry: d("2024-08-10"),
      serviceProvider: "Aqua Systems Kenya",
      serviceContact: "0733 300 400",
      notes: "Supplies water to rooftop storage tanks. Secondary pump available on standby.",
      schedule: { taskName: "Biannual Pump Inspection", frequency: MaintenanceFrequency.BIANNUALLY, nextDue: d("2026-06-10") },
    },
    {
      name: "Hikvision 16-Channel CCTV System",
      category: AssetCategory.SECURITY,
      serialNumber: "HIK-DS-9616NI-2021",
      purchaseDate: d("2021-04-20"),
      purchaseCost: 580000,
      warrantyExpiry: d("2024-04-20"),
      serviceProvider: "Techno Brain Kenya",
      serviceContact: "0720 400 500",
      notes: "16 cameras covering all common areas, car park, and building perimeter. 30-day storage.",
      schedule: { taskName: "Annual CCTV Review & Maintenance", frequency: MaintenanceFrequency.ANNUALLY, nextDue: d("2026-04-20") },
    },
  ];

  for (const a of assetDefs) {
    const asset = await prisma.asset.create({
      data: {
        propertyId: property.id,
        name: a.name,
        category: a.category,
        serialNumber: a.serialNumber,
        purchaseDate: a.purchaseDate,
        purchaseCost: a.purchaseCost,
        warrantyExpiry: a.warrantyExpiry,
        serviceProvider: a.serviceProvider,
        serviceContact: a.serviceContact,
        notes: a.notes,
      },
    });
    await prisma.assetMaintenanceSchedule.create({
      data: {
        assetId: asset.id,
        taskName: a.schedule.taskName,
        frequency: a.schedule.frequency,
        nextDue: a.schedule.nextDue,
        isActive: true,
      },
    });
  }
  console.log("✓ 4 assets with maintenance schedules created");

  // ── RECURRING EXPENSES ─────────────────────────────────────────────────────
  await prisma.recurringExpense.createMany({
    data: [
      {
        description: "Monthly Security Patrol — G4S",
        category: ExpenseCategory.CLEANER,
        amount: 28000,
        scope: ExpenseScope.PROPERTY,
        propertyId: property.id,
        frequency: RecurringFrequency.MONTHLY,
        nextDueDate: d("2026-04-01"),
        isActive: true,
      },
      {
        description: "Landscaping & Garden Maintenance",
        category: ExpenseCategory.CLEANER,
        amount: 12000,
        scope: ExpenseScope.PROPERTY,
        propertyId: property.id,
        frequency: RecurringFrequency.MONTHLY,
        nextDueDate: d("2026-04-01"),
        isActive: true,
      },
      {
        description: "Quarterly Generator Service — CAT Kenya",
        category: ExpenseCategory.MAINTENANCE,
        amount: 35000,
        scope: ExpenseScope.PROPERTY,
        propertyId: property.id,
        frequency: RecurringFrequency.QUARTERLY,
        nextDueDate: d("2026-06-01"),
        isActive: true,
      },
      {
        description: "Annual Lift Servicing Contract — Otis",
        category: ExpenseCategory.MAINTENANCE,
        amount: 120000,
        scope: ExpenseScope.PROPERTY,
        propertyId: property.id,
        frequency: RecurringFrequency.ANNUAL,
        nextDueDate: d("2026-06-01"),
        isActive: true,
      },
    ],
  });
  console.log("✓ 4 recurring expenses created");

  // ── ARREARS CASES ──────────────────────────────────────────────────────────
  await prisma.arrearsCase.create({
    data: {
      tenantId: tenants["102"].id,
      propertyId: property.id,
      stage: ArrearsStage.INFORMAL_REMINDER,
      amountOwed: 96000,
      notes: "Tenant has not paid rent for February and March 2026 (KSh 48,000 × 2 months). Called on 15 March — promised to clear by end of month. Follow up required.",
    },
  });

  await prisma.arrearsCase.create({
    data: {
      tenantId: tenants["304"].id,
      propertyId: property.id,
      stage: ArrearsStage.INFORMAL_REMINDER,
      amountOwed: 69500,
      notes: "March 2026 rent outstanding (KSh 65,000 + 4,500 service charge). SMS reminder sent on 10 March. No response yet.",
    },
  });
  console.log("✓ 2 arrears cases created");

  // ── DONE ───────────────────────────────────────────────────────────────────
  console.log("\n✅ Parkview Heights seeded successfully!");
  console.log("   Owner login:   demo@owner.co.ke  /  demo123");
  console.log("   Manager login: manager@alba.co.ke / manager123  (if existing data is present)");
  console.log("   20 units · 18 tenants · 6 months history (Jan–Jun 2026)");
  console.log("   Includes: income, invoices, expenses, petty cash, insurance, assets, recurring expenses, arrears");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
