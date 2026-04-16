import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { DEMO_PROPERTIES } from "@/lib/demo-definitions";
import {
  PropertyType, PropertyCategory, UnitType, UnitStatus,
  IncomeType, ExpenseCategory, ExpenseScope, PettyCashType,
  InsuranceType, PremiumFrequency, AssetCategory, MaintenanceFrequency,
  RecurringFrequency, ArrearsStage, InvoiceStatus,
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
      },
    ],
  });

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

  // ── Property-level monthly expenses (with vendors & line items) ─────────────
  for (const month of MONTHS) {
    // Management fee
    await prisma.expenseEntry.create({
      data: {
        date: monthStart(YEAR, month),
        propertyId: property.id,
        scope: ExpenseScope.PROPERTY,
        category: ExpenseCategory.MANAGEMENT_FEE,
        amount: 7200,
        description: "Monthly management fee — Sandton Property Management",
        isSunkCost: false,
        paidFromPettyCash: false,
        vendorId: shVendorMgmt.id,
        lineItems: {
          create: [
            { category: LineItemCategory.LABOUR,   description: "Management fee (excl. VAT)", amount: 6261, isVatable: true,  paymentStatus: LineItemPaymentStatus.PAID },
            { category: LineItemCategory.QUOTE,    description: "VAT @ 15%",                  amount: 939,  isVatable: false, paymentStatus: LineItemPaymentStatus.PAID },
          ],
        },
      },
    });
    // Water & sewerage
    await prisma.expenseEntry.create({
      data: {
        date: monthStart(YEAR, month),
        propertyId: property.id,
        scope: ExpenseScope.PROPERTY,
        category: ExpenseCategory.WATER,
        amount: 2400,
        description: "City of Johannesburg — water & sewerage",
        isSunkCost: false,
        paidFromPettyCash: false,
        vendorId: shVendorWater.id,
        lineItems: {
          create: [
            { category: LineItemCategory.MATERIAL, description: "Water consumption", amount: 1680, isVatable: false, paymentStatus: LineItemPaymentStatus.PAID },
            { category: LineItemCategory.MATERIAL, description: "Sewerage levy",     amount: 720,  isVatable: false, paymentStatus: LineItemPaymentStatus.PAID },
          ],
        },
      },
    });
    // Electricity
    await prisma.expenseEntry.create({
      data: {
        date: monthStart(YEAR, month),
        propertyId: property.id,
        scope: ExpenseScope.PROPERTY,
        category: ExpenseCategory.ELECTRICITY,
        amount: 3800,
        description: "Eskom — common areas & security lighting",
        isSunkCost: false,
        paidFromPettyCash: false,
        vendorId: shVendorEskom.id,
        lineItems: {
          create: [
            { category: LineItemCategory.MATERIAL, description: "Electricity consumption (incl. VAT)", amount: 3200, isVatable: true, paymentStatus: LineItemPaymentStatus.PAID },
            { category: LineItemCategory.MATERIAL, description: "Network access charge (incl. VAT)",   amount: 600,  isVatable: true, paymentStatus: LineItemPaymentStatus.PAID },
          ],
        },
      },
    });
    // Cleaning
    await prisma.expenseEntry.create({
      data: {
        date: monthStart(YEAR, month),
        propertyId: property.id,
        scope: ExpenseScope.PROPERTY,
        category: ExpenseCategory.CLEANER,
        amount: 5500,
        description: "Cleaning staff — 2 cleaners (common areas & grounds)",
        isSunkCost: false,
        paidFromPettyCash: false,
        vendorId: shVendorClean.id,
        lineItems: {
          create: [
            { category: LineItemCategory.LABOUR,   description: "Cleaning staff wages (2 cleaners)", amount: 4800, isVatable: false, paymentStatus: LineItemPaymentStatus.PAID },
            { category: LineItemCategory.MATERIAL, description: "Cleaning materials & detergents",   amount: 700,  isVatable: false, paymentStatus: LineItemPaymentStatus.PAID },
          ],
        },
      },
    });
    // Fibre internet
    await prisma.expenseEntry.create({
      data: {
        date: monthStart(YEAR, month),
        propertyId: property.id,
        scope: ExpenseScope.PROPERTY,
        category: ExpenseCategory.WIFI,
        amount: 1200,
        description: "Vox Fibre — building internet infrastructure",
        isSunkCost: false,
        paidFromPettyCash: false,
        vendorId: shVendorFibre.id,
        lineItems: {
          create: [
            { category: LineItemCategory.MATERIAL, description: "Fibre subscription (excl. VAT)", amount: 1043, isVatable: true,  paymentStatus: LineItemPaymentStatus.PAID },
            { category: LineItemCategory.QUOTE,    description: "VAT @ 15%",                      amount: 157,  isVatable: false, paymentStatus: LineItemPaymentStatus.PAID },
          ],
        },
      },
    });
  }

  // ── Unit-level ad-hoc expenses (with vendors & line items) ──────────────────
  // Jan — Geyser replacement, unit 103 (BuildFix SA)
  await prisma.expenseEntry.create({
    data: {
      date: monthStart(YEAR, 0),
      unitId: units["103"].id,
      scope: ExpenseScope.UNIT,
      category: ExpenseCategory.MAINTENANCE,
      amount: 1800,
      description: "Geyser replacement — hot water cylinder unit 103",
      isSunkCost: false,
      paidFromPettyCash: false,
      vendorId: shVendorMaint.id,
      lineItems: {
        create: [
          { category: LineItemCategory.LABOUR,   description: "Installation labour",              amount: 1200, isVatable: true, paymentStatus: LineItemPaymentStatus.PAID },
          { category: LineItemCategory.MATERIAL, description: "150L geyser element & thermostat", amount: 600,  isVatable: true, paymentStatus: LineItemPaymentStatus.PAID },
        ],
      },
    },
  });
  // Feb — DB board fault, unit 201 (Sparks Electrical)
  await prisma.expenseEntry.create({
    data: {
      date: monthStart(YEAR, 1),
      unitId: units["201"].id,
      scope: ExpenseScope.UNIT,
      category: ExpenseCategory.MAINTENANCE,
      amount: 950,
      description: "Electrical fault — DB board trip, unit 201",
      isSunkCost: false,
      paidFromPettyCash: false,
      vendorId: shVendorSparks.id,
      lineItems: {
        create: [
          { category: LineItemCategory.LABOUR,   description: "Fault-finding & repair labour", amount: 700, isVatable: true, paymentStatus: LineItemPaymentStatus.PAID },
          { category: LineItemCategory.MATERIAL, description: "Surge protector replacement",   amount: 250, isVatable: true, paymentStatus: LineItemPaymentStatus.PAID },
        ],
      },
    },
  });
  // Feb — A/C compressor, unit 203 (BuildFix SA) — sunk cost
  await prisma.expenseEntry.create({
    data: {
      date: monthStart(YEAR, 1),
      unitId: units["203"].id,
      scope: ExpenseScope.UNIT,
      category: ExpenseCategory.MAINTENANCE,
      amount: 4200,
      description: "Air conditioning compressor — master bedroom",
      isSunkCost: true,
      paidFromPettyCash: false,
      vendorId: shVendorMaint.id,
      lineItems: {
        create: [
          { category: LineItemCategory.LABOUR,   description: "Installation & re-gas labour",  amount: 1200, isVatable: true, paymentStatus: LineItemPaymentStatus.PAID },
          { category: LineItemCategory.MATERIAL, description: "Compressor unit (incl. VAT)",   amount: 3000, isVatable: true, paymentStatus: LineItemPaymentStatus.PAID },
        ],
      },
    },
  });
  // Mar — Deep clean & reinstatement, unit 302 (Green Clean Services) — sunk cost
  await prisma.expenseEntry.create({
    data: {
      date: monthStart(YEAR, 2),
      unitId: units["302"].id,
      scope: ExpenseScope.UNIT,
      category: ExpenseCategory.REINSTATEMENT,
      amount: 3500,
      description: "Deep clean & touch-up painting — notice unit 302",
      isSunkCost: true,
      paidFromPettyCash: false,
      vendorId: shVendorClean.id,
      lineItems: {
        create: [
          { category: LineItemCategory.LABOUR,   description: "Deep clean labour",             amount: 2500, isVatable: false, paymentStatus: LineItemPaymentStatus.PAID },
          { category: LineItemCategory.MATERIAL, description: "Painting materials & sundries", amount: 1000, isVatable: false, paymentStatus: LineItemPaymentStatus.PAID },
        ],
      },
    },
  });
  // Apr — Gate motor replacement, property-level (ADT Security)
  await prisma.expenseEntry.create({
    data: {
      date: monthStart(YEAR, 3),
      propertyId: property.id,
      scope: ExpenseScope.PROPERTY,
      category: ExpenseCategory.MAINTENANCE,
      amount: 8500,
      description: "Security gate motor replacement — basement entry",
      isSunkCost: false,
      paidFromPettyCash: false,
      vendorId: shVendorADT.id,
      lineItems: {
        create: [
          { category: LineItemCategory.LABOUR,   description: "Motor installation & commissioning", amount: 2500, isVatable: true, paymentStatus: LineItemPaymentStatus.PAID },
          { category: LineItemCategory.MATERIAL, description: "Gate motor unit & hardware",         amount: 6000, isVatable: true, paymentStatus: LineItemPaymentStatus.PAID },
        ],
      },
    },
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
      },
    ],
  });

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
