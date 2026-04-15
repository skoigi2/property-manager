import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { DEMO_PROPERTIES } from "@/lib/demo-definitions";
import {
  PropertyType, PropertyCategory, UnitType, UnitStatus,
  IncomeType, ExpenseCategory, ExpenseScope, PettyCashType,
  InsuranceType, PremiumFrequency, AssetCategory, MaintenanceFrequency,
  RecurringFrequency, ArrearsStage, InvoiceStatus,
} from "@prisma/client";

// Seed route can take 30–60 s with 200+ sequential DB inserts — raise the function timeout
export const maxDuration = 60;

function d(dateStr: string) { return new Date(dateStr); }
function monthStart(year: number, month: number) { return new Date(year, month, 1); }

// ─────────────────────────────────────────────────────────────────────────────
// Al Seef Residences — Bahrain demo
// Adapted from prisma/seed-bahrain.ts (no hardcoded org/users/PropertyAccess)
// ─────────────────────────────────────────────────────────────────────────────

async function seedAlSeef(organizationId: string): Promise<{ id: string }> {
  // ── Property ────────────────────────────────────────────────────────────────
  const property = await prisma.property.create({
    data: {
      name: "Al Seef Residences",
      type: PropertyType.LONGTERM,
      category: PropertyCategory.RESIDENTIAL,
      address: "Seef District, Manama",
      city: "Manama",
      description:
        "Modern 4-storey residential tower in the heart of Seef District. 20 fully-furnished apartments with central A/C, covered parking, rooftop terrace, and 24/7 security.",
      serviceChargeDefault: 75,
      organizationId,
      currency: "BHD",
    },
  });

  // ── Units ───────────────────────────────────────────────────────────────────
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
        amenities: [
          "Central A/C",
          "Covered Parking",
          "24/7 Security",
          ...(u.floor >= 3 ? ["City View", "Balcony"] : []),
        ],
        description: `${
          u.type === UnitType.ONE_BED
            ? "1-bedroom"
            : u.type === UnitType.TWO_BED
            ? "2-bedroom"
            : "3-bedroom"
        } apartment on floor ${u.floor}`,
        sizeSqm: u.sqm,
      },
    });
  }

  // ── Tenants ─────────────────────────────────────────────────────────────────
  function sc(unitNumber: string): number {
    const u = unitDefs.find((x) => x.number === unitNumber)!;
    return u.type === UnitType.ONE_BED ? 50 : u.type === UnitType.TWO_BED ? 75 : 100;
  }

  const tenantDefs = [
    { unit: "101", name: "Ahmed Al-Dosari",        rent: 350, leaseEnd: "2027-12-31", phone: "+973 3900 1101", email: "ahmed.aldosari@gmail.com",    nationalId: "BH-19820341" },
    { unit: "102", name: "Priya Sharma",            rent: 350, leaseEnd: "2026-12-31", phone: "+973 3900 1102", email: "priya.sharma@gmail.com",       nationalId: "IN-EXP-2340" },
    { unit: "103", name: "Mohammed Al-Mannai",      rent: 500, leaseEnd: "2027-12-31", phone: "+973 3900 1103", email: "m.almannaibh@gmail.com",       nationalId: "BH-19751234" },
    { unit: "104", name: "James & Claire Harrison", rent: 500, leaseEnd: "2026-12-31", phone: "+973 3900 1104", email: "j.harrison.bh@gmail.com",      nationalId: "GB-EXP-0891" },
    { unit: "105", name: "Rajesh Kumar",            rent: 500, leaseEnd: "2026-12-31", phone: "+973 3900 1105", email: "rajesh.kumar.bh@gmail.com",    nationalId: "IN-EXP-5512" },
    { unit: "201", name: "Fatima Al-Khalifa",       rent: 370, leaseEnd: "2027-12-31", phone: "+973 3900 2201", email: "fatima.alkhalifa@gmail.com",   nationalId: "BH-19900876" },
    { unit: "202", name: "Tariq Hussain",           rent: 370, leaseEnd: "2026-12-31", phone: "+973 3900 2202", email: "tariq.hussain.bh@gmail.com",   nationalId: "PK-EXP-3312" },
    { unit: "203", name: "Nasser Al-Qasimi",        rent: 520, leaseEnd: "2027-12-31", phone: "+973 3900 2203", email: "n.alqasimi@gmail.com",         nationalId: "AE-EXP-0044" },
    { unit: "204", name: "Sunita & Vikram Nair",    rent: 520, leaseEnd: "2026-12-31", phone: "+973 3900 2204", email: "vikram.nair.bh@gmail.com",     nationalId: "IN-EXP-7789" },
    { unit: "205", name: "Ali Al-Zayani",           rent: 720, leaseEnd: "2027-12-31", phone: "+973 3900 2205", email: "ali.alzayani@gmail.com",       nationalId: "BH-19780654" },
    { unit: "301", name: "Sarah Mitchell",          rent: 370, leaseEnd: "2026-12-31", phone: "+973 3900 3301", email: "sarah.mitchell.bh@gmail.com",  nationalId: "GB-EXP-1122" },
    { unit: "302", name: "Hassan Al-Buainain",      rent: 520, leaseEnd: "2027-12-31", phone: "+973 3900 3302", email: "h.albuainain@gmail.com",       nationalId: "BH-19851023" },
    { unit: "303", name: "Anwar Al-Rashid",         rent: 520, leaseEnd: "2027-12-31", phone: "+973 3900 3303", email: "anwar.alrashid@gmail.com",     nationalId: "BH-19800412" },
    { unit: "304", name: "Deepak & Meera Pillai",   rent: 520, leaseEnd: "2026-12-31", phone: "+973 3900 3304", email: "deepak.pillai.bh@gmail.com",   nationalId: "IN-EXP-2209" },
    { unit: "305", name: "Khalid Al-Rumaihi",       rent: 720, leaseEnd: "2027-12-31", phone: "+973 3900 3305", email: "k.alrumaihi@gmail.com",        nationalId: "BH-19720889" },
    { unit: "401", name: "Omar Al-Tajer",           rent: 390, leaseEnd: "2027-12-31", phone: "+973 3900 4401", email: "omar.altajer@gmail.com",       nationalId: "BH-19930567" },
    { unit: "402", name: "Aisha Yusuf",             rent: 540, leaseEnd: "2026-12-31", phone: "+973 3900 4402", email: "aisha.yusuf.bh@gmail.com",     nationalId: "BH-19870234" },
    { unit: "403", name: "Michael & Diane Foster",  rent: 540, leaseEnd: "2026-12-31", phone: "+973 3900 4403", email: "m.foster.bahrain@gmail.com",   nationalId: "US-EXP-3301" },
    { unit: "404", name: "Abdullah Al-Maktoum",     rent: 750, leaseEnd: "2027-12-31", phone: "+973 3900 4404", email: "a.almaktoum.bh@gmail.com",     nationalId: "AE-EXP-0078" },
    { unit: "405", name: "Faisal Al-Noaimi",        rent: 750, leaseEnd: "2027-12-31", phone: "+973 3900 4405", email: "faisal.alnoaimi@gmail.com",    nationalId: "BH-19680123" },
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
        notes:
          t.unit === "304"
            ? "Tenant has given notice. Plans to relocate at lease end Dec 2026."
            : null,
      },
    });
  }

  // ── Management fee configs ──────────────────────────────────────────────────
  await prisma.managementFeeConfig.createMany({
    data: unitDefs.map((u) => ({
      unitId: units[u.number].id,
      flatAmount: u.type === UnitType.ONE_BED ? 50 : u.type === UnitType.TWO_BED ? 75 : 100,
      ratePercent: 0,
      effectiveFrom: d("2026-01-01"),
    })),
  });

  // ── Income & invoices ───────────────────────────────────────────────────────
  const MONTHS = [0, 1, 2]; // Jan, Feb, Mar
  const YEAR = 2026;
  // Arrears: unit 102 misses Feb + Mar; unit 304 misses Mar
  const arrears: Record<string, number[]> = { "102": [1, 2], "304": [2] };
  let invoiceSeq = 1;
  // Use last 6 chars of propertyId to namespace invoice numbers globally unique
  const propCode = property.id.slice(-6).toUpperCase();

  // Collect income entries to batch-create after all invoices are created
  const incomeEntryData: {
    date: Date; unitId: string; tenantId: string; invoiceId: string;
    type: IncomeType; grossAmount: number; agentCommission: number;
  }[] = [];

  for (const month of MONTHS) {
    for (const t of tenantDefs) {
      const unit = units[t.unit];
      const tenant = tenants[t.unit];
      const serviceCharge = sc(t.unit);
      const grossAmount = t.rent + serviceCharge;
      const isArrears = (arrears[t.unit] ?? []).includes(month);

      const invoiceNum = `ASR-${propCode}-${YEAR}-${String(month + 1).padStart(2, "0")}-${String(
        invoiceSeq++
      ).padStart(3, "0")}`;

      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber: invoiceNum,
          tenantId: tenant.id,
          periodYear: YEAR,
          periodMonth: month + 1,
          rentAmount: t.rent,
          serviceCharge,
          totalAmount: grossAmount,
          dueDate: new Date(YEAR, month, 5),
          status: isArrears ? InvoiceStatus.OVERDUE : InvoiceStatus.PAID,
          paidAt: isArrears ? null : new Date(YEAR, month, 1),
          paidAmount: isArrears ? null : grossAmount,
        },
      });

      if (!isArrears) {
        incomeEntryData.push({
          date: monthStart(YEAR, month),
          unitId: unit.id,
          tenantId: tenant.id,
          invoiceId: invoice.id,
          type: IncomeType.LONGTERM_RENT,
          grossAmount,
          agentCommission: 0,
        });
      }
    }
  }

  // Batch-create all 57 income entries in one round-trip
  await prisma.incomeEntry.createMany({ data: incomeEntryData });

  // ── Property-level monthly expenses (batched) ──────────────────────────────
  const monthlyPropExpenses = [
    { category: ExpenseCategory.MANAGEMENT_FEE, amount: 650, desc: "Monthly management fee — Al Seef Property Management" },
    { category: ExpenseCategory.WATER,          amount: 180, desc: "BEWA — building water supply"                          },
    { category: ExpenseCategory.ELECTRICITY,    amount: 220, desc: "MEW — common areas, lifts & car park lighting"         },
    { category: ExpenseCategory.WIFI,           amount: 90,  desc: "Batelco Fibre — building internet infrastructure"      },
    { category: ExpenseCategory.CLEANER,        amount: 380, desc: "Cleaning staff — 2 full-time (common areas & grounds)" },
  ];

  await prisma.expenseEntry.createMany({
    data: MONTHS.flatMap((month) =>
      monthlyPropExpenses.map((e) => ({
        date: monthStart(YEAR, month),
        propertyId: property.id,
        scope: ExpenseScope.PROPERTY,
        category: e.category,
        amount: e.amount,
        description: e.desc,
        isSunkCost: false,
        paidFromPettyCash: false,
      }))
    ),
  });

  // ── Unit-level ad-hoc expenses (batched) ───────────────────────────────────
  await prisma.expenseEntry.createMany({
    data: [
      { month: 0, unit: "103", cat: ExpenseCategory.MAINTENANCE,   amount: 120, desc: "Plumbing repair — bathroom tap replacement",  sunk: false },
      { month: 1, unit: "201", cat: ExpenseCategory.MAINTENANCE,   amount: 85,  desc: "Electrical fault — kitchen circuit breaker",   sunk: false },
      { month: 1, unit: "404", cat: ExpenseCategory.MAINTENANCE,   amount: 310, desc: "A/C compressor replacement — master bedroom",  sunk: true  },
      { month: 2, unit: "302", cat: ExpenseCategory.REINSTATEMENT, amount: 420, desc: "Deep clean & repainting — post-notice unit",   sunk: true  },
    ].map((e) => ({
      date: monthStart(YEAR, e.month),
      unitId: units[e.unit].id,
      scope: ExpenseScope.UNIT,
      category: e.cat,
      amount: e.amount,
      description: e.desc,
      isSunkCost: e.sunk,
      paidFromPettyCash: false,
    })),
  });

  // ── Petty cash (batched) ────────────────────────────────────────────────────
  await prisma.pettyCash.createMany({
    data: [
      // Monthly top-ups (IN)
      ...MONTHS.map((month) => ({
        date: monthStart(YEAR, month),
        type: PettyCashType.IN,
        amount: 500,
        description: "Monthly petty cash top-up",
        propertyId: property.id,
      })),
      // OUT withdrawals
      ...([
        { month: 0, day: 8,  amount: 45, desc: "Lightbulbs & electrical fittings — lobby & corridors" },
        { month: 0, day: 14, amount: 80, desc: "Emergency plumber call-out — unit 103 overflow"        },
        { month: 0, day: 22, amount: 15, desc: "Stationery & notice printing"                          },
        { month: 1, day: 6,  amount: 55, desc: "Cleaning materials & detergents restock"               },
        { month: 1, day: 13, amount: 90, desc: "Emergency electrician — lift control panel"            },
        { month: 1, day: 20, amount: 20, desc: "Replacement padlocks & keys — car park gate"           },
        { month: 2, day: 9,  amount: 40, desc: "Garden tools & soil conditioner — rooftop terrace"     },
        { month: 2, day: 17, amount: 65, desc: "Minor plumbing repairs — common area bathrooms"        },
        { month: 2, day: 25, amount: 12, desc: "Postage & courier — lease correspondence"              },
      ] as { month: number; day: number; amount: number; desc: string }[]).map((p) => ({
        date: new Date(YEAR, p.month, p.day),
        type: PettyCashType.OUT,
        amount: p.amount,
        description: p.desc,
        propertyId: property.id,
      })),
    ],
  });

  // ── Insurance policies ──────────────────────────────────────────────────────
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

  // ── Assets + maintenance schedules ─────────────────────────────────────────
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

  // ── Recurring expenses ──────────────────────────────────────────────────────
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

  // ── Arrears cases ───────────────────────────────────────────────────────────
  await prisma.arrearsCase.create({
    data: {
      tenantId: tenants["102"].id,
      propertyId: property.id,
      stage: ArrearsStage.INFORMAL_REMINDER,
      amountOwed: 800,
      notes:
        "Tenant has not paid rent for February and March 2026 (BD 400 × 2 months). Called on 15 March — promised to clear by end of month. Follow up required.",
    },
  });

  await prisma.arrearsCase.create({
    data: {
      tenantId: tenants["304"].id,
      propertyId: property.id,
      stage: ArrearsStage.INFORMAL_REMINDER,
      amountOwed: 595,
      notes:
        "March 2026 rent outstanding (BD 520 + BD 75 service charge). SMS reminder sent 10 March. Tenant has given notice — chase payment before lease-end.",
    },
  });

  return property;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sandton Heights — South Africa demo
