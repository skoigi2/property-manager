import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { DEMO_PROPERTIES } from "@/lib/demo-definitions";
import {
  PropertyType, PropertyCategory, UnitType, UnitStatus,
  IncomeType, ExpenseCategory, ExpenseScope, PettyCashType,
  InsuranceType, PremiumFrequency, AssetCategory, MaintenanceFrequency,
  RecurringFrequency, ArrearsStage, InvoiceStatus, RenewalStage,
  MaintenanceStatus, MaintenancePriority, MaintenanceCategory,
  VendorCategory, OwnerInvoiceType, TaxType,
  LineItemCategory, LineItemPaymentStatus,
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
      schedule: { taskName: "Monthly Generator Service Check", frequency: MaintenanceFrequency.MONTHLY, nextDue: d("2026-04-10"), estimatedCost: 280 },
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
      schedule: { taskName: "Quarterly Lift Servicing", frequency: MaintenanceFrequency.QUARTERLY, nextDue: d("2026-04-01"), estimatedCost: 200 },
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
      schedule: { taskName: "Biannual Pump Inspection", frequency: MaintenanceFrequency.BIANNUALLY, nextDue: d("2026-06-14"), estimatedCost: 150 },
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
      schedule: { taskName: "Annual CCTV Review & Maintenance", frequency: MaintenanceFrequency.ANNUALLY, nextDue: d("2026-07-20"), estimatedCost: 250 },
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
        propertyId: property.id,
        taskName: a.schedule.taskName,
        frequency: a.schedule.frequency,
        nextDue: a.schedule.nextDue,
        isActive: true,
        estimatedCost: a.schedule.estimatedCost,
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

  // ── Link asset maintenance schedules → recurring expenses ──────────────────
  {
    const asSchedLinks = [
      { taskFragment: "Generator",   descFragment: "Generator" },
      { taskFragment: "Lift",        descFragment: "Lift" },
      { taskFragment: "Pump",        descFragment: "Pump" },
      { taskFragment: "CCTV",        descFragment: "CCTV" },
    ];
    const [asSchedRows, asRecurRows] = await Promise.all([
      prisma.assetMaintenanceSchedule.findMany({ where: { propertyId: property.id }, select: { id: true, taskName: true } }),
      prisma.recurringExpense.findMany({ where: { propertyId: property.id }, select: { id: true, description: true } }),
    ]);
    for (const link of asSchedLinks) {
      const sched = asSchedRows.find((s) => s.taskName.includes(link.taskFragment));
      const recur = asRecurRows.find((r) => r.description.includes(link.descFragment));
      if (sched && recur) {
        await prisma.assetMaintenanceSchedule.update({ where: { id: sched.id }, data: { recurringExpenseId: recur.id } });
      }
    }
  }

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

  // ── Vendors ─────────────────────────────────────────────────────────────────
  const [vendorMaint, vendorElec] = await Promise.all([
    prisma.vendor.create({
      data: {
        name: "Gulf Maintenance Services",
        category: VendorCategory.CONTRACTOR,
        phone: "+973 1766 1100",
        email: "info@gulfmaint.bh",
        organizationId,
        isActive: true,
        notes: "General plumbing & civil maintenance contractor for Al Seef.",
      },
    }),
    prisma.vendor.create({
      data: {
        name: "Al Baraka Electrical",
        category: VendorCategory.CONTRACTOR,
        phone: "+973 1744 2200",
        email: "info@albarakaelec.bh",
        organizationId,
        isActive: true,
        notes: "Licensed electrical contractor — fault finding & installations.",
      },
    }),
    prisma.vendor.create({
      data: {
        name: "Bahrain Cleaning Services",
        category: VendorCategory.SERVICE_PROVIDER,
        phone: "+973 1733 5500",
        email: "ops@bahrainclean.bh",
        organizationId,
        isActive: true,
        notes: "Daily common area cleaning & periodic deep-clean services.",
      },
    }),
  ]);

  // ── Agent ────────────────────────────────────────────────────────────────────
  await prisma.agent.create({
    data: {
      organizationId,
      name: "Bahrain Properties LLC",
      phone: "+973 1700 3344",
      email: "leasing@bahrainproperties.bh",
      agency: "Bahrain Properties LLC",
      notes: "Primary letting agent for Al Seef Residences.",
    },
  });

  // ── Management agreement ────────────────────────────────────────────────────
  await prisma.managementAgreement.create({
    data: {
      propertyId: property.id,
      managementFeeRate: 8.5,
      vacancyFeeRate: 5.0,
      vacancyFeeThresholdMonths: 9,
      newLettingFeeRate: 50.0,
      leaseRenewalFeeFlat: 150,
      repairAuthorityLimit: 500,
      rentRemittanceDay: 5,
      mgmtFeeInvoiceDay: 7,
      landlordPaymentDays: 2,
      kpiStartDate: d("2026-01-01"),
      kpiOccupancyTarget: 90,
      kpiRentCollectionTarget: 92,
      kpiExpenseRatioTarget: 85,
      kpiDaysToLeaseTarget: 45,
      kpiRenewalRateTarget: 80,
      kpiMaintenanceCompletionTarget: 95,
      kpiEmergencyResponseHrs: 4,
      kpiStandardResponseHrs: 48,
    },
  });

  // ── Rent history ────────────────────────────────────────────────────────────
  await prisma.rentHistory.createMany({
    data: [
      // Prior-year rate for long-term tenants (showing annual escalation)
      { tenantId: tenants["101"].id, monthlyRent: 330, effectiveDate: d("2025-01-01"), reason: "Previous lease rate" },
      { tenantId: tenants["103"].id, monthlyRent: 480, effectiveDate: d("2025-01-01"), reason: "Previous lease rate" },
      { tenantId: tenants["205"].id, monthlyRent: 700, effectiveDate: d("2025-01-01"), reason: "Previous lease rate" },
      { tenantId: tenants["305"].id, monthlyRent: 700, effectiveDate: d("2025-01-01"), reason: "Previous lease rate" },
      { tenantId: tenants["401"].id, monthlyRent: 370, effectiveDate: d("2025-01-01"), reason: "Previous lease rate" },
      // Lease commencement / annual review records (all tenants, Jan 2026)
      ...tenantDefs.map((t) => ({
        tenantId: tenants[t.unit].id,
        monthlyRent: t.rent,
        effectiveDate: d("2026-01-01"),
        reason: "Lease commencement / annual review",
      })),
    ],
  });

  // ── Maintenance jobs ────────────────────────────────────────────────────────
  await prisma.maintenanceJob.createMany({
    data: [
      {
        propertyId: property.id,
        unitId: units["103"].id,
        title: "Bathroom tap replacement — unit 103",
        description: "Mixer tap dripping constantly. Tenant reported via WhatsApp.",
        category: MaintenanceCategory.PLUMBING,
        priority: MaintenancePriority.MEDIUM,
        status: MaintenanceStatus.DONE,
        reportedBy: "Mohammed Al-Mannai (unit 103)",
        assignedTo: "Gulf Maintenance Services",
        reportedDate: new Date(2026, 0, 10),
        scheduledDate: new Date(2026, 0, 12),
        completedDate: new Date(2026, 0, 12),
        cost: 120,
        vendorId: vendorMaint.id,
        notes: "Replaced mixer tap with Grohe unit. Tenant confirmed resolved.",
        isEmergency: false,
        submittedViaPortal: false,
      },
      {
        propertyId: property.id,
        title: "Lift — door sensor fault (floor 2)",
        description: "Lift door not closing properly on floor 2. Reported by multiple tenants.",
        category: MaintenanceCategory.OTHER,
        priority: MaintenancePriority.HIGH,
        status: MaintenanceStatus.DONE,
        reportedBy: "Multiple tenants",
        assignedTo: "ThyssenKrupp Elevator Bahrain",
        reportedDate: new Date(2026, 0, 18),
        scheduledDate: new Date(2026, 0, 20),
        completedDate: new Date(2026, 0, 21),
        cost: 340,
        notes: "Door sensor replaced. Full door cycle test completed. Back in service.",
        isEmergency: true,
        submittedViaPortal: false,
      },
      {
        propertyId: property.id,
        unitId: units["201"].id,
        title: "Kitchen circuit breaker tripping — unit 201",
        description: "Breaker trips after microwave use. Suspected undersized circuit.",
        category: MaintenanceCategory.ELECTRICAL,
        priority: MaintenancePriority.MEDIUM,
        status: MaintenanceStatus.DONE,
        reportedBy: "Fatima Al-Khalifa (unit 201)",
        assignedTo: "Al Baraka Electrical",
        reportedDate: new Date(2026, 1, 6),
        scheduledDate: new Date(2026, 1, 8),
        completedDate: new Date(2026, 1, 8),
        cost: 85,
        vendorId: vendorElec.id,
        notes: "Uprated circuit breaker installed. Fault confirmed resolved.",
        isEmergency: false,
        submittedViaPortal: false,
      },
      {
        propertyId: property.id,
        unitId: units["404"].id,
        title: "A/C compressor failure — master bedroom unit 404",
        description: "A/C compressor stopped working. No cooling in master bedroom.",
        category: MaintenanceCategory.APPLIANCE,
        priority: MaintenancePriority.HIGH,
        status: MaintenanceStatus.DONE,
        reportedBy: "Abdullah Al-Maktoum (unit 404)",
        assignedTo: "Gulf Maintenance Services",
        reportedDate: new Date(2026, 1, 13),
        scheduledDate: new Date(2026, 1, 15),
        completedDate: new Date(2026, 1, 16),
        cost: 310,
        vendorId: vendorMaint.id,
        notes: "Compressor replaced. Full system test passed.",
        isEmergency: false,
        submittedViaPortal: false,
      },
      {
        propertyId: property.id,
        title: "CCTV camera offline — car park north corner",
        description: "Camera 12 (north car park) offline since 28 Feb. Possible cable fault.",
        category: MaintenanceCategory.SECURITY,
        priority: MaintenancePriority.MEDIUM,
        status: MaintenanceStatus.IN_PROGRESS,
        reportedBy: "Security guard",
        assignedTo: "Techno Systems Bahrain",
        reportedDate: new Date(2026, 2, 1),
        scheduledDate: new Date(2026, 2, 10),
        notes: "Technician booked for 10 March. Cable run inspection required.",
        isEmergency: false,
        submittedViaPortal: false,
      },
      {
        propertyId: property.id,
        title: "Rooftop terrace — cracked floor tiles",
        description: "Section of tiles near water feature cracked and lifted. Trip hazard.",
        category: MaintenanceCategory.STRUCTURAL,
        priority: MaintenancePriority.LOW,
        status: MaintenanceStatus.OPEN,
        reportedBy: "Building manager",
        reportedDate: new Date(2026, 2, 15),
        notes: "Non-urgent. Area cordoned off. Quote requested from contractor.",
        isEmergency: false,
        submittedViaPortal: false,
      },
    ],
  });

  // Portal-submitted tenant maintenance requests
  await prisma.maintenanceJob.createMany({
    data: [
      {
        propertyId: property.id,
        unitId: units["102"].id,
        title: "Leaking shower head — unit 102",
        description: "Shower head dripping even when fully off. Getting worse.",
        category: MaintenanceCategory.PLUMBING,
        priority: MaintenancePriority.LOW,
        status: MaintenanceStatus.OPEN,
        reportedBy: "Noor Al-Rashid",
        reportedDate: new Date(2026, 2, 22),
        isEmergency: false,
        submittedViaPortal: true,
      },
      {
        propertyId: property.id,
        unitId: units["305"].id,
        title: "Bedroom light fixture flickering — unit 305",
        description: "Main bedroom ceiling light flickers intermittently. Suspected loose connection.",
        category: MaintenanceCategory.ELECTRICAL,
        priority: MaintenancePriority.MEDIUM,
        status: MaintenanceStatus.OPEN,
        reportedBy: "Sara Al-Zayed",
        reportedDate: new Date(2026, 3, 2),
        isEmergency: false,
        submittedViaPortal: true,
      },
      {
        propertyId: property.id,
        unitId: units["401"].id,
        title: "Balcony door lock stiff — unit 401",
        description: "Balcony sliding door lock is very stiff and hard to operate. Security concern.",
        category: MaintenanceCategory.OTHER,
        priority: MaintenancePriority.MEDIUM,
        status: MaintenanceStatus.OPEN,
        reportedBy: "Khalid Al-Dosari",
        reportedDate: new Date(2026, 3, 7),
        isEmergency: false,
        submittedViaPortal: true,
      },
    ],
  });

  // ── Link DONE maintenance jobs → their expense entries ─────────────────────
  {
    const asJobExpLinks = [
      { titleFragment: "Bathroom tap replacement", amount: 120 },
      { titleFragment: "Kitchen circuit breaker",  amount: 85  },
      { titleFragment: "A/C compressor failure",   amount: 310 },
    ];
    const asUnitIds = Object.values(units).map((u) => u.id);
    for (const link of asJobExpLinks) {
      const job = await prisma.maintenanceJob.findFirst({
        where: { propertyId: property.id, title: { contains: link.titleFragment } },
      });
      const exp = await prisma.expenseEntry.findFirst({
        where: { amount: link.amount, OR: [{ propertyId: property.id }, { unitId: { in: asUnitIds } }] },
      });
      if (job && exp) {
        await prisma.maintenanceJob.update({ where: { id: job.id }, data: { expenseId: exp.id } });
      }
    }
  }

  // ── Compliance certificates ─────────────────────────────────────────────────
  await prisma.complianceCertificate.createMany({
    data: [
      {
        propertyId: property.id,
        organizationId,
        certificateType: "Fire Safety Certificate",
        certificateNumber: "FSC-BH-2025-1142",
        issuedBy: "Bahrain Civil Defence Directorate",
        issueDate: d("2025-03-15"),
        expiryDate: d("2026-03-14"),
        notes: "Annual fire safety inspection passed. Extinguishers, alarms & evacuation routes compliant.",
      },
      {
        propertyId: property.id,
        organizationId,
        certificateType: "Lift Safety Certificate",
        certificateNumber: "LSC-BH-2025-0443",
        issuedBy: "Ministry of Works — Lift Inspectorate",
        issueDate: d("2025-09-01"),
        expiryDate: d("2026-08-31"),
        notes: "Annual statutory lift inspection. ThyssenKrupp lift certified safe for occupancy.",
      },
      {
        propertyId: property.id,
        organizationId,
        certificateType: "Building Completion Certificate",
        certificateNumber: "BCC-MAN-2020-0078",
        issuedBy: "Bahrain Survey & Land Registration Bureau",
        issueDate: d("2020-10-01"),
        notes: "Original completion certificate. No expiry date.",
      },
    ],
  });

  // ── Building condition report ───────────────────────────────────────────────
  await prisma.buildingConditionReport.create({
    data: {
      propertyId: property.id,
      reportDate: d("2026-03-01"),
      inspector: "Khalid Al-Saffar, RICS Registered Inspector",
      overallCondition: "Good",
      summary:
        "Al Seef Residences is in good overall condition. Building structure, common areas, and mechanical systems are well-maintained. Minor cosmetic work recommended on the car park floor. CCTV camera fault currently being addressed.",
      nextReviewDate: d("2026-09-01"),
      items: [
        { area: "Roof & Rooftop Terrace",   condition: "Good",      notes: "No water ingress. Cracked tiles flagged for repair." },
        { area: "Exterior Facade",          condition: "Good",      notes: "Clean finish. No spalling or efflorescence observed." },
        { area: "Common Areas & Corridors", condition: "Very Good", notes: "Recently repainted. Clean and well-lit." },
        { area: "Lobby & Reception",        condition: "Very Good", notes: "Well presented. Access control functioning." },
        { area: "Lift & Mechanical Room",   condition: "Good",      notes: "Lift serviced Jan 2026. Certificate current to Aug 2026." },
        { area: "Car Park",                 condition: "Fair",      notes: "Oil stains on floor. Recommend pressure wash and reseal." },
        { area: "Plumbing Infrastructure",  condition: "Good",      notes: "Pump serviced. No active leaks in risers or plant room." },
        { area: "Electrical Systems",       condition: "Good",      notes: "DB boards inspected. Generator load-tested monthly." },
        { area: "Security & CCTV",          condition: "Fair",      notes: "Camera 12 offline — repair booked for 10 March 2026." },
        { area: "Fire Safety Systems",      condition: "Good",      notes: "Certificate valid to March 2026. Renewal due." },
      ],
    },
  });

  // ── Owner invoices (management fee — Jan–Mar 2026) ──────────────────────────
  for (const { month, paid } of [
    { month: 1, paid: true  },
    { month: 2, paid: true  },
    { month: 3, paid: false },
  ]) {
    await prisma.ownerInvoice.create({
      data: {
        invoiceNumber: `OWN-ASR-${propCode}-2026-${String(month).padStart(2, "0")}-MGMT`,
        propertyId: property.id,
        type: OwnerInvoiceType.MANAGEMENT_FEE,
        periodYear: YEAR,
        periodMonth: month,
        lineItems: [
          { description: "Management fee — 8 one-bedroom units",   units: 8, unitRate: 50,  amount: 400  },
          { description: "Management fee — 9 two-bedroom units",   units: 9, unitRate: 75,  amount: 675  },
          { description: "Management fee — 3 three-bedroom units", units: 3, unitRate: 100, amount: 300  },
        ],
        totalAmount: 1375,
        dueDate: new Date(YEAR, month - 1, 10),
        status: paid ? InvoiceStatus.PAID : InvoiceStatus.SENT,
        paidAt: paid ? new Date(YEAR, month - 1, 12) : null,
        paidAmount: paid ? 1375 : null,
        notes: `Monthly property management fee — ${new Date(YEAR, month - 1).toLocaleString("en-GB", { month: "long", year: "numeric" })}`,
      },
    });
  }

  // ── Asset maintenance logs ──────────────────────────────────────────────────
  const asrAssets = await prisma.asset.findMany({
    where: { propertyId: property.id },
    select: { id: true, name: true },
  });
  const asrAssetMap = Object.fromEntries(asrAssets.map((a) => [a.name, a.id]));

  await prisma.assetMaintenanceLog.createMany({
    data: [
      {
        assetId: asrAssetMap["Cummins Standby Generator"],
        date: d("2026-01-10"),
        description: "Monthly service check — oil level, coolant, battery voltage, 30-min load test",
        cost: 65,
        technician: "Ahmed Khalil, Cummins Bahrain",
        vendorId: vendorMaint.id,
        notes: "All systems nominal. Next service due 10 Feb 2026.",
      },
      {
        assetId: asrAssetMap["Cummins Standby Generator"],
        date: d("2026-02-10"),
        description: "Monthly service check — routine inspection and load test passed",
        cost: 65,
        technician: "Ahmed Khalil, Cummins Bahrain",
        vendorId: vendorMaint.id,
        notes: "No faults found. Next service due 10 Mar 2026.",
      },
      {
        assetId: asrAssetMap["ThyssenKrupp Passenger Lift"],
        date: d("2026-01-21"),
        description: "Unscheduled repair — door sensor replacement, floor 2",
        cost: 340,
        technician: "ThyssenKrupp service technician",
        notes: "Door sensor faulty — replaced. Full door cycle test completed. Back in service.",
      },
      {
        assetId: asrAssetMap["Grundfos Water Pump"],
        date: d("2026-02-14"),
        description: "Biannual inspection — pressure test, seals check, flow rate measurement",
        cost: 110,
        technician: "Aqua Systems Bahrain technician",
        notes: "Pump within spec. Pressure seal showing minor wear — flagged for next service.",
      },
    ],
  });

  // ── Arrears escalations ─────────────────────────────────────────────────────
  const asrArrearsCases = await prisma.arrearsCase.findMany({
    where: { propertyId: property.id },
    select: { id: true, tenantId: true },
  });
  const asrCaseByTenant = Object.fromEntries(asrArrearsCases.map((c) => [c.tenantId, c.id]));

  await prisma.arrearsEscalation.createMany({
    data: [
      // Priya Sharma (unit 102) — 2 months overdue
      {
        caseId: asrCaseByTenant[tenants["102"].id],
        stage: ArrearsStage.INFORMAL_REMINDER,
        notes: "WhatsApp reminder sent 3 Feb 2026. Tenant acknowledged but did not pay.",
        createdAt: d("2026-02-03"),
      },
      {
        caseId: asrCaseByTenant[tenants["102"].id],
        stage: ArrearsStage.INFORMAL_REMINDER,
        notes: "Follow-up call 15 Feb 2026. Tenant promised to pay by month-end. March also missed.",
        createdAt: d("2026-02-15"),
      },
      {
        caseId: asrCaseByTenant[tenants["102"].id],
        stage: ArrearsStage.DEMAND_LETTER,
        notes: "Formal demand letter issued 18 Mar 2026 via registered post. 7-day payment window given.",
        createdAt: d("2026-03-18"),
      },
      // Deepak & Meera Pillai (unit 304) — March rent outstanding
      {
        caseId: asrCaseByTenant[tenants["304"].id],
        stage: ArrearsStage.INFORMAL_REMINDER,
        notes: "SMS reminder sent 10 Mar 2026. Tenant has given notice — chase payment before lease-end.",
        createdAt: d("2026-03-10"),
      },
    ],
  });

  // ── Tax configurations ──────────────────────────────────────────────────────
  // Bahrain introduced 10% VAT in January 2022 (Value Added Tax Act)
  await prisma.taxConfiguration.createMany({
    data: [
      {
        orgId: organizationId,
        propertyId: property.id,
        label: "VAT — Management & Letting Fees",
        rate: 0.10,
        type: TaxType.ADDITIVE,
        appliesTo: ["MANAGEMENT_FEE_INCOME", "LETTING_FEE_INCOME"],
        isInclusive: false,
        effectiveFrom: d("2022-01-01"),
        isActive: true,
      },
      {
        orgId: organizationId,
        propertyId: property.id,
        label: "VAT — Contractor & Vendor Invoices",
        rate: 0.10,
        type: TaxType.ADDITIVE,
        appliesTo: ["CONTRACTOR_LABOUR", "CONTRACTOR_MATERIALS", "VENDOR_INVOICE"],
        isInclusive: true,
        effectiveFrom: d("2022-01-01"),
        isActive: true,
      },
    ],
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

  // ── Vendors ─────────────────────────────────────────────────────────────────
  const [
    shVendorMgmt,
    shVendorWater,
    shVendorEskom,
    shVendorClean,
    shVendorFibre,
    shVendorMaint,
    shVendorSparks,
    shVendorAgrico,
    shVendorADT,
    shVendorOtis,
    shVendorG4S,
  ] = await Promise.all([
    prisma.vendor.create({ data: { name: "Sandton Property Management", category: VendorCategory.SERVICE_PROVIDER, phone: "+27 11 784 0200", email: "accounts@sandtonpm.co.za", organizationId, isActive: true, notes: "Full-service property management company for Sandton Heights." } }),
    prisma.vendor.create({ data: { name: "City of Johannesburg", category: VendorCategory.UTILITY_PROVIDER, phone: "+27 11 375 5555", email: "billing@joburg.org.za", organizationId, isActive: true, notes: "Municipal water & sewerage billing." } }),
    prisma.vendor.create({ data: { name: "Eskom", category: VendorCategory.UTILITY_PROVIDER, phone: "+27 11 800 8111", email: "customercare@eskom.co.za", organizationId, isActive: true, notes: "Electricity supply — common areas & security systems." } }),
    prisma.vendor.create({ data: { name: "Green Clean Services", category: VendorCategory.SERVICE_PROVIDER, phone: "+27 11 402 5500", email: "admin@greenclean.co.za", organizationId, isActive: true, notes: "Daily common area cleaning & scheduled deep-clean services." } }),
    prisma.vendor.create({ data: { name: "Vox Fibre", category: VendorCategory.SERVICE_PROVIDER, phone: "+27 87 805 0000", email: "billing@vox.co.za", organizationId, isActive: true, notes: "Building fibre internet infrastructure — 100 Mbps shared." } }),
    prisma.vendor.create({ data: { name: "BuildFix SA", category: VendorCategory.CONTRACTOR, phone: "+27 11 402 3300", email: "info@buildfixsa.co.za", organizationId, isActive: true, notes: "General building maintenance contractor — plumbing, tiling, carpentry." } }),
    prisma.vendor.create({ data: { name: "Sparks Electrical", category: VendorCategory.CONTRACTOR, phone: "+27 11 402 4400", email: "ops@sparkselectrical.co.za", organizationId, isActive: true, notes: "Licensed electrical contractor — fault finding, COC testing & DB upgrades." } }),
    prisma.vendor.create({ data: { name: "Agrico Equipment", category: VendorCategory.SERVICE_PROVIDER, phone: "+27 11 966 0010", email: "service@agrico.co.za", organizationId, isActive: true, notes: "Generator service & maintenance specialist." } }),
    prisma.vendor.create({ data: { name: "ADT Security", category: VendorCategory.SERVICE_PROVIDER, phone: "+27 11 418 1111", email: "commercial@adt.co.za", organizationId, isActive: true, notes: "Security monitoring, CCTV, and access control maintenance." } }),
    prisma.vendor.create({ data: { name: "Otis Elevator SA", category: VendorCategory.SERVICE_PROVIDER, phone: "+27 11 490 6000", email: "service@otis.co.za", organizationId, isActive: true, notes: "Lift servicing & statutory inspections." } }),
    prisma.vendor.create({ data: { name: "G4S South Africa", category: VendorCategory.SERVICE_PROVIDER, phone: "+27 11 301 8500", email: "info@g4s.co.za", organizationId, isActive: true, notes: "Armed response & on-site security patrol services." } }),
  ]);

  // ── Income & invoices ───────────────────────────────────────────────────────
  const MONTHS = [0, 1, 2, 3]; // Jan, Feb, Mar, Apr 2026
  const YEAR = 2026;
  // Arrears: unit 102 misses Feb + Mar + Apr; unit 302 misses Mar + Apr
  const arrears: Record<string, number[]> = { "102": [1, 2, 3], "302": [2, 3] };
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

  // ── Property-level monthly expenses (batched) ────────────────────────────────
  const monthlyPropExpensesDefs = [
    { category: ExpenseCategory.MANAGEMENT_FEE, amount: 7200, desc: "Monthly management fee — Sandton Property Management", vendorId: shVendorMgmt.id },
    { category: ExpenseCategory.WATER,          amount: 2400, desc: "City of Johannesburg — water & sewerage",              vendorId: shVendorWater.id },
    { category: ExpenseCategory.ELECTRICITY,    amount: 3800, desc: "Eskom — common areas & security lighting",             vendorId: shVendorEskom.id },
    { category: ExpenseCategory.CLEANER,        amount: 5500, desc: "Cleaning staff — 2 cleaners (common areas & grounds)", vendorId: shVendorClean.id },
    { category: ExpenseCategory.WIFI,           amount: 1200, desc: "Vox Fibre — building internet infrastructure",         vendorId: shVendorFibre.id },
  ];

  await prisma.expenseEntry.createMany({
    data: MONTHS.flatMap((month) =>
      monthlyPropExpensesDefs.map((e) => ({
        date: monthStart(YEAR, month),
        propertyId: property.id,
        scope: ExpenseScope.PROPERTY,
        category: e.category,
        amount: e.amount,
        description: e.desc,
        isSunkCost: false,
        paidFromPettyCash: false,
        vendorId: e.vendorId,
      }))
    ),
  });

  // ── Unit-level ad-hoc expenses (batched) ─────────────────────────────────────
  await prisma.expenseEntry.createMany({
    data: [
      {
        date: monthStart(YEAR, 0),
        unitId: units["103"].id,
        scope: ExpenseScope.UNIT,
        category: ExpenseCategory.MAINTENANCE,
        amount: 1800,
        description: "Geyser replacement — hot water cylinder unit 103",
        isSunkCost: false,
        paidFromPettyCash: false,
        vendorId: shVendorMaint.id,
      },
      {
        date: monthStart(YEAR, 1),
        unitId: units["201"].id,
        scope: ExpenseScope.UNIT,
        category: ExpenseCategory.MAINTENANCE,
        amount: 950,
        description: "Electrical fault — DB board trip, unit 201",
        isSunkCost: false,
        paidFromPettyCash: false,
        vendorId: shVendorSparks.id,
      },
      {
        date: monthStart(YEAR, 1),
        unitId: units["203"].id,
        scope: ExpenseScope.UNIT,
        category: ExpenseCategory.MAINTENANCE,
        amount: 4200,
        description: "Air conditioning compressor — master bedroom unit 203",
        isSunkCost: true,
        paidFromPettyCash: false,
        vendorId: shVendorMaint.id,
      },
      {
        date: monthStart(YEAR, 2),
        unitId: units["302"].id,
        scope: ExpenseScope.UNIT,
        category: ExpenseCategory.REINSTATEMENT,
        amount: 3500,
        description: "Deep clean & touch-up painting — notice unit 302",
        isSunkCost: true,
        paidFromPettyCash: false,
        vendorId: shVendorClean.id,
      },
      {
        date: monthStart(YEAR, 3),
        propertyId: property.id,
        scope: ExpenseScope.PROPERTY,
        category: ExpenseCategory.MAINTENANCE,
        amount: 8500,
        description: "Security gate motor replacement — basement entry",
        isSunkCost: false,
        paidFromPettyCash: false,
        vendorId: shVendorADT.id,
      },
    ],
  });

  // ── Expense line items ────────────────────────────────────────────────────────
  // Fetch the created entries so we can attach line items by description match
  const createdExpenses = await prisma.expenseEntry.findMany({
    where: { propertyId: property.id },
    select: { id: true, description: true, category: true, amount: true },
  });
  // Also fetch unit-level expenses for this property's units
  const createdUnitExpenses = await prisma.expenseEntry.findMany({
    where: { unitId: { in: Object.values(units).map((u) => u.id) } },
    select: { id: true, description: true, category: true, amount: true },
  });
  const allCreatedExpenses = [...createdExpenses, ...createdUnitExpenses];

  function findExpenseId(descFragment: string): string | null {
    return allCreatedExpenses.find((e) => e.description?.includes(descFragment))?.id ?? null;
  }

  const lineItemRows: {
    expenseId: string;
    category: LineItemCategory;
    description: string;
    amount: number;
    isVatable: boolean;
    paymentStatus: LineItemPaymentStatus;
    amountPaid: number;
  }[] = [];

  // Collect line items for each expense type (using first-month entry as template —
  // all months share the same line item breakdown)
  const mgmtIds    = allCreatedExpenses.filter((e) => e.category === ExpenseCategory.MANAGEMENT_FEE);
  const waterIds   = allCreatedExpenses.filter((e) => e.category === ExpenseCategory.WATER && e.description?.includes("Johannesburg"));
  const eskomIds   = allCreatedExpenses.filter((e) => e.category === ExpenseCategory.ELECTRICITY);
  const cleanIds   = allCreatedExpenses.filter((e) => e.category === ExpenseCategory.CLEANER && e.description?.includes("Cleaning staff"));
  const wifiIds    = allCreatedExpenses.filter((e) => e.category === ExpenseCategory.WIFI);

  for (const e of mgmtIds) {
    lineItemRows.push(
      { expenseId: e.id, category: LineItemCategory.LABOUR,  description: "Management fee (excl. VAT)", amount: 6261, isVatable: true,  paymentStatus: LineItemPaymentStatus.PAID, amountPaid: 6261 },
      { expenseId: e.id, category: LineItemCategory.QUOTE,   description: "VAT @ 15%",                  amount: 939,  isVatable: false, paymentStatus: LineItemPaymentStatus.PAID, amountPaid: 939  },
    );
  }
  for (const e of waterIds) {
    lineItemRows.push(
      { expenseId: e.id, category: LineItemCategory.MATERIAL, description: "Water consumption", amount: 1680, isVatable: false, paymentStatus: LineItemPaymentStatus.PAID, amountPaid: 1680 },
      { expenseId: e.id, category: LineItemCategory.MATERIAL, description: "Sewerage levy",     amount: 720,  isVatable: false, paymentStatus: LineItemPaymentStatus.PAID, amountPaid: 720  },
    );
  }
  for (const e of eskomIds) {
    lineItemRows.push(
      { expenseId: e.id, category: LineItemCategory.MATERIAL, description: "Electricity consumption (incl. VAT)", amount: 3200, isVatable: true, paymentStatus: LineItemPaymentStatus.PAID, amountPaid: 3200 },
      { expenseId: e.id, category: LineItemCategory.MATERIAL, description: "Network access charge (incl. VAT)",   amount: 600,  isVatable: true, paymentStatus: LineItemPaymentStatus.PAID, amountPaid: 600  },
    );
  }
  for (const e of cleanIds) {
    lineItemRows.push(
      { expenseId: e.id, category: LineItemCategory.LABOUR,   description: "Cleaning staff wages (2 cleaners)", amount: 4800, isVatable: false, paymentStatus: LineItemPaymentStatus.PAID, amountPaid: 4800 },
      { expenseId: e.id, category: LineItemCategory.MATERIAL, description: "Cleaning materials & detergents",   amount: 700,  isVatable: false, paymentStatus: LineItemPaymentStatus.PAID, amountPaid: 700  },
    );
  }
  for (const e of wifiIds) {
    lineItemRows.push(
      { expenseId: e.id, category: LineItemCategory.MATERIAL, description: "Fibre subscription (excl. VAT)", amount: 1043, isVatable: true,  paymentStatus: LineItemPaymentStatus.PAID, amountPaid: 1043 },
      { expenseId: e.id, category: LineItemCategory.QUOTE,    description: "VAT @ 15%",                      amount: 157,  isVatable: false, paymentStatus: LineItemPaymentStatus.PAID, amountPaid: 157  },
    );
  }

  // Ad-hoc unit expenses
  const geyserExp = findExpenseId("Geyser replacement");
  const dbBoardExp = findExpenseId("DB board trip");
  const acExp = findExpenseId("Air conditioning compressor");
  const deepCleanExp = findExpenseId("Deep clean & touch-up");
  const gateMotorExp = findExpenseId("gate motor replacement");

  if (geyserExp) lineItemRows.push(
    { expenseId: geyserExp, category: LineItemCategory.LABOUR,   description: "Installation labour",              amount: 1200, isVatable: true, paymentStatus: LineItemPaymentStatus.PAID, amountPaid: 1200 },
    { expenseId: geyserExp, category: LineItemCategory.MATERIAL, description: "150L geyser element & thermostat", amount: 600,  isVatable: true, paymentStatus: LineItemPaymentStatus.PAID, amountPaid: 600  },
  );
  if (dbBoardExp) lineItemRows.push(
    { expenseId: dbBoardExp, category: LineItemCategory.LABOUR,   description: "Fault-finding & repair labour", amount: 700, isVatable: true, paymentStatus: LineItemPaymentStatus.PAID, amountPaid: 700 },
    { expenseId: dbBoardExp, category: LineItemCategory.MATERIAL, description: "Surge protector replacement",   amount: 250, isVatable: true, paymentStatus: LineItemPaymentStatus.PAID, amountPaid: 250 },
  );
  if (acExp) lineItemRows.push(
    { expenseId: acExp, category: LineItemCategory.LABOUR,   description: "Installation & re-gas labour", amount: 1200, isVatable: true, paymentStatus: LineItemPaymentStatus.PAID, amountPaid: 1200 },
    { expenseId: acExp, category: LineItemCategory.MATERIAL, description: "Compressor unit (incl. VAT)",  amount: 3000, isVatable: true, paymentStatus: LineItemPaymentStatus.PAID, amountPaid: 3000 },
  );
  if (deepCleanExp) lineItemRows.push(
    { expenseId: deepCleanExp, category: LineItemCategory.LABOUR,   description: "Deep clean labour",             amount: 2500, isVatable: false, paymentStatus: LineItemPaymentStatus.PAID, amountPaid: 2500 },
    { expenseId: deepCleanExp, category: LineItemCategory.MATERIAL, description: "Painting materials & sundries", amount: 1000, isVatable: false, paymentStatus: LineItemPaymentStatus.PAID, amountPaid: 1000 },
  );
  if (gateMotorExp) lineItemRows.push(
    { expenseId: gateMotorExp, category: LineItemCategory.LABOUR,   description: "Motor installation & commissioning", amount: 2500, isVatable: true, paymentStatus: LineItemPaymentStatus.PAID, amountPaid: 2500 },
    { expenseId: gateMotorExp, category: LineItemCategory.MATERIAL, description: "Gate motor unit & hardware",         amount: 6000, isVatable: true, paymentStatus: LineItemPaymentStatus.PAID, amountPaid: 6000 },
  );

  if (lineItemRows.length > 0) {
    await prisma.expenseLineItem.createMany({ data: lineItemRows });
  }

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
        { month: 3, day: 3,  amount: 430, desc: "Fire extinguisher service & recharge — annual inspection" },
        { month: 3, day: 11, amount: 275, desc: "Paint & filler — touch-ups corridor floor 2"              },
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
      schedule: { taskName: "Monthly Generator Service Check", frequency: MaintenanceFrequency.MONTHLY, nextDue: d("2026-04-15"), estimatedCost: 2800 },
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
      schedule: { taskName: "Quarterly Lift Servicing", frequency: MaintenanceFrequency.QUARTERLY, nextDue: d("2026-04-01"), estimatedCost: 3200 },
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
      schedule: { taskName: "Biannual Pump Inspection", frequency: MaintenanceFrequency.BIANNUALLY, nextDue: d("2026-06-10"), estimatedCost: 1400 },
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
      schedule: { taskName: "Annual CCTV Review & Maintenance", frequency: MaintenanceFrequency.ANNUALLY, nextDue: d("2026-09-12"), estimatedCost: 2800 },
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
        propertyId: property.id,
        taskName: a.schedule.taskName,
        frequency: a.schedule.frequency,
        nextDue: a.schedule.nextDue,
        isActive: true,
        estimatedCost: a.schedule.estimatedCost,
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
        nextDueDate: d("2026-05-01"),
        isActive: true,
        vendorId: shVendorG4S.id,
      },
      {
        description: "Landscaping & Garden Maintenance — Grounds",
        category: ExpenseCategory.CLEANER,
        amount: 1500,
        scope: ExpenseScope.PROPERTY,
        propertyId: property.id,
        frequency: RecurringFrequency.MONTHLY,
        nextDueDate: d("2026-05-01"),
        isActive: true,
        vendorId: shVendorClean.id,
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
        vendorId: shVendorAgrico.id,
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
        vendorId: shVendorOtis.id,
      },
    ],
  });

  // ── Link asset maintenance schedules → recurring expenses ──────────────────
  {
    const shSchedLinks = [
      { taskFragment: "Generator", descFragment: "Generator" },
      { taskFragment: "Lift",      descFragment: "Lift" },
      { taskFragment: "Pump",      descFragment: "Pump" },
      { taskFragment: "CCTV",      descFragment: "CCTV" },
    ];
    const [shSchedRows, shRecurRows] = await Promise.all([
      prisma.assetMaintenanceSchedule.findMany({ where: { propertyId: property.id }, select: { id: true, taskName: true } }),
      prisma.recurringExpense.findMany({ where: { propertyId: property.id }, select: { id: true, description: true } }),
    ]);
    for (const link of shSchedLinks) {
      const sched = shSchedRows.find((s) => s.taskName.includes(link.taskFragment));
      const recur = shRecurRows.find((r) => r.description.includes(link.descFragment));
      if (sched && recur) {
        await prisma.assetMaintenanceSchedule.update({ where: { id: sched.id }, data: { recurringExpenseId: recur.id } });
      }
    }
  }

  // ── Arrears cases ───────────────────────────────────────────────────────────
  // Unit 102: 3 months overdue (Feb + Mar + Apr) = R9,000 × 3 = R27,000
  await prisma.arrearsCase.create({
    data: {
      tenantId: tenants["102"].id,
      propertyId: property.id,
      stage: ArrearsStage.DEMAND_LETTER,
      amountOwed: 27000,
      notes:
        "Tenant has not paid rent for February, March and April 2026 (R9,000 × 3 months). Section 4 notice issued March 2026. Court proceedings under review if no settlement by 30 April.",
    },
  });

  // Unit 302: 2 months overdue (Mar + Apr) = R15,150 × 2 = R30,300
  await prisma.arrearsCase.create({
    data: {
      tenantId: tenants["302"].id,
      propertyId: property.id,
      stage: ArrearsStage.INFORMAL_REMINDER,
      amountOwed: 30300,
      notes:
        "March and April 2026 rent outstanding (R14,500 + R650 service charge = R15,150 × 2). Tenant unresponsive. Escalation to formal demand under review.",
    },
  });

  // ── Agent ────────────────────────────────────────────────────────────────────
  await prisma.agent.create({
    data: {
      organizationId,
      name: "Seeff Properties Sandton",
      phone: "+27 11 784 8870",
      email: "sandton@seeff.com",
      agency: "Seeff Properties",
      notes: "Primary letting agent for Sandton Heights. Commission rate per agreement.",
    },
  });

  // ── Management agreement ────────────────────────────────────────────────────
  await prisma.managementAgreement.create({
    data: {
      propertyId: property.id,
      managementFeeRate: 10.0,
      vacancyFeeRate: 5.0,
      vacancyFeeThresholdMonths: 9,
      newLettingFeeRate: 100.0,
      leaseRenewalFeeFlat: 3500,
      repairAuthorityLimit: 10000,
      rentRemittanceDay: 3,
      mgmtFeeInvoiceDay: 5,
      landlordPaymentDays: 3,
      kpiStartDate: d("2026-01-01"),
      kpiOccupancyTarget: 90,
      kpiRentCollectionTarget: 92,
      kpiExpenseRatioTarget: 85,
      kpiDaysToLeaseTarget: 30,
      kpiRenewalRateTarget: 80,
      kpiMaintenanceCompletionTarget: 95,
      kpiEmergencyResponseHrs: 4,
      kpiStandardResponseHrs: 48,
    },
  });

  // ── Rent history ────────────────────────────────────────────────────────────
  await prisma.rentHistory.createMany({
    data: [
      // Prior-year rate for long-term tenants (showing annual escalation)
      { tenantId: tenants["101"].id, monthlyRent: 7800,  effectiveDate: d("2025-01-01"), reason: "Previous lease rate" },
      { tenantId: tenants["103"].id, monthlyRent: 12500, effectiveDate: d("2025-01-01"), reason: "Previous lease rate" },
      { tenantId: tenants["203"].id, monthlyRent: 18000, effectiveDate: d("2025-01-01"), reason: "Previous lease rate" },
      { tenantId: tenants["303"].id, monthlyRent: 18500, effectiveDate: d("2025-01-01"), reason: "Previous lease rate" },
      // Lease commencement / annual review records (all tenants, Jan 2026)
      ...tenantDefs.map((t) => ({
        tenantId: tenants[t.unit].id,
        monthlyRent: t.rent,
        effectiveDate: d("2026-01-01"),
        reason: "Lease commencement / annual review",
      })),
    ],
  });

  // ── Maintenance jobs ────────────────────────────────────────────────────────
  await prisma.maintenanceJob.createMany({
    data: [
      {
        propertyId: property.id,
        unitId: units["103"].id,
        title: "Geyser element failure — unit 103",
        description: "No hot water in unit 103. Geyser element failed overnight.",
        category: MaintenanceCategory.PLUMBING,
        priority: MaintenancePriority.HIGH,
        status: MaintenanceStatus.DONE,
        reportedBy: "Thabo Mokoena (unit 103)",
        assignedTo: "BuildFix SA",
        reportedDate: new Date(2026, 0, 8),
        scheduledDate: new Date(2026, 0, 9),
        completedDate: new Date(2026, 0, 9),
        cost: 1800,
        vendorId: shVendorMaint.id,
        notes: "150L geyser element and thermostat replaced. Tested and functioning.",
        isEmergency: true,
        submittedViaPortal: false,
      },
      {
        propertyId: property.id,
        title: "Generator — fuel system service post load-shedding",
        description: "Generator ran for extended periods during Stage 6 load-shedding. Full service required.",
        category: MaintenanceCategory.OTHER,
        priority: MaintenancePriority.HIGH,
        status: MaintenanceStatus.DONE,
        reportedBy: "Building manager",
        assignedTo: "Agrico Equipment",
        reportedDate: new Date(2026, 0, 20),
        scheduledDate: new Date(2026, 0, 22),
        completedDate: new Date(2026, 0, 23),
        cost: 2400,
        vendorId: shVendorAgrico.id,
        notes: "Oil changed, filters replaced, fuel injectors cleaned. Generator back to full spec.",
        isEmergency: false,
        submittedViaPortal: false,
      },
      {
        propertyId: property.id,
        unitId: units["201"].id,
        title: "DB board trip — intermittent fault unit 201",
        description: "Main DB board tripping after power restoration from load-shedding.",
        category: MaintenanceCategory.ELECTRICAL,
        priority: MaintenancePriority.MEDIUM,
        status: MaintenanceStatus.DONE,
        reportedBy: "Johan van der Merwe (unit 201)",
        assignedTo: "Sparks Electrical",
        reportedDate: new Date(2026, 1, 7),
        scheduledDate: new Date(2026, 1, 9),
        completedDate: new Date(2026, 1, 9),
        cost: 950,
        vendorId: shVendorSparks.id,
        notes: "Surge protector failed — replaced. DB board tested. COC issued.",
        isEmergency: false,
        submittedViaPortal: false,
      },
      {
        propertyId: property.id,
        unitId: units["203"].id,
        title: "Air conditioning compressor failure — master bedroom unit 203",
        description: "Split A/C unit in master bedroom not cooling. Compressor failure confirmed.",
        category: MaintenanceCategory.APPLIANCE,
        priority: MaintenancePriority.HIGH,
        status: MaintenanceStatus.DONE,
        reportedBy: "Lungelo Khumalo (unit 203)",
        assignedTo: "BuildFix SA",
        reportedDate: new Date(2026, 1, 14),
        scheduledDate: new Date(2026, 1, 16),
        completedDate: new Date(2026, 1, 17),
        cost: 4200,
        vendorId: shVendorMaint.id,
        notes: "Compressor replaced. Full re-gas and system test completed.",
        isEmergency: false,
        submittedViaPortal: false,
      },
      {
        propertyId: property.id,
        title: "Security gate motor fault — basement entry",
        description: "Automated gate to basement parking not opening. Motor fault diagnosed and replaced.",
        category: MaintenanceCategory.SECURITY,
        priority: MaintenancePriority.MEDIUM,
        status: MaintenanceStatus.DONE,
        reportedBy: "Multiple tenants",
        assignedTo: "ADT Security",
        reportedDate: new Date(2026, 2, 5),
        scheduledDate: new Date(2026, 2, 12),
        completedDate: new Date(2026, 3, 2),
        cost: 8500,
        vendorId: shVendorADT.id,
        notes: "Gate motor and control board replaced. Tested and commissioned 2 April 2026.",
        isEmergency: false,
        submittedViaPortal: false,
      },
      {
        propertyId: property.id,
        title: "Drain blockage — ground floor common bathroom",
        description: "Drain in ground floor staff bathroom blocking repeatedly.",
        category: MaintenanceCategory.PLUMBING,
        priority: MaintenancePriority.LOW,
        status: MaintenanceStatus.OPEN,
        reportedBy: "Cleaning staff",
        reportedDate: new Date(2026, 2, 18),
        notes: "Non-urgent. Quoted for hydro-jetting of drain. Awaiting approval.",
        isEmergency: false,
        submittedViaPortal: false,
      },
    ],
  });

  // Portal-submitted tenant maintenance requests
  await prisma.maintenanceJob.createMany({
    data: [
      {
        propertyId: property.id,
        unitId: units["101"].id,
        title: "Blocked kitchen drain — unit 101",
        description: "Kitchen sink draining slowly — possible grease blockage.",
        category: MaintenanceCategory.PLUMBING,
        priority: MaintenancePriority.LOW,
        status: MaintenanceStatus.OPEN,
        reportedBy: "Sipho Dlamini",
        reportedDate: new Date(2026, 2, 20),
        isEmergency: false,
        submittedViaPortal: true,
      },
      {
        propertyId: property.id,
        unitId: units["202"].id,
        title: "Intercom handset dead — unit 202",
        description: "Lobby intercom handset not responding — cannot buzz visitors in.",
        category: MaintenanceCategory.ELECTRICAL,
        priority: MaintenancePriority.MEDIUM,
        status: MaintenanceStatus.OPEN,
        reportedBy: "Ayesha Patel",
        reportedDate: new Date(2026, 3, 3),
        isEmergency: false,
        submittedViaPortal: true,
      },
      {
        propertyId: property.id,
        unitId: units["303"].id,
        title: "Bedroom ceiling fan noise — unit 303",
        description: "Ceiling fan vibrating loudly. Gets worse at high speed.",
        category: MaintenanceCategory.APPLIANCE,
        priority: MaintenancePriority.LOW,
        status: MaintenanceStatus.OPEN,
        reportedBy: "Michael & Sarah Pretorius",
        reportedDate: new Date(2026, 3, 8),
        isEmergency: false,
        submittedViaPortal: true,
      },
    ],
  });

  // ── Link DONE maintenance jobs → their expense entries ─────────────────────
  {
    const shJobExpLinks = [
      { titleFragment: "Geyser element failure",             amount: 1800 },
      { titleFragment: "DB board trip",                      amount: 950  },
      { titleFragment: "Air conditioning compressor failure", amount: 4200 },
      { titleFragment: "Deep clean & touch-up",              amount: 3500 },
      { titleFragment: "gate motor fault",                   amount: 8500 },
    ];
    const shUnitIds = Object.values(units).map((u) => u.id);
    for (const link of shJobExpLinks) {
      const job = await prisma.maintenanceJob.findFirst({
        where: { propertyId: property.id, title: { contains: link.titleFragment } },
      });
      const exp = await prisma.expenseEntry.findFirst({
        where: { amount: link.amount, OR: [{ propertyId: property.id }, { unitId: { in: shUnitIds } }] },
      });
      if (job && exp) {
        await prisma.maintenanceJob.update({ where: { id: job.id }, data: { expenseId: exp.id } });
      }
    }
  }

  // ── Compliance certificates ─────────────────────────────────────────────────
  await prisma.complianceCertificate.createMany({
    data: [
      {
        propertyId: property.id,
        organizationId,
        certificateType: "Certificate of Compliance (COC) — Electrical",
        certificateNumber: "COC-GP-2025-44821",
        issuedBy: "Sparks Electrical — Registered Wireman",
        issueDate: d("2025-06-01"),
        expiryDate: d("2027-05-31"),
        notes: "Full electrical installation compliance certificate. Valid for 2 years.",
      },
      {
        propertyId: property.id,
        organizationId,
        certificateType: "Fire Safety Certificate",
        certificateNumber: "FSC-GP-2025-0932",
        issuedBy: "Johannesburg Fire & Rescue Services",
        issueDate: d("2025-02-15"),
        expiryDate: d("2026-02-14"),
        notes: "Annual fire safety inspection passed. Extinguishers, hose reels & detectors compliant.",
      },
      {
        propertyId: property.id,
        organizationId,
        certificateType: "Occupation Certificate",
        certificateNumber: "OC-JHB-2020-1154",
        issuedBy: "City of Johannesburg — Building Development Management",
        issueDate: d("2020-11-15"),
        notes: "Original occupation certificate issued on completion. No expiry.",
      },
    ],
  });

  // ── Building condition report ───────────────────────────────────────────────
  await prisma.buildingConditionReport.create({
    data: {
      propertyId: property.id,
      reportDate: d("2026-03-05"),
      inspector: "Pieter Swanepoel, SACAP Registered Professional",
      overallCondition: "Good",
      summary:
        "Sandton Heights is in good overall condition. The structure, common areas, and services are well-maintained. The fire safety certificate expired February 2026 and renewal is due. Security gate motor was repaired in April 2026. Generator is performing well given sustained load-shedding periods.",
      nextReviewDate: d("2026-09-05"),
      items: [
        { area: "Roof & Waterproofing",         condition: "Good",      notes: "No active leaks. Flashings intact. Re-inspect after rainy season." },
        { area: "Exterior Facade & Paintwork",  condition: "Good",      notes: "Clean render. Minor cracking at expansion joint on floor 2 — monitor." },
        { area: "Common Areas & Corridors",     condition: "Very Good", notes: "Freshly painted. Clean and well-lit. Fire extinguishers in place." },
        { area: "Lobby & Intercom",             condition: "Good",      notes: "Intercom system functional. Access control operating correctly." },
        { area: "Lift",                         condition: "Good",      notes: "Otis lift serviced Q1 2026. Quarterly service due July." },
        { area: "Basement Parking & Gate",      condition: "Good",      notes: "Gate motor replaced April 2026. Parking markings faded — schedule re-marking." },
        { area: "Plumbing Infrastructure",      condition: "Good",      notes: "Pressure pump operational. No active leaks in risers." },
        { area: "Electrical & Generator",       condition: "Good",      notes: "Generator serviced post Stage 6 outages. DB boards inspected." },
        { area: "Security & CCTV",              condition: "Good",      notes: "16 cameras all operational. CCTV maintenance completed April 2026." },
        { area: "Fire Safety Systems",          condition: "Fair",      notes: "Certificate expired Feb 2026. Renewal inspection to be scheduled." },
        { area: "Landscaped Gardens",           condition: "Very Good", notes: "Well-maintained. Irrigation system operational." },
      ],
    },
  });

  // ── Owner invoices (management fee — Jan–Apr 2026) ──────────────────────────
  for (const { month, paid } of [
    { month: 1, paid: true  },
    { month: 2, paid: true  },
    { month: 3, paid: true  },
    { month: 4, paid: false },
  ]) {
    await prisma.ownerInvoice.create({
      data: {
        invoiceNumber: `OWN-SH-${propCode}-2026-${String(month).padStart(2, "0")}-MGMT`,
        propertyId: property.id,
        type: OwnerInvoiceType.MANAGEMENT_FEE,
        periodYear: YEAR,
        periodMonth: month,
        lineItems: [
          { description: "Management fee — 3 one-bedroom units",   units: 3, unitRate: 850,  amount: 2550 },
          { description: "Management fee — 4 two-bedroom units",   units: 4, unitRate: 1100, amount: 4400 },
          { description: "Management fee — 2 three-bedroom units", units: 2, unitRate: 1500, amount: 3000 },
        ],
        totalAmount: 9950,
        dueDate: new Date(YEAR, month - 1, 8),
        status: paid ? InvoiceStatus.PAID : InvoiceStatus.SENT,
        paidAt: paid ? new Date(YEAR, month - 1, 10) : null,
        paidAmount: paid ? 9950 : null,
        notes: `Monthly property management fee — ${new Date(YEAR, month - 1).toLocaleString("en-GB", { month: "long", year: "numeric" })}`,
      },
    });
  }

  // ── Asset maintenance logs ──────────────────────────────────────────────────
  const shAssets = await prisma.asset.findMany({
    where: { propertyId: property.id },
    select: { id: true, name: true },
  });
  const shAssetMap = Object.fromEntries(shAssets.map((a) => [a.name, a.id]));

  await prisma.assetMaintenanceLog.createMany({
    data: [
      {
        assetId: shAssetMap["Perkins Standby Generator"],
        date: d("2026-01-08"),
        description: "Post-Stage 6 full service — oil change, filters, fuel injectors, load test",
        cost: 2400,
        technician: "Agrico Equipment technician",
        notes: "Generator ran 72 hrs continuous during Stage 6. All consumables replaced. Performing normally.",
      },
      {
        assetId: shAssetMap["Perkins Standby Generator"],
        date: d("2026-02-10"),
        description: "Monthly routine check — oil level, coolant, battery voltage, 30-min load test",
        cost: 850,
        technician: "Agrico Equipment technician",
        vendorId: shVendorAgrico.id,
        notes: "All systems nominal. No faults detected. Next check due 10 Mar 2026.",
      },
      {
        assetId: shAssetMap["Perkins Standby Generator"],
        date: d("2026-03-10"),
        description: "Monthly routine check — oil level, coolant, battery voltage, 30-min load test",
        cost: 850,
        technician: "Agrico Equipment technician",
        vendorId: shVendorAgrico.id,
        notes: "All systems nominal. No faults detected. Next check due 10 Apr 2026.",
      },
      {
        assetId: shAssetMap["Otis Passenger Lift"],
        date: d("2026-01-15"),
        description: "Q1 quarterly service — lubrication, safety brake test, door mechanism check",
        cost: 3200,
        technician: "Otis Elevator SA technician",
        vendorId: shVendorOtis.id,
        notes: "All checks passed. Certificate of service issued. Next quarterly due July 2026.",
      },
      {
        assetId: shAssetMap["Grundfos Pressure Pump"],
        date: d("2026-03-10"),
        description: "Routine inspection — pressure output, seal condition, impeller check",
        cost: 1400,
        technician: "Pump & Valve SA technician",
        notes: "Pump within spec. Shaft seal showing slight wear — replacement recommended at next service.",
      },
      {
        assetId: shAssetMap["Hikvision 16-Channel CCTV System"],
        date: d("2026-04-10"),
        description: "Annual CCTV review — camera alignment, recording integrity check, firmware update",
        cost: 2800,
        technician: "ADT Security technician",
        vendorId: shVendorADT.id,
        notes: "All 16 cameras verified operational. DVR storage healthy. Firmware updated to latest version.",
      },
    ],
  });

  // ── Arrears escalations ─────────────────────────────────────────────────────
  const shArrearsCases = await prisma.arrearsCase.findMany({
    where: { propertyId: property.id },
    select: { id: true, tenantId: true },
  });
  const shCaseByTenant = Object.fromEntries(shArrearsCases.map((c) => [c.tenantId, c.id]));

  await prisma.arrearsEscalation.createMany({
    data: [
      // Priya Naidoo (unit 102) — 3 months overdue
      {
        caseId: shCaseByTenant[tenants["102"].id],
        stage: ArrearsStage.INFORMAL_REMINDER,
        notes: "WhatsApp reminder sent 5 Feb 2026. Tenant read message but did not respond.",
        createdAt: d("2026-02-05"),
      },
      {
        caseId: shCaseByTenant[tenants["102"].id],
        stage: ArrearsStage.INFORMAL_REMINDER,
        notes: "Phone call 18 Feb 2026. Tenant cited financial difficulty — requested 2-week extension. March also missed.",
        createdAt: d("2026-02-18"),
      },
      {
        caseId: shCaseByTenant[tenants["102"].id],
        stage: ArrearsStage.DEMAND_LETTER,
        notes: "Section 4 notice issued 20 Mar 2026 via registered post. 20-business-day compliance window.",
        createdAt: d("2026-03-20"),
      },
      {
        caseId: shCaseByTenant[tenants["102"].id],
        stage: ArrearsStage.DEMAND_LETTER,
        notes: "April rent also unpaid. Total arrears R27,000. Compliance window expired. Court application being prepared.",
        createdAt: d("2026-04-15"),
      },
      // Rajesh Govender (unit 302) — 2 months overdue
      {
        caseId: shCaseByTenant[tenants["302"].id],
        stage: ArrearsStage.INFORMAL_REMINDER,
        notes: "WhatsApp reminder sent 8 Mar 2026. Tenant acknowledged and promised payment by 15 March.",
        createdAt: d("2026-03-08"),
      },
      {
        caseId: shCaseByTenant[tenants["302"].id],
        stage: ArrearsStage.INFORMAL_REMINDER,
        notes: "Follow-up call 20 Mar 2026. Tenant did not pay by promised date. Escalation under review.",
        createdAt: d("2026-03-20"),
      },
      {
        caseId: shCaseByTenant[tenants["302"].id],
        stage: ArrearsStage.INFORMAL_REMINDER,
        notes: "April rent also not paid. Total arrears R30,300. Formal demand letter to be issued if not settled by 30 April.",
        createdAt: d("2026-04-10"),
      },
    ],
  });

  // ── Tax configurations ──────────────────────────────────────────────────────
  // South Africa: VAT at 15% (raised from 14% in April 2018)
  // Residential rental is VAT-exempt; management fees and contractor invoices are taxable.
  // Rental Income Withholding Tax (RIWT) at 15% applies when the landlord is non-resident.
  await prisma.taxConfiguration.createMany({
    data: [
      {
        orgId: organizationId,
        propertyId: property.id,
        label: "VAT — Management & Letting Fees",
        rate: 0.15,
        type: TaxType.ADDITIVE,
        appliesTo: ["MANAGEMENT_FEE_INCOME", "LETTING_FEE_INCOME"],
        isInclusive: false,
        effectiveFrom: d("2018-04-01"),
        isActive: true,
      },
      {
        orgId: organizationId,
        propertyId: property.id,
        label: "VAT — Contractor & Vendor Invoices",
        rate: 0.15,
        type: TaxType.ADDITIVE,
        appliesTo: ["CONTRACTOR_LABOUR", "CONTRACTOR_MATERIALS", "VENDOR_INVOICE"],
        isInclusive: true,
        effectiveFrom: d("2018-04-01"),
        isActive: true,
      },
      {
        orgId: organizationId,
        propertyId: property.id,
        label: "Rental Income Withholding Tax — Non-Resident Landlord",
        rate: 0.15,
        type: TaxType.WITHHELD,
        appliesTo: ["LONGTERM_RENT"],
        isInclusive: false,
        effectiveFrom: d("2026-01-01"),
        isActive: true,
      },
    ],
  });

  return property;
}

