import {
  PrismaClient, PropertyType, PropertyCategory, UnitType, UnitStatus,
  IncomeType, ExpenseCategory, ExpenseScope, PettyCashType, UserRole,
  InsuranceType, PremiumFrequency, AssetCategory, MaintenanceFrequency,
  RecurringFrequency, ArrearsStage, InvoiceStatus,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function d(dateStr: string) { return new Date(dateStr); }
function monthStart(year: number, month: number) { return new Date(year, month, 1); }

async function main() {
  console.log("🌱 Seeding Al Seef Residences — Bahrain demo property...");

  // ── ORGANISATION ────────────────────────────────────────────────────────────
  const existingOrg = await prisma.organization.findFirst({ where: { name: "Al Seef Property Management" } });
  const org = existingOrg ?? await prisma.organization.create({
    data: {
      name: "Al Seef Property Management",
      email: "admin@alseef.bh",
      defaultCurrency: "BHD",
    },
  });
  console.log("✓ Organisation: Al Seef Property Management");

  // ── OWNER USER ─────────────────────────────────────────────────────────────
  const ownerPassword = await bcrypt.hash("demo123", 10);

  const owner = await prisma.user.upsert({
    where: { email: "owner@alseef.bh" },
    create: {
      name: "Khalid Al-Dosari",
      email: "owner@alseef.bh",
      password: ownerPassword,
      role: UserRole.OWNER,
      phone: "+973 3600 1001",
      isActive: true,
      organizationId: org.id,
    },
    update: {
      name: "Khalid Al-Dosari",
      phone: "+973 3600 1001",
      password: ownerPassword,
      role: UserRole.OWNER,
      isActive: true,
      organizationId: org.id,
    },
  });

  await prisma.userOrganizationMembership.upsert({
    where: { userId_organizationId: { userId: owner.id, organizationId: org.id } },
    create: { userId: owner.id, organizationId: org.id },
    update: {},
  });
  console.log("✓ Owner user: owner@alseef.bh / demo123");

  // ── MANAGER (admin) USER ───────────────────────────────────────────────────
  const managerPassword = await bcrypt.hash("demo123", 10);

  const manager = await prisma.user.upsert({
    where: { email: "manager@alseef.bh" },
    create: {
      name: "Sara Al-Habsi",
      email: "manager@alseef.bh",
      password: managerPassword,
      role: UserRole.MANAGER,
      phone: "+973 3600 2002",
      isActive: true,
      organizationId: org.id,
    },
    update: {
      name: "Sara Al-Habsi",
      phone: "+973 3600 2002",
      password: managerPassword,
      role: UserRole.MANAGER,
      isActive: true,
      organizationId: org.id,
    },
  });

  await prisma.userOrganizationMembership.upsert({
    where: { userId_organizationId: { userId: manager.id, organizationId: org.id } },
    create: { userId: manager.id, organizationId: org.id },
    update: {},
  });
  console.log("✓ Manager user: manager@alseef.bh / demo123");

  // ── PROPERTY ───────────────────────────────────────────────────────────────
  let property = await prisma.property.findFirst({ where: { name: "Al Seef Residences" } });

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
      data: { ownerId: owner.id, organizationId: org.id },
    });
    console.log("✓ Cleaned up existing Al Seef Residences data");
  } else {
    property = await prisma.property.create({
      data: {
        name: "Al Seef Residences",
        type: PropertyType.LONGTERM,
        category: PropertyCategory.RESIDENTIAL,
        address: "Seef District, Manama",
        city: "Manama",
        description: "Modern 4-storey residential tower in the heart of Seef District. 20 fully-furnished apartments with central A/C, covered parking, rooftop terrace, and 24/7 security.",
        ownerId: owner.id,
        serviceChargeDefault: 75,
        organizationId: org.id,
        currency: "BHD",
      },
    });
  }

  // Give manager access to this property
  await prisma.propertyAccess.upsert({
    where: { userId_propertyId: { userId: manager.id, propertyId: property.id } },
    create: { userId: manager.id, propertyId: property.id },
    update: {},
  });

  console.log("✓ Property: Al Seef Residences");

  // ── UNITS ──────────────────────────────────────────────────────────────────
  const unitDefs = [
    // Floor 1
    { number: "101", type: UnitType.ONE_BED,   rent: 350, floor: 1, sqm: 58  },
    { number: "102", type: UnitType.ONE_BED,   rent: 350, floor: 1, sqm: 58  },
    { number: "103", type: UnitType.TWO_BED,   rent: 500, floor: 1, sqm: 90  },
    { number: "104", type: UnitType.TWO_BED,   rent: 500, floor: 1, sqm: 90  },
    { number: "105", type: UnitType.TWO_BED,   rent: 500, floor: 1, sqm: 90  },
    // Floor 2
    { number: "201", type: UnitType.ONE_BED,   rent: 370, floor: 2, sqm: 58  },
    { number: "202", type: UnitType.ONE_BED,   rent: 370, floor: 2, sqm: 58  },
    { number: "203", type: UnitType.TWO_BED,   rent: 520, floor: 2, sqm: 95  },
    { number: "204", type: UnitType.TWO_BED,   rent: 520, floor: 2, sqm: 95  },
    { number: "205", type: UnitType.THREE_BED, rent: 720, floor: 2, sqm: 130 },
    // Floor 3
    { number: "301", type: UnitType.ONE_BED,   rent: 370, floor: 3, sqm: 58  },
    { number: "302", type: UnitType.TWO_BED,   rent: 520, floor: 3, sqm: 95  },
    { number: "303", type: UnitType.TWO_BED,   rent: 520, floor: 3, sqm: 95  },
    { number: "304", type: UnitType.TWO_BED,   rent: 520, floor: 3, sqm: 95  },
    { number: "305", type: UnitType.THREE_BED, rent: 720, floor: 3, sqm: 130 },
    // Floor 4
    { number: "401", type: UnitType.ONE_BED,   rent: 390, floor: 4, sqm: 60  },
    { number: "402", type: UnitType.TWO_BED,   rent: 540, floor: 4, sqm: 98  },
    { number: "403", type: UnitType.TWO_BED,   rent: 540, floor: 4, sqm: 98  },
    { number: "404", type: UnitType.THREE_BED, rent: 750, floor: 4, sqm: 135 },
    { number: "405", type: UnitType.THREE_BED, rent: 750, floor: 4, sqm: 135 },
  ];

  const units: Record<string, { id: string }> = {};
  for (const u of unitDefs) {
    units[u.number] = await prisma.unit.create({
      data: {
        unitNumber: u.number,
        propertyId: property.id,
        type: u.type,
        floor: u.floor,
        monthlyRent: u.rent,
        status: UnitStatus.ACTIVE,
        amenities: ["Central A/C", "Covered Parking", "24/7 Security", ...(u.floor >= 3 ? ["City View", "Balcony"] : [])],
        description: `${u.type === UnitType.ONE_BED ? "1-bedroom" : u.type === UnitType.TWO_BED ? "2-bedroom" : "3-bedroom"} apartment on floor ${u.floor}`,
        sizeSqm: u.sqm,
      },
    });
  }
  console.log("✓ 20 units created");

  // ── SERVICE CHARGE HELPER ──────────────────────────────────────────────────
  function sc(unitNumber: string): number {
    const u = unitDefs.find((u) => u.number === unitNumber)!;
    return u.type === UnitType.ONE_BED ? 50 : u.type === UnitType.TWO_BED ? 75 : 100;
  }

  // ── TENANTS ────────────────────────────────────────────────────────────────
  const tenantDefs = [
    { unit: "101", name: "Ahmed Al-Dosari",         rent: 350, leaseEnd: "2027-12-31", phone: "+973 3900 1101", email: "ahmed.aldosari@gmail.com",    nationalId: "BH-19820341" },
    { unit: "102", name: "Priya Sharma",             rent: 350, leaseEnd: "2026-12-31", phone: "+973 3900 1102", email: "priya.sharma@gmail.com",       nationalId: "IN-EXP-2340" },
    { unit: "103", name: "Mohammed Al-Mannai",       rent: 500, leaseEnd: "2027-12-31", phone: "+973 3900 1103", email: "m.almannaibh@gmail.com",       nationalId: "BH-19751234" },
    { unit: "104", name: "James & Claire Harrison",  rent: 500, leaseEnd: "2026-12-31", phone: "+973 3900 1104", email: "j.harrison.bh@gmail.com",      nationalId: "GB-EXP-0891" },
    { unit: "105", name: "Rajesh Kumar",             rent: 500, leaseEnd: "2026-12-31", phone: "+973 3900 1105", email: "rajesh.kumar.bh@gmail.com",    nationalId: "IN-EXP-5512" },
    { unit: "201", name: "Fatima Al-Khalifa",        rent: 370, leaseEnd: "2027-12-31", phone: "+973 3900 2201", email: "fatima.alkhalifa@gmail.com",   nationalId: "BH-19900876" },
    { unit: "202", name: "Tariq Hussain",            rent: 370, leaseEnd: "2026-12-31", phone: "+973 3900 2202", email: "tariq.hussain.bh@gmail.com",   nationalId: "PK-EXP-3312" },
    { unit: "203", name: "Nasser Al-Qasimi",         rent: 520, leaseEnd: "2027-12-31", phone: "+973 3900 2203", email: "n.alqasimi@gmail.com",         nationalId: "AE-EXP-0044" },
    { unit: "204", name: "Sunita & Vikram Nair",     rent: 520, leaseEnd: "2026-12-31", phone: "+973 3900 2204", email: "vikram.nair.bh@gmail.com",     nationalId: "IN-EXP-7789" },
    { unit: "205", name: "Ali Al-Zayani",            rent: 720, leaseEnd: "2027-12-31", phone: "+973 3900 2205", email: "ali.alzayani@gmail.com",       nationalId: "BH-19780654" },
    { unit: "301", name: "Sarah Mitchell",           rent: 370, leaseEnd: "2026-12-31", phone: "+973 3900 3301", email: "sarah.mitchell.bh@gmail.com",  nationalId: "GB-EXP-1122" },
    { unit: "302", name: "Hassan Al-Buainain",       rent: 520, leaseEnd: "2027-12-31", phone: "+973 3900 3302", email: "h.albuainain@gmail.com",       nationalId: "BH-19851023" },
    { unit: "303", name: "Anwar Al-Rashid",          rent: 520, leaseEnd: "2027-12-31", phone: "+973 3900 3303", email: "anwar.alrashid@gmail.com",     nationalId: "BH-19800412" },
    { unit: "304", name: "Deepak & Meera Pillai",    rent: 520, leaseEnd: "2026-12-31", phone: "+973 3900 3304", email: "deepak.pillai.bh@gmail.com",   nationalId: "IN-EXP-2209" },
    { unit: "305", name: "Khalid Al-Rumaihi",        rent: 720, leaseEnd: "2027-12-31", phone: "+973 3900 3305", email: "k.alrumaihi@gmail.com",        nationalId: "BH-19720889" },
    { unit: "401", name: "Omar Al-Tajer",            rent: 390, leaseEnd: "2027-12-31", phone: "+973 3900 4401", email: "omar.altajer@gmail.com",       nationalId: "BH-19930567" },
    { unit: "402", name: "Aisha Yusuf",              rent: 540, leaseEnd: "2026-12-31", phone: "+973 3900 4402", email: "aisha.yusuf.bh@gmail.com",     nationalId: "BH-19870234" },
    { unit: "403", name: "Michael & Diane Foster",   rent: 540, leaseEnd: "2026-12-31", phone: "+973 3900 4403", email: "m.foster.bahrain@gmail.com",   nationalId: "US-EXP-3301" },
    { unit: "404", name: "Abdullah Al-Maktoum",      rent: 750, leaseEnd: "2027-12-31", phone: "+973 3900 4404", email: "a.almaktoum.bh@gmail.com",     nationalId: "AE-EXP-0078" },
    { unit: "405", name: "Faisal Al-Noaimi",         rent: 750, leaseEnd: "2027-12-31", phone: "+973 3900 4405", email: "faisal.alnoaimi@gmail.com",    nationalId: "BH-19680123" },
  ];

  const tenants: Record<string, { id: string }> = {};
  for (const t of tenantDefs) {
    tenants[t.unit] = await prisma.tenant.create({
      data: {
        name: t.name,
        unitId: units[t.unit].id,
        depositAmount: t.rent * 2,
        depositPaidDate: d("2026-01-01"),
        leaseStart: d("2026-01-01"),
        leaseEnd: d(t.leaseEnd),
        monthlyRent: t.rent,
        serviceCharge: sc(t.unit),
        rentDueDay: 1,
        isActive: true,
        phone: t.phone,
        email: t.email,
        nationalId: t.nationalId,
        renewalStage: t.unit === "304" ? "NOTICE_SENT" : "NONE",
        notes: t.unit === "304" ? "Tenant has given notice. Plans to relocate at lease end Dec 2026." : null,
      },
    });
  }
  console.log("✓ 20 tenants created");

  // ── MANAGEMENT FEE CONFIGS ─────────────────────────────────────────────────
  const feeConfigs = unitDefs.map((u) => ({
    unitId: units[u.number].id,
    flatAmount: u.type === UnitType.ONE_BED ? 50 : u.type === UnitType.TWO_BED ? 75 : 100,
    ratePercent: 0,
    effectiveFrom: d("2026-01-01"),
  }));
  await prisma.managementFeeConfig.createMany({ data: feeConfigs });
  console.log("✓ Management fee configs created");

  // ── INCOME & INVOICES ──────────────────────────────────────────────────────
  // Jan=0, Feb=1, Mar=2
  const MONTHS = [0, 1, 2];
  const YEAR = 2026;

  // Arrears: unit 102 misses Feb+Mar; unit 304 misses Mar
  const arrears: Record<string, number[]> = {
    "102": [1, 2],
    "304": [2],
  };

  let invoiceSeq = 1;

  for (const month of MONTHS) {
    for (const t of tenantDefs) {
      const unit = units[t.unit];
      const tenant = tenants[t.unit];
      const serviceCharge = sc(t.unit);
      const grossAmount = t.rent + serviceCharge;
      const skipMonths = arrears[t.unit] ?? [];
      const isArrears = skipMonths.includes(month);

      const invoiceNum = `ASR-${YEAR}-${String(month + 1).padStart(2, "0")}-${String(invoiceSeq++).padStart(3, "0")}`;
      const dueDate = new Date(YEAR, month, 5);
      const payDate = new Date(YEAR, month, 1);

      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber: invoiceNum,
          tenantId: tenant.id,
          periodYear: YEAR,
          periodMonth: month + 1,
          rentAmount: t.rent,
          serviceCharge,
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
  const monthlyPropExpenses = [
    { category: ExpenseCategory.MANAGEMENT_FEE, amount: 650, desc: "Monthly management fee — Al Seef Property Management" },
    { category: ExpenseCategory.WATER,          amount: 180, desc: "BEWA — building water supply" },
    { category: ExpenseCategory.ELECTRICITY,    amount: 220, desc: "MEW — common areas, lifts & car park lighting" },
    { category: ExpenseCategory.WIFI,           amount: 90,  desc: "Batelco Fibre — building internet infrastructure" },
    { category: ExpenseCategory.CLEANER,        amount: 380, desc: "Cleaning staff — 2 full-time (common areas & grounds)" },
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
  }

  // Ad-hoc unit-level repairs
  const adHocExpenses = [
    { month: 0, unit: "103", cat: ExpenseCategory.MAINTENANCE,   amount: 120, desc: "Plumbing repair — bathroom tap replacement",  sunk: false },
    { month: 1, unit: "201", cat: ExpenseCategory.MAINTENANCE,   amount: 85,  desc: "Electrical fault — kitchen circuit breaker",   sunk: false },
    { month: 1, unit: "404", cat: ExpenseCategory.MAINTENANCE,   amount: 310, desc: "A/C compressor replacement — master bedroom",  sunk: true  },
    { month: 2, unit: "302", cat: ExpenseCategory.REINSTATEMENT, amount: 420, desc: "Deep clean & repainting — post-notice unit",   sunk: true  },
  ];

  for (const e of adHocExpenses) {
    await prisma.expenseEntry.create({
      data: {
        date: monthStart(YEAR, e.month),
        unitId: units[e.unit].id,
        scope: ExpenseScope.UNIT,
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
  const pettyCashOut = [
    { month: 0, day: 8,  amount: 45,  desc: "Lightbulbs & electrical fittings — lobby & corridors" },
    { month: 0, day: 14, amount: 80,  desc: "Emergency plumber call-out — unit 103 overflow" },
    { month: 0, day: 22, amount: 15,  desc: "Stationery & notice printing" },
    { month: 1, day: 6,  amount: 55,  desc: "Cleaning materials & detergents restock" },
    { month: 1, day: 13, amount: 90,  desc: "Emergency electrician — lift control panel" },
    { month: 1, day: 20, amount: 20,  desc: "Replacement padlocks & keys — car park gate" },
    { month: 2, day: 9,  amount: 40,  desc: "Garden tools & soil conditioner — rooftop terrace" },
    { month: 2, day: 17, amount: 65,  desc: "Minor plumbing repairs — common area bathrooms" },
    { month: 2, day: 25, amount: 12,  desc: "Postage & courier — lease correspondence" },
  ];

  for (const month of MONTHS) {
    await prisma.pettyCash.create({
      data: {
        date: monthStart(YEAR, month),
        type: PettyCashType.IN,
        amount: 500,
        description: "Monthly petty cash top-up — Khalid Al-Dosari",
        propertyId: property.id,
      },
    });
  }

  for (const p of pettyCashOut) {
    await prisma.pettyCash.create({
      data: {
        date: new Date(YEAR, p.month, p.day),
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
        insurer: "Gulf Union Insurance",
        policyNumber: "GUI-BLD-2025-1142",
        startDate: d("2025-01-01"),
        endDate: d("2025-12-31"),
        premiumAmount: 2400,
        premiumFrequency: PremiumFrequency.ANNUALLY,
        coverageAmount: 2000000,
        brokerName: "Bahrain Insurance Brokers",
        brokerContact: "+973 1700 4455",
        notes: "Full building structure coverage. Renewal due January 2026.",
      },
      {
        propertyId: property.id,
        type: InsuranceType.PUBLIC_LIABILITY,
        insurer: "AXA Gulf",
        policyNumber: "AXA-PL-2025-0881",
        startDate: d("2025-06-01"),
        endDate: d("2026-05-31"),
        premiumAmount: 480,
        premiumFrequency: PremiumFrequency.BIANNUALLY,
        coverageAmount: 500000,
        brokerName: "Bahrain Insurance Brokers",
        brokerContact: "+973 1700 4455",
        notes: "Covers third-party injury and property damage claims.",
      },
    ],
  });
  console.log("✓ 2 insurance policies created");

  // ── ASSETS ─────────────────────────────────────────────────────────────────
  const assetDefs = [
    {
      name: "Cummins Standby Generator",
      category: AssetCategory.GENERATOR,
      serialNumber: "CUM-C150D5-00341",
      purchaseDate: d("2021-04-10"),
      purchaseCost: 8500,
      warrantyExpiry: d("2024-04-10"),
      serviceProvider: "Cummins Bahrain",
      serviceContact: "+973 1770 0011",
      notes: "150 kVA Cummins diesel generator. Powers common areas and lifts during MEW outages.",
      schedule: { taskName: "Monthly Generator Service Check", frequency: MaintenanceFrequency.MONTHLY, nextDue: d("2026-04-10") },
    },
    {
      name: "ThyssenKrupp Passenger Lift",
      category: AssetCategory.LIFT,
      serialNumber: "TK-MRL-2020-BH-004",
      purchaseDate: d("2020-09-01"),
      purchaseCost: 14000,
      warrantyExpiry: null,
      serviceProvider: "ThyssenKrupp Elevator Bahrain",
      serviceContact: "+973 1721 5566",
      notes: "10-person machine-room-less lift. Annual statutory inspection required.",
      schedule: { taskName: "Quarterly Lift Servicing", frequency: MaintenanceFrequency.QUARTERLY, nextDue: d("2026-04-01") },
    },
    {
      name: "Grundfos Water Pump",
      category: AssetCategory.PLUMBING,
      serialNumber: "GRF-CM5-2023-0055",
      purchaseDate: d("2023-02-14"),
      purchaseCost: 950,
      warrantyExpiry: d("2025-02-14"),
      serviceProvider: "Aqua Systems Bahrain",
      serviceContact: "+973 1733 8899",
      notes: "Supplies pressurised water to all floors from rooftop tanks.",
      schedule: { taskName: "Biannual Pump Inspection", frequency: MaintenanceFrequency.BIANNUALLY, nextDue: d("2026-06-14") },
    },
    {
      name: "Hikvision 16-Channel CCTV System",
      category: AssetCategory.SECURITY,
      serialNumber: "HIK-DS-16CH-2022",
      purchaseDate: d("2022-07-20"),
      purchaseCost: 1800,
      warrantyExpiry: d("2025-07-20"),
      serviceProvider: "Techno Systems Bahrain",
      serviceContact: "+973 1744 6677",
      notes: "16 cameras covering entrance, car park, corridors, and rooftop. 30-day storage.",
      schedule: { taskName: "Annual CCTV Review & Maintenance", frequency: MaintenanceFrequency.ANNUALLY, nextDue: d("2026-07-20") },
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
        description: "Monthly Security Patrol — G4S Bahrain",
        category: ExpenseCategory.CLEANER,
        amount: 350,
        scope: ExpenseScope.PROPERTY,
        propertyId: property.id,
        frequency: RecurringFrequency.MONTHLY,
        nextDueDate: d("2026-04-01"),
        isActive: true,
      },
      {
        description: "Landscaping & Garden Maintenance — Rooftop & Grounds",
        category: ExpenseCategory.CLEANER,
        amount: 120,
        scope: ExpenseScope.PROPERTY,
        propertyId: property.id,
        frequency: RecurringFrequency.MONTHLY,
        nextDueDate: d("2026-04-01"),
        isActive: true,
      },
      {
        description: "Quarterly Generator Service — Cummins Bahrain",
        category: ExpenseCategory.MAINTENANCE,
        amount: 280,
        scope: ExpenseScope.PROPERTY,
        propertyId: property.id,
        frequency: RecurringFrequency.QUARTERLY,
        nextDueDate: d("2026-06-01"),
        isActive: true,
      },
      {
        description: "Annual Lift Servicing Contract — ThyssenKrupp",
        category: ExpenseCategory.MAINTENANCE,
        amount: 800,
        scope: ExpenseScope.PROPERTY,
        propertyId: property.id,
        frequency: RecurringFrequency.ANNUAL,
        nextDueDate: d("2026-12-01"),
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
      amountOwed: 800,
      notes: "Tenant has not paid rent for February and March 2026 (BD 400 × 2 months). Called on 15 March — promised to clear by end of month. Follow up required.",
    },
  });

  await prisma.arrearsCase.create({
    data: {
      tenantId: tenants["304"].id,
      propertyId: property.id,
      stage: ArrearsStage.INFORMAL_REMINDER,
      amountOwed: 595,
      notes: "March 2026 rent outstanding (BD 520 + BD 75 service charge). SMS reminder sent 10 March. Tenant has given notice — chase payment before lease-end.",
    },
  });
  console.log("✓ 2 arrears cases created");

  // ── DONE ───────────────────────────────────────────────────────────────────
  console.log("\n✅ Al Seef Residences seeded successfully!");
  console.log("   Owner login:   owner@alseef.bh   /  demo123");
  console.log("   Manager login: manager@alseef.bh  /  demo123");
  console.log("   20 units · 20 tenants · 3 months history (Jan–Mar 2026)");
  console.log("   Currency: BHD (Bahraini Dinar)");
  console.log("   Includes: income, invoices, expenses, petty cash, insurance, assets, recurring expenses, arrears");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