// ─────────────────────────────────────────────────────────────────────────────

async function seedSandtonHeights(organizationId: string): Promise<{ id: string }> {
  // ── Property ────────────────────────────────────────────────────────────────
  const property = await prisma.property.create({
    data: {
      name: "Sandton Heights",
      type: PropertyType.LONGTERM,
      category: PropertyCategory.RESIDENTIAL,
      address: "14 Rivonia Road, Sandton",
      city: "Johannesburg",
      description:
        "Modern 3-storey residential complex in the heart of Sandton. 9 spacious apartments with fibre internet, covered parking, landscaped gardens, and 24/7 security.",
      serviceChargeDefault: 600,
      organizationId,
      currency: "ZAR",
    },
  });

  // ── Units ───────────────────────────────────────────────────────────────────
  const unitDefs = [
    // Floor 1
    { number: "101", type: UnitType.ONE_BED,   rent: 8500,  floor: 1, sqm: 55  },
    { number: "102", type: UnitType.ONE_BED,   rent: 8500,  floor: 1, sqm: 55  },
    { number: "103", type: UnitType.TWO_BED,   rent: 13500, floor: 1, sqm: 88  },
    // Floor 2
    { number: "201", type: UnitType.TWO_BED,   rent: 14000, floor: 2, sqm: 92  },
    { number: "202", type: UnitType.TWO_BED,   rent: 14000, floor: 2, sqm: 92  },
    { number: "203", type: UnitType.THREE_BED, rent: 19500, floor: 2, sqm: 128 },
    // Floor 3
    { number: "301", type: UnitType.ONE_BED,   rent: 9200,  floor: 3, sqm: 58  },
    { number: "302", type: UnitType.TWO_BED,   rent: 14500, floor: 3, sqm: 95  },
    { number: "303", type: UnitType.THREE_BED, rent: 20000, floor: 3, sqm: 132 },
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
        amenities: [
          "Fibre Internet",
          "Covered Parking",
          "24/7 Security",
          ...(u.floor >= 2 ? ["Garden View", "Balcony"] : []),
        ],
        description: `${
          u.type === UnitType.ONE_BED
            ? "1-bedroom"
            : u.type === UnitType.TWO_BED
            ? "2-bedroom"
            : "3-bedroom"
        } apartment on floor ${u.floor}`,
        sizeSqm: u.sqm,
      },
    });
  }

  // ── Tenants ─────────────────────────────────────────────────────────────────
  function sc(unitNumber: string): number {
    const u = unitDefs.find((x) => x.number === unitNumber)!;
    return u.type === UnitType.ONE_BED ? 500 : u.type === UnitType.TWO_BED ? 650 : 800;
  }

  const tenantDefs = [
    { unit: "101", name: "Sipho Dlamini",             rent: 8500,  leaseEnd: "2027-06-30", phone: "+27 82 401 1101", email: "sipho.dlamini@gmail.com",       nationalId: "ZA-8502285401082" },
    { unit: "102", name: "Priya Naidoo",               rent: 8500,  leaseEnd: "2026-12-31", phone: "+27 82 401 1102", email: "priya.naidoo@gmail.com",         nationalId: "ZA-9103040234086" },
    { unit: "103", name: "Thabo & Zanele Mokoena",     rent: 13500, leaseEnd: "2027-06-30", phone: "+27 83 401 1103", email: "thabo.mokoena@gmail.com",        nationalId: "ZA-7809155512089" },
    { unit: "201", name: "Johan van der Merwe",        rent: 14000, leaseEnd: "2026-12-31", phone: "+27 83 401 2201", email: "j.vandermerwe@gmail.com",        nationalId: "ZA-8407125063080" },
    { unit: "202", name: "Ayesha Patel",               rent: 14000, leaseEnd: "2026-12-31", phone: "+27 83 401 2202", email: "ayesha.patel.jhb@gmail.com",     nationalId: "ZA-9205094321083" },
    { unit: "203", name: "Lungelo Khumalo",            rent: 19500, leaseEnd: "2027-12-31", phone: "+27 83 401 2203", email: "l.khumalo@gmail.com",            nationalId: "ZA-7612185678084" },
    { unit: "301", name: "Annelie Botha",              rent: 9200,  leaseEnd: "2027-06-30", phone: "+27 82 401 3301", email: "annelie.botha@gmail.com",        nationalId: "ZA-8901145234087" },
    { unit: "302", name: "Rajesh Govender",            rent: 14500, leaseEnd: "2026-12-31", phone: "+27 82 401 3302", email: "r.govender.jhb@gmail.com",       nationalId: "ZA-8306284512085" },
    { unit: "303", name: "Michael & Sarah Pretorius",  rent: 20000, leaseEnd: "2027-12-31", phone: "+27 82 401 3303", email: "m.pretorius@gmail.com",          nationalId: "ZA-7503235678082" },
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
        renewalStage: "NONE",
      },
    });
  }

  // ── Management fee configs ──────────────────────────────────────────────────
  await prisma.managementFeeConfig.createMany({
    data: unitDefs.map((u) => ({
      unitId: units[u.number].id,
      flatAmount: u.type === UnitType.ONE_BED ? 850 : u.type === UnitType.TWO_BED ? 1100 : 1500,
      ratePercent: 0,
      effectiveFrom: d("2026-01-01"),
    })),
  });

  // ── Income & invoices ───────────────────────────────────────────────────────
  const MONTHS = [0, 1, 2]; // Jan, Feb, Mar
  const YEAR = 2026;
  // Arrears: unit 102 misses Feb + Mar; unit 302 misses Mar
  const arrears: Record<string, number[]> = { "102": [1, 2], "302": [2] };
  let invoiceSeq = 1;
  const propCode = property.id.slice(-6).toUpperCase();

  const incomeEntryData: {
    date: Date; unitId: string; tenantId: string; invoiceId: string;
    type: IncomeType; grossAmount: number; agentCommission: number;
  }[] = [];

  for (const month of MONTHS) {
    for (const t of tenantDefs) {
      const unit = units[t.unit];
      const tenant = tenants[t.unit];
      const serviceCharge = sc(t.unit);
      const grossAmount = t.rent + serviceCharge;
      const isArrears = (arrears[t.unit] ?? []).includes(month);

      const invoiceNum = `SH-${propCode}-${YEAR}-${String(month + 1).padStart(2, "0")}-${String(
        invoiceSeq++
      ).padStart(3, "0")}`;

      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber: invoiceNum,
          tenantId: tenant.id,
          periodYear: YEAR,
          periodMonth: month + 1,
          rentAmount: t.rent,
          serviceCharge,
          totalAmount: grossAmount,
          dueDate: new Date(YEAR, month, 5),
          status: isArrears ? InvoiceStatus.OVERDUE : InvoiceStatus.PAID,
          paidAt: isArrears ? null : new Date(YEAR, month, 1),
          paidAmount: isArrears ? null : grossAmount,
        },
      });

      if (!isArrears) {
        incomeEntryData.push({
          date: monthStart(YEAR, month),
          unitId: unit.id,
          tenantId: tenant.id,
          invoiceId: invoice.id,
          type: IncomeType.LONGTERM_RENT,
          grossAmount,
          agentCommission: 0,
        });
      }
    }
  }

  await prisma.incomeEntry.createMany({ data: incomeEntryData });

  // ── Property-level monthly expenses (batched) ──────────────────────────────
  const monthlyPropExpenses = [
    { category: ExpenseCategory.MANAGEMENT_FEE, amount: 7200, desc: "Monthly management fee — Sandton Property Management"    },
    { category: ExpenseCategory.WATER,          amount: 2400, desc: "City of Johannesburg — water & sewerage"                 },
    { category: ExpenseCategory.ELECTRICITY,    amount: 3800, desc: "Eskom — common areas & security lighting"                },
    { category: ExpenseCategory.CLEANER,        amount: 5500, desc: "Cleaning staff — 2 cleaners (common areas & grounds)"    },
    { category: ExpenseCategory.WIFI,           amount: 1200, desc: "Vox Fibre — building internet infrastructure"            },
  ];

  await prisma.expenseEntry.createMany({
    data: MONTHS.flatMap((month) =>
      monthlyPropExpenses.map((e) => ({
        date: monthStart(YEAR, month),
        propertyId: property.id,
        scope: ExpenseScope.PROPERTY,
        category: e.category,
        amount: e.amount,
        description: e.desc,
        isSunkCost: false,
        paidFromPettyCash: false,
      }))
    ),
  });

  // ── Unit-level ad-hoc expenses (batched) ───────────────────────────────────
  await prisma.expenseEntry.createMany({
    data: [
      { month: 0, unit: "103", cat: ExpenseCategory.MAINTENANCE,   amount: 1800, desc: "Geyser replacement — hot water cylinder unit 103",   sunk: false },
      { month: 1, unit: "201", cat: ExpenseCategory.MAINTENANCE,   amount: 950,  desc: "Electrical fault — DB board trip, unit 201",         sunk: false },
      { month: 1, unit: "203", cat: ExpenseCategory.MAINTENANCE,   amount: 4200, desc: "Air conditioning compressor — master bedroom",        sunk: true  },
      { month: 2, unit: "302", cat: ExpenseCategory.REINSTATEMENT, amount: 3500, desc: "Deep clean & touch-up painting — notice unit 302",    sunk: true  },
    ].map((e) => ({
      date: monthStart(YEAR, e.month),
      unitId: units[e.unit].id,
      scope: ExpenseScope.UNIT,
      category: e.cat,
      amount: e.amount,
      description: e.desc,
      isSunkCost: e.sunk,
      paidFromPettyCash: false,
    })),
  });

  // ── Petty cash (batched) ────────────────────────────────────────────────────
  await prisma.pettyCash.createMany({
    data: [
      // Monthly top-ups (IN)
      ...MONTHS.map((month) => ({
        date: monthStart(YEAR, month),
        type: PettyCashType.IN,
        amount: 2000,
        description: "Monthly petty cash top-up",
        propertyId: property.id,
      })),
      // OUT withdrawals
      ...([
        { month: 0, day: 7,  amount: 320, desc: "Lightbulbs & electrical fittings — lobby & stairwells"   },
        { month: 0, day: 15, amount: 850, desc: "Emergency plumber call-out — unit 103 geyser overflow"    },
        { month: 0, day: 23, amount: 120, desc: "Stationery & notice printing"                             },
        { month: 1, day: 5,  amount: 480, desc: "Cleaning materials & detergents restock"                  },
        { month: 1, day: 12, amount: 750, desc: "Emergency electrician — DB board fault unit 201"          },
        { month: 1, day: 19, amount: 180, desc: "Replacement locks & keys — gate & entrance"               },
        { month: 2, day: 8,  amount: 350, desc: "Garden tools & potting soil — landscaped gardens"         },
        { month: 2, day: 16, amount: 560, desc: "Minor plumbing repairs — common area bathrooms"           },
        { month: 2, day: 24, amount: 140, desc: "Postage & courier — lease correspondence"                 },
      ] as { month: number; day: number; amount: number; desc: string }[]).map((p) => ({
        date: new Date(YEAR, p.month, p.day),
        type: PettyCashType.OUT,
        amount: p.amount,
        description: p.desc,
        propertyId: property.id,
      })),
    ],
  });

  // ── Insurance policies ──────────────────────────────────────────────────────
  await prisma.insurancePolicy.createMany({
    data: [
      {
        propertyId: property.id,
        type: InsuranceType.BUILDING,
        insurer: "Santam",
        policyNumber: "SAN-BLD-2025-4421",
        startDate: d("2025-01-01"),
        endDate: d("2025-12-31"),
        premiumAmount: 18500,
        premiumFrequency: PremiumFrequency.ANNUALLY,
        coverageAmount: 8000000,
        brokerName: "Marsh South Africa",
        brokerContact: "+27 11 060 7100",
        notes: "Full building structure coverage. Renewal due January 2026.",
      },
      {
        propertyId: property.id,
        type: InsuranceType.PUBLIC_LIABILITY,
        insurer: "Old Mutual Insure",
        policyNumber: "OMI-PL-2025-0312",
        startDate: d("2025-06-01"),
        endDate: d("2026-05-31"),
        premiumAmount: 4800,
        premiumFrequency: PremiumFrequency.BIANNUALLY,
        coverageAmount: 2000000,
        brokerName: "Marsh South Africa",
        brokerContact: "+27 11 060 7100",
        notes: "Covers third-party injury and property damage claims.",
      },
    ],
  });

  // ── Assets + maintenance schedules ─────────────────────────────────────────
  const assetDefs = [
    {
      name: "Perkins Standby Generator",
      category: AssetCategory.GENERATOR,
      serialNumber: "PKS-P100P5-00781",
      purchaseDate: d("2021-03-15"),
      purchaseCost: 85000,
      warrantyExpiry: d("2024-03-15"),
      serviceProvider: "Agrico Equipment",
      serviceContact: "+27 11 966 0010",
      notes: "100 kVA Perkins diesel generator. Powers common areas and security systems during Eskom load-shedding.",
      schedule: { taskName: "Monthly Generator Service Check", frequency: MaintenanceFrequency.MONTHLY, nextDue: d("2026-04-15") },
    },
    {
      name: "Otis Passenger Lift",
      category: AssetCategory.LIFT,
      serialNumber: "OTS-MRL-2020-JHB-002",
      purchaseDate: d("2020-08-01"),
      purchaseCost: 145000,
      warrantyExpiry: null,
      serviceProvider: "Otis Elevator Company SA",
      serviceContact: "+27 11 490 6000",
      notes: "8-person machine-room-less lift. Annual statutory inspection required.",
      schedule: { taskName: "Quarterly Lift Servicing", frequency: MaintenanceFrequency.QUARTERLY, nextDue: d("2026-04-01") },
    },
    {
      name: "Grundfos Pressure Pump",
      category: AssetCategory.PLUMBING,
      serialNumber: "GRF-CM10-2022-0089",
      purchaseDate: d("2022-05-10"),
      purchaseCost: 12500,
      warrantyExpiry: d("2025-05-10"),
      serviceProvider: "Pump & Valve SA",
      serviceContact: "+27 11 444 8800",
      notes: "Supplies pressurised water to all floors from municipal connection.",
      schedule: { taskName: "Biannual Pump Inspection", frequency: MaintenanceFrequency.BIANNUALLY, nextDue: d("2026-06-10") },
    },
    {
      name: "Hikvision 16-Channel CCTV System",
      category: AssetCategory.SECURITY,
      serialNumber: "HIK-DS-16CH-2022-SA",
      purchaseDate: d("2022-09-12"),
      purchaseCost: 22000,
      warrantyExpiry: d("2025-09-12"),
      serviceProvider: "ADT Security",
      serviceContact: "+27 11 418 1111",
      notes: "16 cameras covering entrance, parking, corridors, and gardens. 30-day storage.",
      schedule: { taskName: "Annual CCTV Review & Maintenance", frequency: MaintenanceFrequency.ANNUALLY, nextDue: d("2026-09-12") },
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

  // ── Recurring expenses ──────────────────────────────────────────────────────
  await prisma.recurringExpense.createMany({
    data: [
      {
        description: "Monthly Security Patrol — G4S South Africa",
        category: ExpenseCategory.CLEANER,
        amount: 3200,
        scope: ExpenseScope.PROPERTY,
        propertyId: property.id,
        frequency: RecurringFrequency.MONTHLY,
        nextDueDate: d("2026-04-01"),
        isActive: true,
      },
      {
        description: "Landscaping & Garden Maintenance — Grounds",
        category: ExpenseCategory.CLEANER,
        amount: 1500,
        scope: ExpenseScope.PROPERTY,
        propertyId: property.id,
        frequency: RecurringFrequency.MONTHLY,
        nextDueDate: d("2026-04-01"),
        isActive: true,
      },
      {
        description: "Quarterly Generator Service — Agrico Equipment",
        category: ExpenseCategory.MAINTENANCE,
        amount: 2800,
        scope: ExpenseScope.PROPERTY,
        propertyId: property.id,
        frequency: RecurringFrequency.QUARTERLY,
        nextDueDate: d("2026-06-01"),
        isActive: true,
      },
      {
        description: "Annual Lift Servicing Contract — Otis SA",
        category: ExpenseCategory.MAINTENANCE,
        amount: 8500,
        scope: ExpenseScope.PROPERTY,
        propertyId: property.id,
        frequency: RecurringFrequency.ANNUAL,
        nextDueDate: d("2026-12-01"),
        isActive: true,
      },
    ],
  });

  // ── Arrears cases ───────────────────────────────────────────────────────────
  await prisma.arrearsCase.create({
    data: {
      tenantId: tenants["102"].id,
      propertyId: property.id,
      stage: ArrearsStage.INFORMAL_REMINDER,
      amountOwed: 18000,
      notes:
        "Tenant has not paid rent for February and March 2026 (R9,000 × 2 months). Called on 18 March — promised to settle by month-end. Follow-up required.",
    },
  });

  await prisma.arrearsCase.create({
    data: {
      tenantId: tenants["302"].id,
      propertyId: property.id,
      stage: ArrearsStage.INFORMAL_REMINDER,
      amountOwed: 15150,
      notes:
        "March 2026 rent outstanding (R14,500 + R650 service charge). WhatsApp reminder sent 8 March. Awaiting response.",
    },
  });

  return property;
}

// ─────────────────────────────────────────────────────────────────────────────
// Route handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const { error, session } = await requireAuth();
  if (error) return error;

  // Read body first so we can use the client-supplied organizationId
  const body = await req.json().catch(() => ({}));
  const demoKey     = body?.demoKey      as string | undefined;
  const clientOrgId = body?.organizationId as string | undefined;

  // ── Resolve organizationId ────────────────────────────────────────────────
  // Prefer the org the client explicitly sent (= session.user.organizationId on
  // the browser, always the active org). Fall back to server-side lookups only
  // when the client sends nothing (e.g. onboarding with a brand-new org that
  // hasn't been written to the JWT cookie yet).
  let organizationId: string | null = null;

  if (clientOrgId) {
    // Validate the user actually belongs to this org before trusting it
    const membership = await prisma.userOrganizationMembership.findFirst({
      where: { userId: session!.user.id, organizationId: clientOrgId },
      select: { organizationId: true },
    });
    if (!membership) {
      // Membership row may be missing (pgBouncer partial commit) — also accept
      // if User.organizationId matches
      const dbUser = await prisma.user.findUnique({
        where: { id: session!.user.id },
        select: { organizationId: true },
      });
      if (dbUser?.organizationId !== clientOrgId) {
        return NextResponse.json({ error: "Organisation access denied." }, { status: 403 });
      }
    }
    organizationId = clientOrgId;
  } else {
    // No org in body — fall back to server-side resolution
    organizationId = (session!.user as any).organizationId as string | null;
    if (!organizationId) {
      const membership = await prisma.userOrganizationMembership.findFirst({
        where: { userId: session!.user.id },
        select: { organizationId: true },
      });
      organizationId = membership?.organizationId ?? null;
    }
    if (!organizationId) {
      const dbUser = await prisma.user.findUnique({
        where: { id: session!.user.id },
        select: { organizationId: true },
      });
      organizationId = dbUser?.organizationId ?? null;
    }
  }

  if (!organizationId) {
    return NextResponse.json({ error: "No organisation found. Complete onboarding first." }, { status: 400 });
  }

  const demo = DEMO_PROPERTIES.find((d) => d.key === demoKey);
  if (!demo) {
    return NextResponse.json({ error: "Unknown demo key." }, { status: 400 });
  }

  // Idempotency — check if this demo property already exists for this org
  const existing = await prisma.property.findFirst({
    where: { name: demo.name, organizationId },
    include: { _count: { select: { units: true } } },
  });

  // Helper: grant PropertyAccess to every member of the org so the property
  // is visible to all users regardless of role, and shows as assigned in the UI
  async function grantAccess(propertyId: string) {
    const members = await prisma.userOrganizationMembership.findMany({
      where:  { organizationId: organizationId! },
      select: { userId: true },
    });
    await prisma.propertyAccess.createMany({
      data:           members.map((m) => ({ userId: m.userId, propertyId })),
      skipDuplicates: true,
    });
  }

  if (existing) {
    if (existing._count.units > 0) {
      // Fully seeded — backfill access for any org members who are missing it
      await grantAccess(existing.id);
      return NextResponse.json({ ok: false, reason: "already_seeded", propertyId: existing.id, organizationId });
    }
    // Partially seeded (property exists but no units). Delete and re-seed.
    await prisma.property.delete({ where: { id: existing.id } });
  }

  try {
    if (demo.key === "al-seef") {
      const property = await seedAlSeef(organizationId);
      await grantAccess(property.id);
      return NextResponse.json({ ok: true, propertyId: property.id, organizationId });
    } else if (demo.key === "sandton-heights") {
      const property = await seedSandtonHeights(organizationId);
      await grantAccess(property.id);
      return NextResponse.json({ ok: true, propertyId: property.id, organizationId });
    } else {
      return NextResponse.json({ error: "Demo not yet implemented." }, { status: 400 });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[demo/seed] Error seeding demo property:", message);
    return NextResponse.json({ ok: false, error: "Seed failed. Please try again.", detail: message }, { status: 500 });
  }
}