// ─────────────────────────────────────────────────────────────────────────────
// Belsize Court — London (UK) demo
// ─────────────────────────────────────────────────────────────────────────────

async function seedBelsizeCourt(organizationId: string): Promise<{ id: string }> {
  const YEAR = 2026;
  const MONTHS = [1, 2, 3]; // Feb=1, Mar=2, Apr=3 (0-indexed JS months)
  const SC = 250; // service charge per unit

  // ── Property ────────────────────────────────────────────────────────────────
  const property = await prisma.property.create({
    data: {
      name: "Belsize Court",
      type: PropertyType.LONGTERM,
      category: PropertyCategory.RESIDENTIAL,
      address: "28 Haverstock Hill, Belsize Park",
      city: "London",
      description:
        "Elegant 3-storey residential block in the heart of Belsize Park, NW3. 10 apartments across three floors with secure entry, communal garden, cycle store, and EV charging. Professionally managed under a Haverstock PM management brief.",
      serviceChargeDefault: SC,
      organizationId,
      currency: "GBP",
    },
  });

  // ── Units ───────────────────────────────────────────────────────────────────
  const unitDefs = [
    { number: "101", type: UnitType.ONE_BED,   rent: 1750, floor: 1, sqm: 52,  status: UnitStatus.ACTIVE },
    { number: "102", type: UnitType.ONE_BED,   rent: 1800, floor: 1, sqm: 54,  status: UnitStatus.ACTIVE },
    { number: "103", type: UnitType.ONE_BED,   rent: 1800, floor: 1, sqm: 54,  status: UnitStatus.ACTIVE },
    { number: "104", type: UnitType.ONE_BED,   rent: 1850, floor: 1, sqm: 55,  status: UnitStatus.VACANT },
    { number: "201", type: UnitType.TWO_BED,   rent: 2350, floor: 2, sqm: 78,  status: UnitStatus.ACTIVE },
    { number: "202", type: UnitType.TWO_BED,   rent: 2400, floor: 2, sqm: 80,  status: UnitStatus.ACTIVE },
    { number: "203", type: UnitType.TWO_BED,   rent: 2450, floor: 2, sqm: 82,  status: UnitStatus.ACTIVE },
    { number: "204", type: UnitType.TWO_BED,   rent: 2400, floor: 2, sqm: 80,  status: UnitStatus.ACTIVE },
    { number: "301", type: UnitType.THREE_BED, rent: 3100, floor: 3, sqm: 110, status: UnitStatus.ACTIVE },
    { number: "302", type: UnitType.THREE_BED, rent: 3200, floor: 3, sqm: 115, status: UnitStatus.ACTIVE },
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
        status: u.status,
        vacantSince: u.status === UnitStatus.VACANT ? d("2026-02-01") : null,
        sizeSqm: u.sqm,
        amenities: ["Double glazing", "Gas central heating", "Built-in wardrobes"],
        description: `${u.type.replace("_", " ")} apartment on floor ${u.floor}`,
      },
    });
  }

  // ── Tenants (9 active; unit 104 vacant) ─────────────────────────────────────
  const tenantDefs = [
    { unit: "101", name: "Emily Clarke",     rent: 1750, leaseEnd: "2027-01-31", phone: "+44 7911 000101", email: "emily.clarke@email.co.uk",    nationalId: "NS 12 34 56 A", renewal: RenewalStage.NONE         },
    { unit: "102", name: "James Hartley",    rent: 1800, leaseEnd: "2027-03-31", phone: "+44 7911 000102", email: "james.hartley@email.co.uk",    nationalId: "NS 23 45 67 B", renewal: RenewalStage.NONE         },
    { unit: "103", name: "Sophie Bennett",   rent: 1800, leaseEnd: "2026-06-30", phone: "+44 7911 000103", email: "sophie.bennett@email.co.uk",   nationalId: "NS 34 56 78 C", renewal: RenewalStage.NOTICE_SENT  },
    { unit: "201", name: "Oliver Thompson",  rent: 2350, leaseEnd: "2026-12-31", phone: "+44 7911 000201", email: "oliver.thompson@email.co.uk",  nationalId: "NS 45 67 89 D", renewal: RenewalStage.NONE         },
    { unit: "202", name: "Charlotte Davies", rent: 2400, leaseEnd: "2027-02-28", phone: "+44 7911 000202", email: "charlotte.davies@email.co.uk", nationalId: "NS 56 78 90 E", renewal: RenewalStage.NONE         },
    { unit: "203", name: "William Foster",   rent: 2450, leaseEnd: "2026-09-30", phone: "+44 7911 000203", email: "william.foster@email.co.uk",   nationalId: "NS 67 89 01 F", renewal: RenewalStage.NONE         },
    { unit: "204", name: "Rebecca Morgan",   rent: 2400, leaseEnd: "2027-04-30", phone: "+44 7911 000204", email: "rebecca.morgan@email.co.uk",   nationalId: "NS 78 90 12 G", renewal: RenewalStage.NONE         },
    { unit: "301", name: "Daniel Walsh",     rent: 3100, leaseEnd: "2026-08-31", phone: "+44 7911 000301", email: "daniel.walsh@email.co.uk",     nationalId: "NS 89 01 23 H", renewal: RenewalStage.NONE         },
    { unit: "302", name: "Natasha Singh",    rent: 3200, leaseEnd: "2026-12-31", phone: "+44 7911 000302", email: "natasha.singh@email.co.uk",    nationalId: "NS 90 12 34 I", renewal: RenewalStage.NONE         },
  ];

  const tenants: Record<string, { id: string }> = {};
  for (const t of tenantDefs) {
    tenants[t.unit] = await prisma.tenant.create({
      data: {
        name: t.name,
        unitId: units[t.unit].id,
        depositAmount: t.rent * 2,
        depositPaidDate: d("2025-01-05"),
        leaseStart: d("2025-01-01"),
        leaseEnd: d(t.leaseEnd),
        monthlyRent: t.rent,
        serviceCharge: SC,
        rentDueDay: 1,
        isActive: true,
        phone: t.phone,
        email: t.email,
        nationalId: t.nationalId,
        renewalStage: t.renewal,
        renewalNotes: t.renewal === RenewalStage.NOTICE_SENT
          ? "Renewal notice sent 1 March 2026. Awaiting tenant response on proposed new rent of £1,890."
          : null,
        notes: `AST commenced January 2025. ${t.name.split(" ")[0]} is a reliable tenant in good standing.`,
      },
    });
  }

  // ── Management Fee Configs ───────────────────────────────────────────────────
  const feeConfigs = [
    { unit: "101", flat: 175 }, { unit: "102", flat: 180 }, { unit: "103", flat: 180 },
    { unit: "104", flat: 185 }, { unit: "201", flat: 235 }, { unit: "202", flat: 240 },
    { unit: "203", flat: 245 }, { unit: "204", flat: 240 }, { unit: "301", flat: 310 },
    { unit: "302", flat: 320 },
  ];
  await prisma.managementFeeConfig.createMany({
    data: feeConfigs.map((f) => ({
      unitId: units[f.unit].id,
      flatAmount: f.flat,
      ratePercent: 0,
      effectiveFrom: d("2026-01-01"),
    })),
  });

  // ── Vendors (all before expenses) ───────────────────────────────────────────
  const [
    vendorMgmt, vendorWater, vendorElec, vendorCleaning, vendorInternet,
    vendorMaint, vendorElectrical, vendorLift, vendorSecurity, vendorGarden,
  ] = await Promise.all([
    prisma.vendor.create({ data: { name: "Haverstock Property Management Ltd", category: VendorCategory.SERVICE_PROVIDER, phone: "+44 20 7946 0101", email: "info@haverstockpm.co.uk",          organizationId, isActive: true, notes: "Managing agent for Belsize Court"                                    } }),
    prisma.vendor.create({ data: { name: "Thames Water",                       category: VendorCategory.UTILITY_PROVIDER,  phone: "+44 800 316 9800", email: "billing@thameswater.co.uk",           organizationId, isActive: true, notes: "Communal water & sewerage supply"                                   } }),
    prisma.vendor.create({ data: { name: "UK Power Networks",                  category: VendorCategory.UTILITY_PROVIDER,  phone: "+44 800 029 4285", email: "commercial@ukpn.co.uk",               organizationId, isActive: true, notes: "Common area electricity supply"                                     } }),
    prisma.vendor.create({ data: { name: "BrightHouse Cleaning Services",      category: VendorCategory.SERVICE_PROVIDER,  phone: "+44 20 7946 0202", email: "contracts@brighthouseclean.co.uk",    organizationId, isActive: true, notes: "Communal cleaning contract"                                         } }),
    prisma.vendor.create({ data: { name: "Virgin Media Business",              category: VendorCategory.SERVICE_PROVIDER,  phone: "+44 800 052 0800", email: "business@virginmedia.co.uk",          organizationId, isActive: true, notes: "Building WiFi & communications"                                     } }),
    prisma.vendor.create({ data: { name: "BuildRight Maintenance Ltd",         category: VendorCategory.CONTRACTOR,        phone: "+44 20 7946 0303", email: "jobs@buildrightmaint.co.uk",          organizationId, isActive: true, notes: "General maintenance & void works"                                   } }),
    prisma.vendor.create({ data: { name: "SparkSafe Electrical Ltd",           category: VendorCategory.CONTRACTOR,        phone: "+44 20 7946 0404", email: "info@sparksafe.co.uk",                organizationId, isActive: true, notes: "Electrical installation & remedial works (NICEIC Approved)"         } }),
    prisma.vendor.create({ data: { name: "Otis Elevator Company UK",           category: VendorCategory.SERVICE_PROVIDER,  phone: "+44 800 912 8000", email: "service@otis.co.uk",                  organizationId, isActive: true, notes: "Passenger lift maintenance & LOLER inspections"                     } }),
    prisma.vendor.create({ data: { name: "SecureGuard Systems Ltd",            category: VendorCategory.SERVICE_PROVIDER,  phone: "+44 20 7946 0505", email: "info@secureguard.co.uk",              organizationId, isActive: true, notes: "CCTV, access control & security systems"                            } }),
    prisma.vendor.create({ data: { name: "GreenThumb Garden Services",         category: VendorCategory.SERVICE_PROVIDER,  phone: "+44 20 7946 0606", email: "hello@greenthumb.co.uk",              organizationId, isActive: true, notes: "Communal garden & grounds maintenance"                              } }),
  ]);

  // ── Agent ────────────────────────────────────────────────────────────────────
  await prisma.agent.create({
    data: {
      name: "Foxtons Belsize Park",
      agency: "Foxtons Ltd",
      phone: "+44 20 7431 9900",
      email: "belsize@foxtons.co.uk",
      organizationId,
      notes: "Letting agent for Belsize Court — standard AST lettings, 8 weeks rent commission for new tenancies",
    },
  });

  // ── Income & Invoices ────────────────────────────────────────────────────────
  // Units with arrears (month indices that are overdue)
  const arrears: Record<string, number[]> = {
    "201": [1, 2],     // Oliver Thompson — Feb + Mar overdue → INFORMAL_REMINDER
    "302": [1, 2, 3],  // Natasha Singh — all 3 months → DEMAND_LETTER
  };

  const incomeRows: {
    date: Date; unitId: string; tenantId: string; invoiceId: string;
    type: IncomeType; grossAmount: number; agentCommission: number;
  }[] = [];

  for (const month of MONTHS) {
    const mm = String(month + 1).padStart(2, "0"); // month is 0-indexed; +1 for calendar month
    for (const t of tenantDefs) {
      const isArrears = (arrears[t.unit] ?? []).includes(month);
      const total = t.rent + SC;
      const inv = await prisma.invoice.create({
        data: {
          invoiceNumber: `BC-${t.unit}-2026-${mm}-001`,
          tenantId: tenants[t.unit].id,
          periodYear: YEAR,
          periodMonth: month + 1,
          rentAmount: t.rent,
          serviceCharge: SC,
          totalAmount: total,
          dueDate: new Date(YEAR, month, 1),
          status: isArrears ? InvoiceStatus.OVERDUE : InvoiceStatus.PAID,
          paidAt: isArrears ? null : new Date(YEAR, month, 5),
          paidAmount: isArrears ? null : total,
        },
      });
      if (!isArrears) {
        incomeRows.push({
          date: new Date(YEAR, month, 5),
          unitId: units[t.unit].id,
          tenantId: tenants[t.unit].id,
          invoiceId: inv.id,
          type: IncomeType.LONGTERM_RENT,
          grossAmount: t.rent,
          agentCommission: 0,
        });
      }
    }
  }
  await prisma.incomeEntry.createMany({ data: incomeRows });

  // ── Property-level expenses — step 1: createMany ─────────────────────────────
  const propExpDefs = [
    { cat: ExpenseCategory.MANAGEMENT_FEE, amount: 2772, desc: "Monthly management fee — Haverstock PM",      vendorId: vendorMgmt.id     },
    { cat: ExpenseCategory.WATER,          amount: 456,  desc: "Thames Water — communal water & sewerage",    vendorId: vendorWater.id    },
    { cat: ExpenseCategory.ELECTRICITY,    amount: 336,  desc: "UK Power Networks — common area electricity", vendorId: vendorElec.id     },
    { cat: ExpenseCategory.CLEANER,        amount: 864,  desc: "BrightHouse — communal cleaning services",    vendorId: vendorCleaning.id },
    { cat: ExpenseCategory.WIFI,           amount: 102,  desc: "Virgin Media Business — building WiFi",       vendorId: vendorInternet.id },
    { cat: ExpenseCategory.OTHER,          amount: 420,  desc: "GreenThumb — grounds & garden maintenance",   vendorId: vendorGarden.id   },
  ];
  await prisma.expenseEntry.createMany({
    data: MONTHS.flatMap((month) =>
      propExpDefs.map((e) => ({
        date: monthStart(YEAR, month),
        propertyId: property.id,
        scope: ExpenseScope.PROPERTY,
        category: e.cat,
        amount: e.amount,
        description: e.desc,
        isSunkCost: false,
        paidFromPettyCash: false,
        vendorId: e.vendorId,
      })),
    ),
  });

  // ── Unit-level ad-hoc expenses — step 1: createMany ─────────────────────────
  await prisma.expenseEntry.createMany({
    data: [
      { date: monthStart(YEAR, 1), unitId: units["103"].id, scope: ExpenseScope.UNIT, category: ExpenseCategory.MAINTENANCE,   amount: 540,  description: "Emergency burst pipe repair — unit 103",    isSunkCost: false, paidFromPettyCash: false, vendorId: vendorMaint.id      },
      { date: monthStart(YEAR, 1), unitId: units["201"].id, scope: ExpenseScope.UNIT, category: ExpenseCategory.MAINTENANCE,   amount: 384,  description: "Cracked window replacement — unit 201",     isSunkCost: false, paidFromPettyCash: false, vendorId: vendorMaint.id      },
      { date: monthStart(YEAR, 2), unitId: units["102"].id, scope: ExpenseScope.UNIT, category: ExpenseCategory.MAINTENANCE,   amount: 216,  description: "Leaking kitchen tap repair — unit 102",     isSunkCost: false, paidFromPettyCash: false, vendorId: vendorMaint.id      },
      { date: monthStart(YEAR, 2), unitId: units["301"].id, scope: ExpenseScope.UNIT, category: ExpenseCategory.MAINTENANCE,   amount: 1020, description: "Electrical DB board fault — unit 301",      isSunkCost: false, paidFromPettyCash: false, vendorId: vendorElectrical.id },
      { date: monthStart(YEAR, 3), unitId: units["104"].id, scope: ExpenseScope.UNIT, category: ExpenseCategory.REINSTATEMENT, amount: 1440, description: "Carpet replacement — void unit 104",        isSunkCost: false, paidFromPettyCash: false, vendorId: vendorMaint.id      },
      { date: monthStart(YEAR, 3), unitId: units["104"].id, scope: ExpenseScope.UNIT, category: ExpenseCategory.CLEANER,       amount: 336,  description: "Deep clean — void unit 104",                isSunkCost: false, paidFromPettyCash: true,  vendorId: vendorCleaning.id   },
    ],
  });

  // ── Expense line items — step 2: fetch IDs, then createMany ─────────────────
  const [createdPropExpenses, createdUnitExpenses] = await Promise.all([
    prisma.expenseEntry.findMany({
      where: { propertyId: property.id },
      select: { id: true, description: true },
    }),
    prisma.expenseEntry.findMany({
      where: { unitId: { in: Object.values(units).map((u) => u.id) } },
      select: { id: true, description: true },
    }),
  ]);

  type LIRow = {
    expenseId: string; category: LineItemCategory; description: string;
    amount: number; isVatable: boolean; paymentStatus: LineItemPaymentStatus; amountPaid: number;
  };

  // Patterns: { fragment in expense description → line items }
  const allExpPatterns: { fragment: string; items: { cat: LineItemCategory; desc: string; amount: number; isVatable: boolean }[] }[] = [
    { fragment: "management fee — Haverstock",    items: [{ cat: LineItemCategory.LABOUR, desc: "Management fee — 10 units @ £231/unit (excl. VAT)", amount: 2310, isVatable: true  }, { cat: LineItemCategory.QUOTE, desc: "VAT @ 20%", amount: 462,  isVatable: false }] },
    { fragment: "Thames Water",                   items: [{ cat: LineItemCategory.LABOUR, desc: "Water supply & sewerage charge (excl. VAT)",         amount: 380,  isVatable: true  }, { cat: LineItemCategory.QUOTE, desc: "VAT @ 20%", amount: 76,   isVatable: false }] },
    { fragment: "UK Power Networks",              items: [{ cat: LineItemCategory.LABOUR, desc: "Common area electricity supply (excl. VAT)",          amount: 280,  isVatable: true  }, { cat: LineItemCategory.QUOTE, desc: "VAT @ 20%", amount: 56,   isVatable: false }] },
    { fragment: "BrightHouse — communal",         items: [{ cat: LineItemCategory.LABOUR, desc: "Communal cleaning services (excl. VAT)",              amount: 720,  isVatable: true  }, { cat: LineItemCategory.QUOTE, desc: "VAT @ 20%", amount: 144,  isVatable: false }] },
    { fragment: "Virgin Media",                   items: [{ cat: LineItemCategory.LABOUR, desc: "Business broadband subscription (excl. VAT)",         amount: 85,   isVatable: true  }, { cat: LineItemCategory.QUOTE, desc: "VAT @ 20%", amount: 17,   isVatable: false }] },
    { fragment: "GreenThumb",                     items: [{ cat: LineItemCategory.LABOUR, desc: "Grounds & garden maintenance (excl. VAT)",            amount: 350,  isVatable: true  }, { cat: LineItemCategory.QUOTE, desc: "VAT @ 20%", amount: 70,   isVatable: false }] },
    { fragment: "burst pipe repair",              items: [{ cat: LineItemCategory.LABOUR, desc: "Emergency plumbing repair — parts & labour (excl. VAT)", amount: 450, isVatable: true  }, { cat: LineItemCategory.QUOTE, desc: "VAT @ 20%", amount: 90,  isVatable: false }] },
    { fragment: "Cracked window replacement",     items: [{ cat: LineItemCategory.MATERIAL, desc: "Double-glazed unit supply & fitting (excl. VAT)",   amount: 320,  isVatable: true  }, { cat: LineItemCategory.QUOTE, desc: "VAT @ 20%", amount: 64,   isVatable: false }] },
    { fragment: "Leaking kitchen tap repair",     items: [{ cat: LineItemCategory.LABOUR, desc: "Plumbing repair — cartridge & O-ring (excl. VAT)",   amount: 180,  isVatable: true  }, { cat: LineItemCategory.QUOTE, desc: "VAT @ 20%", amount: 36,   isVatable: false }] },
    { fragment: "Electrical DB board",            items: [{ cat: LineItemCategory.LABOUR,   desc: "DB board inspection & RCBO replacement (excl. VAT)", amount: 680, isVatable: true  }, { cat: LineItemCategory.MATERIAL, desc: "Parts & materials (excl. VAT)", amount: 170, isVatable: true }, { cat: LineItemCategory.QUOTE, desc: "VAT @ 20%", amount: 170, isVatable: false }] },
    { fragment: "Carpet replacement",             items: [{ cat: LineItemCategory.MATERIAL, desc: "Carpet supply — Berber weave (excl. VAT)",          amount: 900,  isVatable: true  }, { cat: LineItemCategory.LABOUR, desc: "Fitting & gripper installation (excl. VAT)", amount: 300, isVatable: true }, { cat: LineItemCategory.QUOTE, desc: "VAT @ 20%", amount: 240, isVatable: false }] },
    { fragment: "Deep clean — void",              items: [{ cat: LineItemCategory.LABOUR, desc: "Deep cleaning service — void unit (excl. VAT)",       amount: 280,  isVatable: true  }, { cat: LineItemCategory.QUOTE, desc: "VAT @ 20%", amount: 56,   isVatable: false }] },
  ];

  const lineItemRows: LIRow[] = [];
  for (const exp of [...createdPropExpenses, ...createdUnitExpenses]) {
    const desc = exp.description ?? "";
    for (const { fragment, items } of allExpPatterns) {
      if (desc.includes(fragment)) {
        for (const item of items) {
          lineItemRows.push({ expenseId: exp.id, category: item.cat, description: item.desc, amount: item.amount, isVatable: item.isVatable, paymentStatus: LineItemPaymentStatus.PAID, amountPaid: item.amount });
        }
        break;
      }
    }
  }
  await prisma.expenseLineItem.createMany({ data: lineItemRows });

  // ── Petty Cash ───────────────────────────────────────────────────────────────
  await prisma.pettyCash.createMany({
    data: [
      ...MONTHS.map((month) => ({ date: monthStart(YEAR, month), type: PettyCashType.IN, amount: 400, description: "Monthly petty cash top-up — Belsize Court", propertyId: property.id })),
      { date: new Date(YEAR, 1,  8), type: PettyCashType.OUT, amount: 45,  description: "Lightbulbs — common area replacements",            propertyId: property.id },
      { date: new Date(YEAR, 1, 14), type: PettyCashType.OUT, amount: 65,  description: "Notice board replacement — lobby",                  propertyId: property.id },
      { date: new Date(YEAR, 1, 22), type: PettyCashType.OUT, amount: 28,  description: "Postage — legal correspondence",                    propertyId: property.id },
      { date: new Date(YEAR, 2,  5), type: PettyCashType.OUT, amount: 35,  description: "Emergency padlock — car park gate",                 propertyId: property.id },
      { date: new Date(YEAR, 2, 19), type: PettyCashType.OUT, amount: 78,  description: "Drain rods & plunger — maintenance stock",          propertyId: property.id },
      { date: new Date(YEAR, 2, 28), type: PettyCashType.OUT, amount: 40,  description: "First aid kit restock — building",                  propertyId: property.id },
      { date: new Date(YEAR, 3,  3), type: PettyCashType.OUT, amount: 24,  description: "Key cutting — unit 104 void preparation",           propertyId: property.id },
      { date: new Date(YEAR, 3, 15), type: PettyCashType.OUT, amount: 55,  description: "Garden supplies — communal planting",                propertyId: property.id },
      { date: new Date(YEAR, 3, 22), type: PettyCashType.OUT, amount: 336, description: "Deep clean — void unit 104 (paid from petty cash)", propertyId: property.id },
    ],
  });

  // ── Insurance Policies ───────────────────────────────────────────────────────
  await prisma.insurancePolicy.createMany({
    data: [
      { propertyId: property.id, type: InsuranceType.BUILDING,          insurer: "Aviva Insurance Ltd",       policyNumber: "AVI-BC-2026-001", startDate: d("2026-03-01"), endDate: d("2027-03-01"), premiumAmount: 4800, premiumFrequency: PremiumFrequency.ANNUALLY, coverageAmount: 2500000, brokerName: "Marsh Insurance Brokers", brokerContact: "+44 20 7357 1000", notes: "Full buildings reinstatement insurance. Renewed March 2026." },
      { propertyId: property.id, type: InsuranceType.PUBLIC_LIABILITY,   insurer: "AXA Business Insurance",   policyNumber: "AXA-BC-2026-002", startDate: d("2026-01-01"), endDate: d("2027-01-01"), premiumAmount: 1200, premiumFrequency: PremiumFrequency.ANNUALLY, coverageAmount: 5000000, brokerName: "Marsh Insurance Brokers", brokerContact: "+44 20 7357 1000", notes: "Public liability & employer liability combined policy." },
      { propertyId: property.id, type: InsuranceType.CONTENTS,           insurer: "Zurich UK",                policyNumber: "ZUR-BC-2025-003", startDate: d("2025-05-15"), endDate: d("2026-05-15"), premiumAmount: 800,  premiumFrequency: PremiumFrequency.ANNUALLY, coverageAmount: 150000,  brokerName: "Marsh Insurance Brokers", brokerContact: "+44 20 7357 1000", notes: "Communal contents & common parts insurance. DUE FOR RENEWAL — expires 15 May 2026." },
    ],
  });

  // ── Assets + Maintenance Schedules ──────────────────────────────────────────
  const assetDefs = [
    {
      name: "Otis Gen2 Passenger Lift", category: AssetCategory.LIFT,       serial: "OT-GEN2-NW3-19",    purchaseDate: d("2019-01-15"), purchaseCost: 38000, warrantyExpiry: d("2024-01-15"),
      serviceProvider: "Otis Elevator Company UK", serviceContact: "+44 800 912 8000",
      notes: "10-person passenger lift. Annual LOLER inspection due August 2026.",
      schedule: { taskName: "Quarterly Lift Inspection & Service",  frequency: MaintenanceFrequency.QUARTERLY, nextDue: d("2026-05-10"), estimatedCost: 650 },
    },
    {
      name: "Perkins 80kVA Standby Generator", category: AssetCategory.GENERATOR, serial: "PK-80KVA-2020-NW3", purchaseDate: d("2020-06-01"), purchaseCost: 12500, warrantyExpiry: d("2025-06-01"),
      serviceProvider: "BuildRight Maintenance Ltd", serviceContact: "+44 20 7946 0303",
      notes: "Diesel standby generator. Monthly run tests and annual service.",
      schedule: { taskName: "Monthly Generator Service Check",     frequency: MaintenanceFrequency.MONTHLY,   nextDue: d("2026-05-15"), estimatedCost: 280 },
    },
    {
      name: "Hikvision CCTV System (16-channel)", category: AssetCategory.SECURITY,   serial: "HK-16CH-2021-BC",   purchaseDate: d("2021-03-01"), purchaseCost: 3200,  warrantyExpiry: d("2024-03-01"),
      serviceProvider: "SecureGuard Systems Ltd", serviceContact: "+44 20 7946 0505",
      notes: "16-channel NVR system covering entrance, car park, lift and corridors. 30-day recording retention.",
      schedule: { taskName: "Quarterly CCTV Health Check",          frequency: MaintenanceFrequency.QUARTERLY, nextDue: d("2026-06-01"), estimatedCost: 150 },
    },
    {
      name: "Ideal Evo Max Commercial Boiler", category: AssetCategory.PLUMBING,   serial: "ID-EVOMAX-BC-18",   purchaseDate: d("2018-09-01"), purchaseCost: 8500,  warrantyExpiry: d("2021-09-01"),
      serviceProvider: "BuildRight Maintenance Ltd", serviceContact: "+44 20 7946 0303",
      notes: "Central communal heating boiler. Annual Gas Safe service required. Inhibitor checked quarterly.",
      schedule: { taskName: "Annual Boiler Service & Inspection",    frequency: MaintenanceFrequency.ANNUALLY,  nextDue: d("2026-09-01"), estimatedCost: 480 },
    },
    {
      name: "Pod Point EV Charging Points (x2)", category: AssetCategory.ELECTRICAL, serial: "PP-EV-2-BC-23",     purchaseDate: d("2023-08-01"), purchaseCost: 4800,  warrantyExpiry: d("2026-08-01"),
      serviceProvider: "Pod Point Ltd", serviceContact: "+44 20 3959 1000",
      notes: "Two 7kW smart chargers in car park. OZEV funded. Annual service recommended.",
      schedule: { taskName: "Annual EV Charger Service",             frequency: MaintenanceFrequency.ANNUALLY,  nextDue: d("2026-08-01"), estimatedCost: 220 },
    },
  ];
  for (const a of assetDefs) {
    const asset = await prisma.asset.create({
      data: { propertyId: property.id, name: a.name, category: a.category, serialNumber: a.serial, purchaseDate: a.purchaseDate, purchaseCost: a.purchaseCost, warrantyExpiry: a.warrantyExpiry, serviceProvider: a.serviceProvider, serviceContact: a.serviceContact, notes: a.notes },
    });
    await prisma.assetMaintenanceSchedule.create({
      data: { assetId: asset.id, propertyId: property.id, taskName: a.schedule.taskName, frequency: a.schedule.frequency, nextDue: a.schedule.nextDue, isActive: true, estimatedCost: a.schedule.estimatedCost },
    });
  }

  // ── Recurring Expenses ───────────────────────────────────────────────────────
  await prisma.recurringExpense.createMany({
    data: [
      { description: "Monthly management fee — Haverstock PM",  category: ExpenseCategory.MANAGEMENT_FEE, amount: 2772, scope: ExpenseScope.PROPERTY, propertyId: property.id, frequency: RecurringFrequency.MONTHLY,   nextDueDate: d("2026-05-01"), isActive: true, vendorId: vendorMgmt.id      },
      { description: "Thames Water — communal water supply",    category: ExpenseCategory.WATER,          amount: 456,  scope: ExpenseScope.PROPERTY, propertyId: property.id, frequency: RecurringFrequency.MONTHLY,   nextDueDate: d("2026-05-01"), isActive: true, vendorId: vendorWater.id     },
      { description: "UK Power Networks — common areas",        category: ExpenseCategory.ELECTRICITY,    amount: 336,  scope: ExpenseScope.PROPERTY, propertyId: property.id, frequency: RecurringFrequency.MONTHLY,   nextDueDate: d("2026-05-01"), isActive: true, vendorId: vendorElec.id      },
      { description: "BrightHouse communal cleaning contract",  category: ExpenseCategory.CLEANER,        amount: 864,  scope: ExpenseScope.PROPERTY, propertyId: property.id, frequency: RecurringFrequency.MONTHLY,   nextDueDate: d("2026-05-01"), isActive: true, vendorId: vendorCleaning.id  },
      { description: "Virgin Media Business — building WiFi",   category: ExpenseCategory.WIFI,           amount: 102,  scope: ExpenseScope.PROPERTY, propertyId: property.id, frequency: RecurringFrequency.MONTHLY,   nextDueDate: d("2026-05-01"), isActive: true, vendorId: vendorInternet.id  },
      { description: "GreenThumb grounds maintenance",          category: ExpenseCategory.OTHER,          amount: 420,  scope: ExpenseScope.PROPERTY, propertyId: property.id, frequency: RecurringFrequency.MONTHLY,   nextDueDate: d("2026-05-01"), isActive: true, vendorId: vendorGarden.id    },
      { description: "Quarterly Lift Maintenance — Otis UK",    category: ExpenseCategory.MAINTENANCE,    amount: 650,  scope: ExpenseScope.PROPERTY, propertyId: property.id, frequency: RecurringFrequency.QUARTERLY, nextDueDate: d("2026-05-10"), isActive: true, vendorId: vendorLift.id      },
      { description: "Quarterly Generator Service — BuildRight",category: ExpenseCategory.MAINTENANCE,    amount: 280,  scope: ExpenseScope.PROPERTY, propertyId: property.id, frequency: RecurringFrequency.QUARTERLY, nextDueDate: d("2026-05-15"), isActive: true, vendorId: vendorMaint.id     },
      { description: "Annual fire extinguisher service",        category: ExpenseCategory.MAINTENANCE,    amount: 420,  scope: ExpenseScope.PROPERTY, propertyId: property.id, frequency: RecurringFrequency.ANNUAL,    nextDueDate: d("2026-10-01"), isActive: true, vendorId: vendorSecurity.id  },
    ],
  });

  // ── Link asset schedules → recurring expenses ────────────────────────────────
  const [schedRows, recurRows] = await Promise.all([
    prisma.assetMaintenanceSchedule.findMany({ where: { propertyId: property.id }, select: { id: true, taskName: true } }),
    prisma.recurringExpense.findMany({ where: { propertyId: property.id }, select: { id: true, description: true } }),
  ]);
  for (const { taskFragment, descFragment } of [
    { taskFragment: "Lift",      descFragment: "Lift Maintenance"      },
    { taskFragment: "Generator", descFragment: "Generator Service"     },
  ]) {
    const sched = schedRows.find((s) => s.taskName.includes(taskFragment));
    const recur = recurRows.find((r) => r.description.includes(descFragment));
    if (sched && recur) {
      await prisma.assetMaintenanceSchedule.update({ where: { id: sched.id }, data: { recurringExpenseId: recur.id } });
    }
  }

  // ── Maintenance Jobs ─────────────────────────────────────────────────────────
  await prisma.maintenanceJob.createMany({
    data: [
      // DONE — historical
      { propertyId: property.id, unitId: units["103"].id, title: "Burst pipe — bathroom ceiling",          description: "Emergency call-out. Overflow pipe burst above bathroom ceiling. Pipe replaced, area dried and resealed.",               category: MaintenanceCategory.PLUMBING,   priority: MaintenancePriority.URGENT,  status: MaintenanceStatus.DONE,        reportedBy: "Sophie Bennett",          assignedTo: "BuildRight Maintenance Ltd", reportedDate: d("2026-02-03"), scheduledDate: d("2026-02-03"), completedDate: d("2026-02-03"), cost: 540,  vendorId: vendorMaint.id,      isEmergency: true,  submittedViaPortal: false, notes: "Resolved same day. Tenant confirmed resolved." },
      { propertyId: property.id, unitId: units["201"].id, title: "Cracked double-glazed window — unit 201", description: "Impact crack on inner pane of living room window. Double-glazed unit replaced by BuildRight.",                         category: MaintenanceCategory.STRUCTURAL, priority: MaintenancePriority.MEDIUM,  status: MaintenanceStatus.DONE,        reportedBy: "Oliver Thompson",         assignedTo: "BuildRight Maintenance Ltd", reportedDate: d("2026-02-10"), scheduledDate: d("2026-02-12"), completedDate: d("2026-02-12"), cost: 384,  vendorId: vendorMaint.id,      isEmergency: false, submittedViaPortal: false, notes: "Access via concierge key. Tenant confirmed." },
      { propertyId: property.id, unitId: units["102"].id, title: "Leaking kitchen tap — unit 102",          description: "Dripping monobloc kitchen tap. Cartridge and O-ring replaced.",                                                       category: MaintenanceCategory.PLUMBING,   priority: MaintenancePriority.LOW,     status: MaintenanceStatus.DONE,        reportedBy: "James Hartley",           assignedTo: "BuildRight Maintenance Ltd", reportedDate: d("2026-03-18"), scheduledDate: d("2026-03-20"), completedDate: d("2026-03-20"), cost: 216,  vendorId: vendorMaint.id,      isEmergency: false, submittedViaPortal: false, notes: "Routine repair." },
      { propertyId: property.id, unitId: units["301"].id, title: "DB board fault — fuse tripping (unit 301)",description: "RCD tripping repeatedly. Faulty RCBO identified and replaced. Board tested and certified.",                            category: MaintenanceCategory.ELECTRICAL, priority: MaintenancePriority.HIGH,    status: MaintenanceStatus.DONE,        reportedBy: "Daniel Walsh",            assignedTo: "SparkSafe Electrical Ltd",   reportedDate: d("2026-03-07"), scheduledDate: d("2026-03-08"), completedDate: d("2026-03-08"), cost: 1020, vendorId: vendorElectrical.id, isEmergency: false, submittedViaPortal: false, notes: "EIC certificate issued post-works." },
      // IN_PROGRESS
      { propertyId: property.id,                          title: "Quarterly lift inspection — Otis UK",     description: "Scheduled quarterly inspection and lubrication service. Engineer on-site, report pending.",                            category: MaintenanceCategory.OTHER,      priority: MaintenancePriority.MEDIUM,  status: MaintenanceStatus.IN_PROGRESS, reportedBy: "Building Manager",        assignedTo: "Otis Elevator Company UK",   reportedDate: d("2026-04-25"), scheduledDate: d("2026-04-28"),                                                 vendorId: vendorLift.id,       isEmergency: false, submittedViaPortal: false, notes: "Otis engineer to return with replacement door sensor." },
      { propertyId: property.id, unitId: units["104"].id, title: "Void works — carpet & painting (unit 104)",description: "Full void refurb in progress: carpet fitted, emulsion painting of all rooms underway.",                               category: MaintenanceCategory.OTHER,      priority: MaintenancePriority.LOW,     status: MaintenanceStatus.IN_PROGRESS, reportedBy: "Building Manager",        assignedTo: "BuildRight Maintenance Ltd", reportedDate: d("2026-04-10"), scheduledDate: d("2026-04-15"),                                                 vendorId: vendorMaint.id,      isEmergency: false, submittedViaPortal: false, notes: "ETA completion 9 May 2026." },
      // OPEN — tenant portal requests
      { propertyId: property.id, unitId: units["102"].id, title: "Blocked kitchen drain — unit 102",        description: "Kitchen sink draining very slowly. Possible grease build-up.",                                                         category: MaintenanceCategory.PLUMBING,   priority: MaintenancePriority.MEDIUM,  status: MaintenanceStatus.OPEN,        reportedBy: "James Hartley (portal)",                                            reportedDate: d("2026-04-20"),                                                                                                             isEmergency: false, submittedViaPortal: true,  notes: "Awaiting scheduling." },
      { propertyId: property.id, unitId: units["202"].id, title: "Intercom handset not working — unit 202", description: "Intercom rings but tenant cannot hear caller. Handset unit suspected faulty.",                                         category: MaintenanceCategory.ELECTRICAL, priority: MaintenancePriority.LOW,     status: MaintenanceStatus.OPEN,        reportedBy: "Charlotte Davies (portal)",                                         reportedDate: d("2026-04-24"),                                                                                                             isEmergency: false, submittedViaPortal: true,  notes: "Non-urgent." },
      { propertyId: property.id, unitId: units["204"].id, title: "Bathroom extractor fan noisy — unit 204", description: "Extractor fan vibrating loudly when running. Possible bearing failure.",                                               category: MaintenanceCategory.OTHER,      priority: MaintenancePriority.LOW,     status: MaintenanceStatus.OPEN,        reportedBy: "Rebecca Morgan (portal)",                                           reportedDate: d("2026-04-28"),                                                                                                             isEmergency: false, submittedViaPortal: true  },
      // OPEN — manager logged
      { propertyId: property.id,                          title: "Repaint 3rd floor corridor",               description: "Scuff marks and paint peeling on 3rd floor corridor walls. Full repaint recommended.",                                category: MaintenanceCategory.PAINTING,   priority: MaintenancePriority.LOW,     status: MaintenanceStatus.OPEN,        reportedBy: "Building Manager",                                                  reportedDate: d("2026-04-01"),                                                                                                             isEmergency: false, submittedViaPortal: false, notes: "To be quoted with BuildRight." },
      { propertyId: property.id,                          title: "CCTV camera 4 offline",                    description: "Camera 4 (car park east side) showing offline on NVR. Possible cable fault.",                                        category: MaintenanceCategory.SECURITY,   priority: MaintenancePriority.MEDIUM,  status: MaintenanceStatus.OPEN,        reportedBy: "Building Manager",                                                  reportedDate: d("2026-04-18"),                                                  vendorId: vendorSecurity.id, isEmergency: false, submittedViaPortal: false, notes: "SecureGuard to investigate." },
    ],
  });

  // ── Compliance Certificates ──────────────────────────────────────────────────
  await prisma.complianceCertificate.createMany({
    data: [
      { propertyId: property.id, organizationId, certificateType: "Gas Safety Certificate",                       certificateNumber: "GSC-BC-2025-004",  issuedBy: "Corgi Homeplan Ltd",                  issueDate: d("2025-04-01"), expiryDate: d("2026-04-01"), notes: "Annual Gas Safety Record (CP12). EXPIRED — renewal overdue. Contact Corgi Homeplan immediately."  },
      { propertyId: property.id, organizationId, certificateType: "Electrical Installation Condition Report (EICR)", certificateNumber: "EICR-BC-2026-005", issuedBy: "SparkSafe Electrical Ltd (NICEIC)",    issueDate: d("2026-03-15"), expiryDate: d("2031-03-15"), notes: "5-year EICR completed March 2026. Grade C2 observations — remedial works completed. Certificate satisfactory." },
      { propertyId: property.id, organizationId, certificateType: "Energy Performance Certificate (EPC)",          certificateNumber: "EPC-BC-2020-006",  issuedBy: "Elmhurst Energy",                     issueDate: d("2020-01-10"), expiryDate: d("2030-01-10"), notes: "EPC rating: C (72 SAP points). Valid to 2030."                                                       },
      { propertyId: property.id, organizationId, certificateType: "Fire Risk Assessment",                          certificateNumber: "FRA-BC-2025-007",  issuedBy: "London Fire Safety Ltd",              issueDate: d("2025-09-01"), expiryDate: d("2026-09-01"), notes: "Annual fire risk assessment. Low risk rating. 3 actions raised — all completed."                     },
      { propertyId: property.id, organizationId, certificateType: "Legionella Risk Assessment",                    certificateNumber: "LRA-BC-2024-008",  issuedBy: "Hydrosafe UK Ltd",                    issueDate: d("2024-11-01"), expiryDate: d("2025-11-01"), notes: "Legionella L8 assessment — EXPIRED. Annual renewal required. Contact Hydrosafe UK."                  },
    ],
  });

  // ── Building Condition Report ────────────────────────────────────────────────
  await prisma.buildingConditionReport.create({
    data: {
      propertyId: property.id,
      reportDate: d("2026-01-15"),
      inspector: "Jonathan Miles MRICS",
      overallCondition: "Good",
      summary: "Belsize Court is maintained to a good standard overall. The building fabric is sound and communal areas are clean and well-presented. Two items — first floor corridor carpets and third floor corridor decoration — are assessed as Fair and are recommended for attention within the next 6–12 months. Lift, generator and boiler plant are all in good working order.",
      items: [
        { area: "Main Entrance Lobby",     condition: "Good", notes: "Clean and well-lit. Intercom system fully functional. Post boxes in good order."            },
        { area: "Passenger Lift",          condition: "Good", notes: "Recently serviced by Otis. No defects noted. LOLER certificate current."                    },
        { area: "Stairwells (all floors)", condition: "Good", notes: "Emergency lighting tested and operational. Handrails secure."                                },
        { area: "1st Floor Corridor",      condition: "Fair", notes: "Carpet showing significant wear. Redecoration with new carpet tiles recommended."            },
        { area: "2nd Floor Corridor",      condition: "Good", notes: "Decoration in good order. No defects noted."                                                 },
        { area: "3rd Floor Corridor",      condition: "Fair", notes: "Scuff marks on walls, minor paint peeling near unit 302. Redecoration recommended."          },
        { area: "Roof & Waterproofing",    condition: "Good", notes: "Felt flat roof in satisfactory condition. No ponding or visible membrane defects."           },
        { area: "External Facade",         condition: "Good", notes: "Victorian brick in good condition. Pointing intact. No structural cracking noted."           },
        { area: "Car Park & Cycle Store",  condition: "Good", notes: "Line markings clear. EV chargers operational. Cycle store secure and tidy."                  },
        { area: "Communal Garden",         condition: "Good", notes: "Lawn and planting well maintained by GreenThumb."                                            },
        { area: "Boiler Room",             condition: "Good", notes: "Communal boiler serviced September 2025. Chemical inhibitor levels satisfactory."            },
        { area: "Bin Store",               condition: "Good", notes: "Clean and organised. Recycling segregation compliant with Camden Council requirements."      },
      ],
      nextReviewDate: d("2026-07-15"),
    },
  });

  // ── Owner Invoices ───────────────────────────────────────────────────────────
  for (const { month, paid } of [
    { month: 2, paid: true  },
    { month: 3, paid: true  },
    { month: 4, paid: false },
  ]) {
    const mm = String(month).padStart(2, "0");
    const totalAmount = 2772;
    await prisma.ownerInvoice.create({
      data: {
        invoiceNumber: `OWN-BC-2026-${mm}-MGMT`,
        propertyId: property.id,
        type: OwnerInvoiceType.MANAGEMENT_FEE,
        periodYear: YEAR,
        periodMonth: month,
        lineItems: [
          { description: "Management fee — 10 units @ £231.00/unit", units: 10, unitRate: 231.00, amount: 2310.00 },
          { description: "VAT @ 20%",                                 units: 1,  unitRate: 462.00, amount: 462.00  },
        ],
        totalAmount,
        dueDate: new Date(YEAR, month - 1, 7),
        status: paid ? InvoiceStatus.PAID : InvoiceStatus.SENT,
        paidAt: paid ? new Date(YEAR, month - 1, 10) : null,
        paidAmount: paid ? totalAmount : null,
        notes: `Monthly property management fee — ${paid ? "paid via BACS" : "awaiting payment"}.`,
      },
    });
  }

  // ── Asset Maintenance Logs ───────────────────────────────────────────────────
  const allAssets = await prisma.asset.findMany({ where: { propertyId: property.id }, select: { id: true, name: true } });
  const assetByName: Record<string, string> = Object.fromEntries(allAssets.map((a) => [a.name, a.id]));
  const generatorId = assetByName["Perkins 80kVA Standby Generator"];
  const liftId      = assetByName["Otis Gen2 Passenger Lift"];
  const cctvId      = assetByName["Hikvision CCTV System (16-channel)"];
  await prisma.assetMaintenanceLog.createMany({
    data: [
      { assetId: generatorId, date: d("2026-01-15"), description: "Monthly generator run test & inspection — all systems nominal",    cost: 280, technician: "Dave Kirk (BuildRight)",    vendorId: vendorMaint.id,    notes: "Oil level OK. Battery 12.8V. Run test 15 min."             },
      { assetId: generatorId, date: d("2026-02-15"), description: "Monthly generator run test & inspection — minor oil top-up",       cost: 280, technician: "Dave Kirk (BuildRight)",    vendorId: vendorMaint.id,    notes: "Oil topped up. Run test 15 min."                           },
      { assetId: generatorId, date: d("2026-03-15"), description: "Monthly generator run test & inspection — all systems nominal",    cost: 280, technician: "Dave Kirk (BuildRight)",    vendorId: vendorMaint.id,    notes: "All checks passed. Annual service due June 2026."          },
      { assetId: liftId,      date: d("2026-02-20"), description: "Quarterly lift inspection and lubrication service",                cost: 650, technician: "Otis Field Engineer",       vendorId: vendorLift.id,     notes: "Door operation adjusted. Guide rails lubricated. No defects." },
      { assetId: cctvId,      date: d("2026-01-20"), description: "Annual CCTV health check and recording verification",              cost: 150, technician: "SecureGuard Systems Ltd",   vendorId: vendorSecurity.id, notes: "All 16 channels verified. 30-day retention confirmed. Camera 12 realigned." },
    ],
  });

  // ── Arrears Cases & Escalations ──────────────────────────────────────────────
  for (const at of [
    {
      unit: "201", stage: ArrearsStage.INFORMAL_REMINDER, amountOwed: 5200,
      notes: "Oliver Thompson — 2 months overdue (Feb + Mar 2026). Total: £5,200 (rent £4,700 + SC £500).",
      escalations: [
        { stage: ArrearsStage.INFORMAL_REMINDER, notes: "Informal reminder email & phone call. Tenant cited delayed bank transfer. Promised payment end of February.", createdAt: d("2026-02-08") },
        { stage: ArrearsStage.INFORMAL_REMINDER, notes: "Second reminder issued. Tenant acknowledged arrears. Partial payment of £2,600 promised by 20 March — not received.",                 createdAt: d("2026-03-12") },
      ],
    },
    {
      unit: "302", stage: ArrearsStage.DEMAND_LETTER, amountOwed: 10350,
      notes: "Natasha Singh — 3 months overdue (Feb, Mar, Apr 2026). Total: £10,350 (rent £9,600 + SC £750). Demand letter served.",
      escalations: [
        { stage: ArrearsStage.INFORMAL_REMINDER, notes: "Informal reminder email and text. No response from tenant.",                                                         createdAt: d("2026-02-08") },
        { stage: ArrearsStage.INFORMAL_REMINDER, notes: "Second reminder. Tenant responded citing financial difficulty. No payment made.",                                    createdAt: d("2026-03-12") },
        { stage: ArrearsStage.DEMAND_LETTER,     notes: "Section 8 demand letter served via solicitors (Ground 10 & 11). 14-day cure period running.",                       createdAt: d("2026-04-02") },
      ],
    },
  ]) {
    const arrearsCase = await prisma.arrearsCase.create({
      data: { tenantId: tenants[at.unit].id, propertyId: property.id, stage: at.stage, amountOwed: at.amountOwed, notes: at.notes },
    });
    await prisma.arrearsEscalation.createMany({
      data: at.escalations.map((e) => ({ caseId: arrearsCase.id, stage: e.stage, notes: e.notes, createdAt: e.createdAt })),
    });
  }

  // ── Link maintenance jobs → expense entries ──────────────────────────────────
  for (const { titleFragment, amount } of [
    { titleFragment: "Burst pipe",          amount: 540  },
    { titleFragment: "DB board fault",      amount: 1020 },
    { titleFragment: "Cracked double-glazed", amount: 384 },
  ]) {
    const job = await prisma.maintenanceJob.findFirst({ where: { propertyId: property.id, title: { contains: titleFragment } } });
    const exp = await prisma.expenseEntry.findFirst({ where: { amount, OR: [{ propertyId: property.id }, { unitId: { in: Object.values(units).map((u) => u.id) } }] } });
    if (job && exp) {
      await prisma.maintenanceJob.update({ where: { id: job.id }, data: { expenseId: exp.id } });
    }
  }

  // ── Rent History ─────────────────────────────────────────────────────────────
  const priorRents: Record<string, number> = { "101": 1695, "102": 1746, "103": 1746, "201": 2275, "202": 2325, "203": 2375, "204": 2325, "301": 3000, "302": 3100 };
  await prisma.rentHistory.createMany({
    data: [
      ...Object.entries(priorRents).map(([unit, rent]) => ({ tenantId: tenants[unit].id, monthlyRent: rent, effectiveDate: d("2025-01-01"), reason: "AST commencement — agreed rent per tenancy agreement"                     })),
      ...tenantDefs.map((t)                              => ({ tenantId: tenants[t.unit].id, monthlyRent: t.rent, effectiveDate: d("2026-01-01"), reason: "Annual rent review — CPI + 1% increase effective 1 January 2026" })),
    ],
  });

  // ── Tax Configurations (UK VAT @ 20%) ────────────────────────────────────────
  await prisma.taxConfiguration.createMany({
    data: [
      { orgId: organizationId, propertyId: property.id, label: "VAT — Management & Agency Fees",      rate: 0.20, type: TaxType.ADDITIVE, appliesTo: ["MANAGEMENT_FEE_INCOME", "LETTING_FEE_INCOME"],                   isInclusive: false, effectiveFrom: d("2020-01-01"), isActive: true },
      { orgId: organizationId, propertyId: property.id, label: "VAT — Contractor & Vendor Invoices",  rate: 0.20, type: TaxType.ADDITIVE, appliesTo: ["CONTRACTOR_LABOUR", "CONTRACTOR_MATERIALS", "VENDOR_INVOICE"],   isInclusive: true,  effectiveFrom: d("2020-01-01"), isActive: true },
    ],
  });

  // ── Management Agreement ─────────────────────────────────────────────────────
  await prisma.managementAgreement.create({
    data: {
      propertyId: property.id,
      managementFeeRate: 10.0,
      vacancyFeeRate: 5.0,
      vacancyFeeThresholdMonths: 9,
      newLettingFeeRate: 50.0,
      leaseRenewalFeeFlat: 300,
      shortTermLettingFeeRate: 0.0,
      repairAuthorityLimit: 500,
      rentRemittanceDay: 5,
      mgmtFeeInvoiceDay: 7,
      landlordPaymentDays: 2,
      kpiStartDate: d("2026-01-01"),
      kpiOccupancyTarget: 90,
      kpiRentCollectionTarget: 95,
      kpiExpenseRatioTarget: 80,
      kpiTenantTurnoverTarget: 85,
      kpiDaysToLeaseTarget: 21,
      kpiRenewalRateTarget: 80,
      kpiMaintenanceCompletionTarget: 95,
      kpiEmergencyResponseHrs: 4,
      kpiStandardResponseHrs: 48,
      mgmtBankName: "Barclays Bank UK PLC",
      mgmtBankAccountName: "Haverstock Property Management Ltd",
      mgmtBankAccountNumber: "12345678",
      mgmtBankBranch: "Finchley Road, London",
      mgmtPaymentInstructions: "Please pay via BACS quoting your property reference. Invoices settled within 7 working days of issue.",
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
  const demoKey     = body?.demoKey        as string | undefined;
  const clientOrgId = body?.organizationId as string | undefined;
  const force       = body?.force === true; // if true, delete existing property and re-seed

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
    if (existing._count.units > 0 && !force) {
      // Fully seeded — backfill access for any org members who are missing it
      await grantAccess(existing.id);
      return NextResponse.json({ ok: false, reason: "already_seeded", propertyId: existing.id, organizationId });
    }
    // Either partially seeded (no units) or force re-seed requested — delete and re-seed.
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
    } else if (demo.key === "belsize-court") {
      const property = await seedBelsizeCourt(organizationId);
      await grantAccess(property.id);
      return NextResponse.json({ ok: true, propertyId: property.id, organizationId });
    } else {
      return NextResponse.json({ error: "Demo not yet implemented." }, { status: 400 });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[demo/seed] Error seeding demo property:", message);

    // Best-effort cleanup: if the seed function partially created the property
    // (e.g. Vercel function timeout, pgBouncer connection drop), delete the
    // partial record so the next attempt starts clean instead of returning
    // "already_seeded" with incomplete data.
    try {
      const partial = await prisma.property.findFirst({
        where: { name: demo.name, organizationId },
        select: { id: true },
      });
      if (partial) {
        await prisma.property.delete({ where: { id: partial.id } });
        console.warn("[demo/seed] Deleted partial property after failure:", partial.id);
      }
    } catch (cleanupErr) {
      console.error("[demo/seed] Cleanup of partial property failed:", cleanupErr);
    }

    return NextResponse.json({ ok: false, error: "Seed failed. Please try again.", detail: message }, { status: 500 });
  }
}
