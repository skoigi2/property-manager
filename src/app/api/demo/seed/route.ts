import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { DEMO_PROPERTIES } from "@/lib/demo-definitions";
import {
  PropertyType, PropertyCategory, UnitType, UnitStatus,
  IncomeType, ExpenseCategory, ExpenseScope, PettyCashType,
  InsuranceType, PremiumFrequency, AssetCategory, MaintenanceFrequency,
  RecurringFrequency, InvoiceStatus, RenewalStage,
  MaintenanceStatus, MaintenancePriority, MaintenanceCategory,
  VendorCategory, OwnerInvoiceType, TaxType,
  LineItemCategory, LineItemPaymentStatus, PaymentMethod,
  DocumentCategory, CommunicationType,
  CaseEventKind,
} from "@prisma/client";
import { mapMaintenanceStatusToCase, mapMaintenanceWaitingOn } from "@/lib/cases";
import { getWorkflow, getStageByIndex, getStageByKey, computeDefaultStageSlaHours } from "@/lib/case-workflows";
import { startOfMonth, subMonths } from "date-fns";

// Seeding does hundreds of inserts; on Vercel (higher per-query latency than
// local) this can exceed 60 s. Raise to the platform max and run independent
// inserts in parallel chunks (see runChunked) to keep wall-clock well under it.
export const maxDuration = 300;

function d(dateStr: string) { return new Date(dateStr); }
function monthStart(year: number, month: number) { return new Date(year, month, 1); }

/** Run `fn` over `items` in parallel chunks — cuts wall-clock on high-latency
 *  DB connections while bounding concurrency against the connection pool. */
async function runChunked<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

// ── Rolling-window date helpers ───────────────────────────────────────────────
// Demos anchor their data to the seed time so numbers always show in the current
// month. `recentMonths(3)` = [two-months-ago, last-month, current-month].
type WMonth = { y: number; m: number };
function recentMonths(count: number, now: Date = new Date()): WMonth[] {
  const base = startOfMonth(now);
  const out: WMonth[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const dt = subMonths(base, i);
    out.push({ y: dt.getFullYear(), m: dt.getMonth() });
  }
  return out;
}
function wDate(win: WMonth[], i: number, day = 1): Date { return new Date(win[i].y, win[i].m, day); }
function addM(now: Date, months: number): Date { return new Date(now.getFullYear(), now.getMonth() + months, now.getDate()); }
function addD(now: Date, days: number): Date { const x = new Date(now); x.setDate(x.getDate() + days); return x; }
function subY(now: Date, years: number): Date { return new Date(now.getFullYear() - years, now.getMonth(), now.getDate()); }

// ── Shared maintenance + Cases seeding ────────────────────────────────────────
const MAINT_STAGE_FOR_STATUS: Record<string, number> = {
  OPEN: 1,           // triaged
  IN_PROGRESS: 7,    // in_progress
  AWAITING_PARTS: 6, // scheduled
  DONE: 8,           // completed
  CANCELLED: 10,     // closed
};

interface DemoJob {
  title: string; description: string; category: MaintenanceCategory; priority: MaintenancePriority;
  status: MaintenanceStatus; reportedBy: string; assignedTo?: string; unitId?: string | null;
  reportedDate: Date; scheduledDate?: Date; completedDate?: Date; cost?: number;
  vendorId?: string; vendorName?: string; isEmergency: boolean; portal?: boolean; stageStartedAt: Date;
}

/** Create each maintenance job + a linked MAINTENANCE CaseThread (status/stage/SLA/events). */
async function seedMaintenanceJobsWithCases(opts: {
  organizationId: string; propertyId: string; allUnitIds: string[];
  jobs: DemoJob[];
  agreement: { kpiEmergencyResponseHrs: number; kpiStandardResponseHrs: number };
}) {
  const { organizationId, propertyId, allUnitIds, jobs, agreement } = opts;
  const wf = getWorkflow("MAINTENANCE");
  const stdSla = computeDefaultStageSlaHours(wf, { agreement });
  const emgSla = computeDefaultStageSlaHours(wf, { isEmergency: true, agreement });

  await runChunked(jobs, 8, async (j) => {
    const job = await prisma.maintenanceJob.create({
      data: {
        propertyId, unitId: j.unitId ?? null, title: j.title, description: j.description,
        category: j.category, priority: j.priority, status: j.status, reportedBy: j.reportedBy,
        assignedTo: j.assignedTo ?? null, reportedDate: j.reportedDate, scheduledDate: j.scheduledDate ?? null,
        completedDate: j.completedDate ?? null, cost: j.cost ?? null, vendorId: j.vendorId ?? null,
        isEmergency: j.isEmergency, submittedViaPortal: j.portal ?? false,
      },
    });

    if (j.status === MaintenanceStatus.DONE && j.cost) {
      const exp = await prisma.expenseEntry.findFirst({
        where: { amount: j.cost, OR: [{ propertyId }, { unitId: { in: allUnitIds } }] },
      });
      if (exp) await prisma.maintenanceJob.update({ where: { id: job.id }, data: { expenseId: exp.id } });
    }

    const caseStatus = mapMaintenanceStatusToCase(j.status);
    const waitingOn = mapMaintenanceWaitingOn({ status: j.status, vendorId: j.vendorId ?? null });
    const stageIdx = MAINT_STAGE_FOR_STATUS[j.status] ?? 1;
    const stage = getStageByIndex(wf, stageIdx);
    const thread = await prisma.caseThread.create({
      data: {
        caseType: "MAINTENANCE", subjectId: job.id, propertyId, unitId: j.unitId ?? null,
        organizationId, title: j.title, status: caseStatus, stage: stage?.label ?? null,
        currentStageIndex: stageIdx, workflowKey: "MAINTENANCE_V1",
        stageSlaHours: j.isEmergency ? emgSla : stdSla, waitingOn,
        stageStartedAt: j.stageStartedAt, lastActivityAt: j.completedDate ?? j.scheduledDate ?? j.reportedDate,
      },
    });
    await prisma.maintenanceJob.update({ where: { id: job.id }, data: { caseThreadId: thread.id } });

    const events: { kind: CaseEventKind; body: string; createdAt: Date }[] = [
      { kind: CaseEventKind.COMMENT, body: `Reported by ${j.reportedBy}: ${j.description}`, createdAt: j.reportedDate },
    ];
    if (j.vendorName) events.push({ kind: CaseEventKind.VENDOR_ASSIGNED, body: `Assigned to ${j.vendorName}.`, createdAt: j.scheduledDate ?? j.reportedDate });
    if (j.status === MaintenanceStatus.DONE) events.push({ kind: CaseEventKind.STATUS_CHANGE, body: "Work completed. Case resolved.", createdAt: j.completedDate ?? j.reportedDate });
    await prisma.caseEvent.createMany({
      data: events.map((e) => ({ caseThreadId: thread.id, kind: e.kind, actorName: "Property Manager", body: e.body, createdAt: e.createdAt })),
    });
  });
}

/** Create a standalone ARREARS / LEASE_RENEWAL CaseThread with an opening comment. */
async function seedStandaloneCase(opts: {
  caseType: "ARREARS" | "LEASE_RENEWAL"; subjectId: string; organizationId: string;
  propertyId: string; unitId?: string | null; title: string; status: string;
  stageIndex: number; waitingOn: string; stageStartedAt: Date; commentBody: string;
}) {
  const wf = getWorkflow(opts.caseType as never);
  const stage = getStageByIndex(wf, opts.stageIndex);
  const thread = await prisma.caseThread.create({
    data: {
      caseType: opts.caseType as never, subjectId: opts.subjectId, propertyId: opts.propertyId,
      unitId: opts.unitId ?? null, organizationId: opts.organizationId, title: opts.title,
      status: opts.status as never, stage: stage?.label ?? null, currentStageIndex: opts.stageIndex,
      workflowKey: opts.caseType === "ARREARS" ? "ARREARS_V1" : "LEASE_RENEWAL_V1",
      stageSlaHours: computeDefaultStageSlaHours(wf), waitingOn: opts.waitingOn as never,
      stageStartedAt: opts.stageStartedAt, lastActivityAt: opts.stageStartedAt,
    },
  });
  await prisma.caseEvent.create({
    data: { caseThreadId: thread.id, kind: CaseEventKind.COMMENT, actorName: "Property Manager", body: opts.commentBody, createdAt: opts.stageStartedAt },
  });
}

/**
 * Seed an arrears case as a CaseThread — the only arrears model since the
 * consolidation (see src/lib/arrears.ts). Escalation history becomes
 * STAGE_CHANGE events on the case timeline.
 *
 * `subjectId` MUST be the tenant id: that's what the ARREARS_7D automation
 * writes and what buildArrearsCases() joins on. (The previous seeder passed the
 * ArrearsCase id here, so its demo case could never resolve to a tenant.)
 *
 * No amountOwed — the balance is derived from unpaid invoices, so the demo's
 * arrears figures come from the invoices it already seeds.
 */
async function seedArrearsCase(opts: {
  tenantId: string;
  tenantName: string;
  organizationId: string;
  propertyId: string;
  unitId?: string | null;
  /** ARREARS_V1 stage key the case has reached. */
  stageKey: string;
  status?: string;
  waitingOn?: string;
  stageStartedAt: Date;
  openedNote: string;
  escalations?: { stageKey: string; notes: string; createdAt: Date }[];
}) {
  const wf = getWorkflow("ARREARS");
  const resolved = getStageByKey(wf, opts.stageKey);
  const stageIndex = resolved?.index ?? 0;

  const thread = await prisma.caseThread.create({
    data: {
      caseType: "ARREARS",
      subjectId: opts.tenantId,
      propertyId: opts.propertyId,
      unitId: opts.unitId ?? null,
      organizationId: opts.organizationId,
      title: `Arrears — ${opts.tenantName}`,
      status: (opts.status ?? "IN_PROGRESS") as never,
      stage: resolved?.stage.label ?? null,
      currentStageIndex: stageIndex,
      workflowKey: "ARREARS_V1",
      stageSlaHours: computeDefaultStageSlaHours(wf),
      waitingOn: (opts.waitingOn ?? "MANAGER") as never,
      stageStartedAt: opts.stageStartedAt,
      lastActivityAt: opts.stageStartedAt,
    },
  });

  const events = [
    {
      caseThreadId: thread.id,
      kind: CaseEventKind.COMMENT,
      actorName: "Property Manager",
      body: opts.openedNote,
      createdAt: opts.stageStartedAt,
    },
    ...(opts.escalations ?? []).map((e) => ({
      caseThreadId: thread.id,
      kind: CaseEventKind.STAGE_CHANGE,
      actorName: "Property Manager",
      body: `${getStageByKey(wf, e.stageKey)?.stage.label ?? e.stageKey} — ${e.notes}`,
      createdAt: e.createdAt,
    })),
  ];
  await prisma.caseEvent.createMany({ data: events });

  return thread;
}

/** Create a linked MAINTENANCE CaseThread for every job on a property that lacks one.
 *  Used when jobs are created via createMany (e.g. with approval-workflow fields). */
async function backfillMaintenanceCases(
  propertyId: string,
  organizationId: string,
  agreement: { kpiEmergencyResponseHrs: number; kpiStandardResponseHrs: number },
) {
  const wf = getWorkflow("MAINTENANCE");
  const stdSla = computeDefaultStageSlaHours(wf, { agreement });
  const emgSla = computeDefaultStageSlaHours(wf, { isEmergency: true, agreement });
  const nowTs = new Date();
  const jobs = await prisma.maintenanceJob.findMany({
    where: { propertyId, caseThreadId: null },
    select: { id: true, title: true, status: true, vendorId: true, isEmergency: true, unitId: true, reportedDate: true, scheduledDate: true, completedDate: true, description: true, reportedBy: true },
  });
  await runChunked(jobs, 8, async (job) => {
    const caseStatus = mapMaintenanceStatusToCase(job.status);
    const waitingOn = mapMaintenanceWaitingOn({ status: job.status, vendorId: job.vendorId });
    const stageIdx = MAINT_STAGE_FOR_STATUS[job.status] ?? 1;
    const stage = getStageByIndex(wf, stageIdx);
    const active = job.status === "OPEN" || job.status === "IN_PROGRESS" || job.status === "AWAITING_PARTS";
    const stageStartedAt = active ? addD(nowTs, -3) : (job.completedDate ?? job.reportedDate ?? nowTs);
    const thread = await prisma.caseThread.create({
      data: {
        caseType: "MAINTENANCE", subjectId: job.id, propertyId, unitId: job.unitId,
        organizationId, title: job.title, status: caseStatus, stage: stage?.label ?? null,
        currentStageIndex: stageIdx, workflowKey: "MAINTENANCE_V1",
        stageSlaHours: job.isEmergency ? emgSla : stdSla, waitingOn,
        stageStartedAt, lastActivityAt: job.completedDate ?? job.scheduledDate ?? job.reportedDate ?? nowTs,
      },
    });
    await prisma.maintenanceJob.update({ where: { id: job.id }, data: { caseThreadId: thread.id } });
    await prisma.caseEvent.create({
      data: { caseThreadId: thread.id, kind: CaseEventKind.COMMENT, actorName: "Property Manager", body: `Reported by ${job.reportedBy ?? "tenant"}: ${job.description ?? job.title}`, createdAt: job.reportedDate ?? nowTs },
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Al Seef Residences — Bahrain demo
// Adapted from prisma/seed-bahrain.ts (no hardcoded org/users/PropertyAccess)
// ─────────────────────────────────────────────────────────────────────────────

async function seedAlSeef(organizationId: string): Promise<{ id: string }> {
  const now = new Date();
  const WIN = recentMonths(3, now); // [2 months ago, last month, current month]

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
        depositPaidDate: wDate(WIN, 0),
        leaseStart: subY(now, 1),
        leaseEnd: t.unit === "304" ? addM(now, 2) : t.unit === "102" ? addM(now, 8) : addM(now, 13),
        monthlyRent: t.rent,
        serviceCharge: sc(t.unit),
        rentDueDay: 1,
        isActive: true,
        phone: t.phone,
        email: t.email,
        nationalId: t.nationalId,
        renewalStage: t.unit === "304" ? "NOTICE_SENT" : "NONE",
        proposedRent: t.unit === "304" ? Math.round(t.rent * 1.05) : null,
        proposedLeaseEnd: t.unit === "304" ? addM(now, 14) : null,
        notes:
          t.unit === "304"
            ? "Tenant has given notice / mid-renewal. Awaiting decision on proposed terms."
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
      effectiveFrom: wDate(WIN, 0),
    })),
  });

  // ── Income & invoices (rolling 3-month window) ───────────────────────────────
  // Arrears: unit 102 misses the latest 2 months; unit 304 misses the current month
  const arrears: Record<string, number[]> = { "102": [1, 2], "304": [2] };
  let invoiceSeq = 1;
  // Use last 6 chars of propertyId to namespace invoice numbers globally unique
  const propCode = property.id.slice(-6).toUpperCase();

  // Collect income entries to batch-create after all invoices are created
  const incomeEntryData: {
    date: Date; unitId: string; tenantId: string; invoiceId: string;
    type: IncomeType; grossAmount: number; agentCommission: number;
  }[] = [];

  for (let i = 0; i < WIN.length; i++) {
    for (const t of tenantDefs) {
      const unit = units[t.unit];
      const tenant = tenants[t.unit];
      const serviceCharge = sc(t.unit);
      const grossAmount = t.rent + serviceCharge;
      const isArrears = (arrears[t.unit] ?? []).includes(i);

      const invoiceNum = `ASR-${propCode}-${WIN[i].y}-${String(WIN[i].m + 1).padStart(2, "0")}-${String(
        invoiceSeq++
      ).padStart(3, "0")}`;

      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber: invoiceNum,
          tenantId: tenant.id,
          periodYear: WIN[i].y,
          periodMonth: WIN[i].m + 1,
          rentAmount: t.rent,
          serviceCharge,
          totalAmount: grossAmount,
          dueDate: wDate(WIN, i, 5),
          status: isArrears ? InvoiceStatus.OVERDUE : InvoiceStatus.PAID,
          paidAt: isArrears ? null : wDate(WIN, i, 1),
          paidAmount: isArrears ? null : grossAmount,
        },
      });

      if (!isArrears) {
        incomeEntryData.push({
          date: wDate(WIN, i),
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
    data: WIN.flatMap((_, i) =>
      monthlyPropExpenses.map((e) => ({
        date: wDate(WIN, i),
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
      date: wDate(WIN, e.month),
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
      ...WIN.map((_, i) => ({
        date: wDate(WIN, i),
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
        date: wDate(WIN, p.month, p.day),
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
        policyNumber: "GUI-BLD-1142",
        startDate: addM(now, -6),
        endDate: addM(now, 6),
        premiumAmount: 2400,
        premiumFrequency: PremiumFrequency.ANNUALLY,
        coverageAmount: 2000000,
        brokerName: "Bahrain Insurance Brokers",
        brokerContact: "+973 1700 4455",
        notes: "Full building structure coverage.",
      },
      {
        propertyId: property.id,
        type: InsuranceType.PUBLIC_LIABILITY,
        insurer: "AXA Gulf",
        policyNumber: "AXA-PL-0881",
        startDate: addM(now, -5),
        endDate: addD(now, 25),
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
        purchaseDate: subY(now, 3),
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
        nextDue: addM(now, 1),
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
        nextDueDate: addM(now, 1),
        isActive: true,
      },
      {
        description: "Landscaping & Garden Maintenance — Rooftop & Grounds",
        category: ExpenseCategory.CLEANER,
        amount: 120,
        scope: ExpenseScope.PROPERTY,
        propertyId: property.id,
        frequency: RecurringFrequency.MONTHLY,
        nextDueDate: addM(now, 1),
        isActive: true,
      },
      {
        description: "Quarterly Generator Service — Cummins Bahrain",
        category: ExpenseCategory.MAINTENANCE,
        amount: 280,
        scope: ExpenseScope.PROPERTY,
        propertyId: property.id,
        frequency: RecurringFrequency.QUARTERLY,
        nextDueDate: addM(now, 2),
        isActive: true,
      },
      {
        description: "Annual Lift Servicing Contract — ThyssenKrupp",
        category: ExpenseCategory.MAINTENANCE,
        amount: 800,
        scope: ExpenseScope.PROPERTY,
        propertyId: property.id,
        frequency: RecurringFrequency.ANNUAL,
        nextDueDate: addM(now, 6),
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
  // CaseThread-backed, with escalation history on the timeline. The outstanding
  // balance is derived from this property's unpaid invoices, so no amount here.
  await seedArrearsCase({
    tenantId: tenants["102"].id,
    tenantName: "Priya Sharma",
    organizationId,
    propertyId: property.id,
    unitId: units["102"].id,
    stageKey: "demand_letter",
    status: "AWAITING_TENANT",
    waitingOn: "TENANT",
    stageStartedAt: addD(now, -9),
    openedNote:
      "Tenant has not paid rent for the last two months (BD 400 × 2). Called recently — promised to clear by end of month. Follow up required.",
    escalations: [
      { stageKey: "informal_reminder", notes: "WhatsApp reminder sent. Tenant acknowledged but did not pay.", createdAt: wDate(WIN, 1, 3) },
      { stageKey: "informal_reminder", notes: "Follow-up call. Tenant promised to pay by month-end. Current month also missed.", createdAt: wDate(WIN, 1, 15) },
      { stageKey: "demand_letter",     notes: "Formal demand letter issued via registered post. 7-day payment window given.", createdAt: wDate(WIN, 2, 2) },
    ],
  });

  await seedArrearsCase({
    tenantId: tenants["304"].id,
    tenantName: "Deepak & Meera Pillai",
    organizationId,
    propertyId: property.id,
    unitId: units["304"].id,
    stageKey: "informal_reminder",
    stageStartedAt: wDate(WIN, 2, 4),
    openedNote:
      "Current-month rent outstanding (BD 520 + BD 75 service charge). SMS reminder sent. Tenant mid-renewal — chase payment.",
    escalations: [
      { stageKey: "informal_reminder", notes: "SMS reminder sent. Tenant mid-renewal — chase payment.", createdAt: wDate(WIN, 2, 4) },
    ],
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
      kpiStartDate: subY(now, 1),
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
      { tenantId: tenants["101"].id, monthlyRent: 330, effectiveDate: subY(now, 1), reason: "Previous lease rate" },
      { tenantId: tenants["103"].id, monthlyRent: 480, effectiveDate: subY(now, 1), reason: "Previous lease rate" },
      { tenantId: tenants["205"].id, monthlyRent: 700, effectiveDate: subY(now, 1), reason: "Previous lease rate" },
      { tenantId: tenants["305"].id, monthlyRent: 700, effectiveDate: subY(now, 1), reason: "Previous lease rate" },
      { tenantId: tenants["401"].id, monthlyRent: 370, effectiveDate: subY(now, 1), reason: "Previous lease rate" },
      // Lease commencement / annual review records
      ...tenantDefs.map((t) => ({
        tenantId: tenants[t.unit].id,
        monthlyRent: t.rent,
        effectiveDate: wDate(WIN, 0),
        reason: "Lease commencement / annual review",
      })),
    ],
  });

  // ── Maintenance jobs + linked Cases ──────────────────────────────────────────
  await seedMaintenanceJobsWithCases({
    organizationId, propertyId: property.id, allUnitIds: Object.values(units).map((u) => u.id),
    agreement: { kpiEmergencyResponseHrs: 4, kpiStandardResponseHrs: 48 },
    jobs: [
      {
        title: "Bathroom tap replacement — unit 103", description: "Mixer tap dripping constantly. Tenant reported via WhatsApp.",
        category: MaintenanceCategory.PLUMBING, priority: MaintenancePriority.MEDIUM, status: MaintenanceStatus.DONE,
        reportedBy: "Mohammed Al-Mannai (unit 103)", assignedTo: "Gulf Maintenance Services", unitId: units["103"].id,
        reportedDate: wDate(WIN, 0, 10), scheduledDate: wDate(WIN, 0, 12), completedDate: wDate(WIN, 0, 12),
        cost: 120, vendorId: vendorMaint.id, vendorName: "Gulf Maintenance Services", isEmergency: false, stageStartedAt: wDate(WIN, 0, 12),
      },
      {
        title: "Lift — door sensor fault (floor 2)", description: "Lift door not closing properly on floor 2. Reported by multiple tenants.",
        category: MaintenanceCategory.OTHER, priority: MaintenancePriority.HIGH, status: MaintenanceStatus.DONE,
        reportedBy: "Multiple tenants", assignedTo: "ThyssenKrupp Elevator Bahrain",
        reportedDate: wDate(WIN, 0, 18), scheduledDate: wDate(WIN, 0, 20), completedDate: wDate(WIN, 0, 21),
        cost: 340, isEmergency: true, stageStartedAt: wDate(WIN, 0, 21),
      },
      {
        title: "Kitchen circuit breaker tripping — unit 201", description: "Breaker trips after microwave use. Suspected undersized circuit.",
        category: MaintenanceCategory.ELECTRICAL, priority: MaintenancePriority.MEDIUM, status: MaintenanceStatus.DONE,
        reportedBy: "Fatima Al-Khalifa (unit 201)", assignedTo: "Al Baraka Electrical", unitId: units["201"].id,
        reportedDate: wDate(WIN, 1, 6), scheduledDate: wDate(WIN, 1, 8), completedDate: wDate(WIN, 1, 8),
        cost: 85, vendorId: vendorElec.id, vendorName: "Al Baraka Electrical", isEmergency: false, stageStartedAt: wDate(WIN, 1, 8),
      },
      {
        title: "A/C compressor failure — master bedroom unit 404", description: "A/C compressor stopped working. No cooling in master bedroom.",
        category: MaintenanceCategory.APPLIANCE, priority: MaintenancePriority.HIGH, status: MaintenanceStatus.DONE,
        reportedBy: "Abdullah Al-Maktoum (unit 404)", assignedTo: "Gulf Maintenance Services", unitId: units["404"].id,
        reportedDate: wDate(WIN, 1, 13), scheduledDate: wDate(WIN, 1, 15), completedDate: wDate(WIN, 1, 16),
        cost: 310, vendorId: vendorMaint.id, vendorName: "Gulf Maintenance Services", isEmergency: false, stageStartedAt: wDate(WIN, 1, 16),
      },
      {
        title: "CCTV camera offline — car park north corner", description: "Camera 12 (north car park) offline. Possible cable fault.",
        category: MaintenanceCategory.SECURITY, priority: MaintenancePriority.MEDIUM, status: MaintenanceStatus.IN_PROGRESS,
        reportedBy: "Security guard", assignedTo: "Techno Systems Bahrain",
        reportedDate: addD(now, -6), scheduledDate: addD(now, 2), isEmergency: false, stageStartedAt: addD(now, -4),
      },
      {
        title: "Rooftop terrace — cracked floor tiles", description: "Section of tiles near water feature cracked and lifted. Trip hazard.",
        category: MaintenanceCategory.STRUCTURAL, priority: MaintenancePriority.LOW, status: MaintenanceStatus.OPEN,
        reportedBy: "Building manager",
        reportedDate: addD(now, -2), isEmergency: false, stageStartedAt: addD(now, -2),
      },
      {
        title: "Leaking shower head — unit 102", description: "Shower head dripping even when fully off. Getting worse.",
        category: MaintenanceCategory.PLUMBING, priority: MaintenancePriority.LOW, status: MaintenanceStatus.OPEN,
        reportedBy: "Priya Sharma", unitId: units["102"].id,
        reportedDate: addD(now, -3), isEmergency: false, portal: true, stageStartedAt: addD(now, -3),
      },
      {
        title: "Bedroom light fixture flickering — unit 305", description: "Main bedroom ceiling light flickers intermittently. Suspected loose connection.",
        category: MaintenanceCategory.ELECTRICAL, priority: MaintenancePriority.MEDIUM, status: MaintenanceStatus.OPEN,
        reportedBy: "Khalid Al-Rumaihi", unitId: units["305"].id,
        reportedDate: addD(now, -1), isEmergency: false, portal: true, stageStartedAt: addD(now, -1),
      },
    ],
  });

  // ── Standalone LEASE_RENEWAL case ────────────────────────────────────────────
  // (The ARREARS case for unit 102 is seeded above by seedArrearsCase — it used
  // to be created twice, once as an ArrearsCase and again as a CaseThread whose
  // subjectId wrongly pointed at the ArrearsCase rather than the tenant.)
  await seedStandaloneCase({
    caseType: "LEASE_RENEWAL", subjectId: tenants["304"].id, organizationId, propertyId: property.id, unitId: units["304"].id,
    title: "Lease renewal — Deepak & Meera Pillai (unit 304)", status: "AWAITING_TENANT", stageIndex: 3, waitingOn: "TENANT",
    stageStartedAt: addD(now, -7), commentBody: "Lease ending soon. Renewal terms sent. Awaiting tenant decision.",
  });

  // ── Compliance certificates ─────────────────────────────────────────────────
  await prisma.complianceCertificate.createMany({
    data: [
      {
        propertyId: property.id,
        organizationId,
        certificateType: "Fire Safety Certificate",
        certificateNumber: "FSC-BH-1142",
        issuedBy: "Bahrain Civil Defence Directorate",
        issueDate: addM(now, -11),
        expiryDate: addD(now, 20),
        notes: "Annual fire safety inspection passed. Renewal due soon.",
      },
      {
        propertyId: property.id,
        organizationId,
        certificateType: "Lift Safety Certificate",
        certificateNumber: "LSC-BH-0443",
        issuedBy: "Ministry of Works — Lift Inspectorate",
        issueDate: addM(now, -4),
        expiryDate: addM(now, 8),
        notes: "Annual statutory lift inspection. ThyssenKrupp lift certified safe for occupancy.",
      },
      {
        propertyId: property.id,
        organizationId,
        certificateType: "Building Completion Certificate",
        certificateNumber: "BCC-MAN-0078",
        issuedBy: "Bahrain Survey & Land Registration Bureau",
        issueDate: subY(now, 5),
        notes: "Original completion certificate. No expiry date.",
      },
    ],
  });

  // ── Building condition report ───────────────────────────────────────────────
  await prisma.buildingConditionReport.create({
    data: {
      propertyId: property.id,
      reportDate: wDate(WIN, 2, 1),
      inspector: "Khalid Al-Saffar, RICS Registered Inspector",
      overallCondition: "Good",
      summary:
        "Al Seef Residences is in good overall condition. Building structure, common areas, and mechanical systems are well-maintained. Minor cosmetic work recommended on the car park floor. CCTV camera fault currently being addressed.",
      nextReviewDate: addM(now, 6),
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

  // ── Owner invoices (management fee — rolling window) ─────────────────────────
  for (let i = 0; i < WIN.length; i++) {
    const paid = i < WIN.length - 1; // current month still SENT
    await prisma.ownerInvoice.create({
      data: {
        invoiceNumber: `OWN-ASR-${propCode}-${WIN[i].y}-${String(WIN[i].m + 1).padStart(2, "0")}-MGMT`,
        propertyId: property.id,
        type: OwnerInvoiceType.MANAGEMENT_FEE,
        periodYear: WIN[i].y,
        periodMonth: WIN[i].m + 1,
        lineItems: [
          { description: "Management fee — 8 one-bedroom units",   units: 8, unitRate: 50,  amount: 400  },
          { description: "Management fee — 9 two-bedroom units",   units: 9, unitRate: 75,  amount: 675  },
          { description: "Management fee — 3 three-bedroom units", units: 3, unitRate: 100, amount: 300  },
        ],
        totalAmount: 1375,
        dueDate: wDate(WIN, i, 10),
        status: paid ? InvoiceStatus.PAID : InvoiceStatus.SENT,
        paidAt: paid ? wDate(WIN, i, 12) : null,
        paidAmount: paid ? 1375 : null,
        notes: `Monthly property management fee — ${new Date(WIN[i].y, WIN[i].m).toLocaleString("en-GB", { month: "long", year: "numeric" })}`,
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
        date: wDate(WIN, 0, 10),
        description: "Monthly service check — oil level, coolant, battery voltage, 30-min load test",
        cost: 65,
        technician: "Ahmed Khalil, Cummins Bahrain",
        vendorId: vendorMaint.id,
        notes: "All systems nominal.",
      },
      {
        assetId: asrAssetMap["Cummins Standby Generator"],
        date: wDate(WIN, 1, 10),
        description: "Monthly service check — routine inspection and load test passed",
        cost: 65,
        technician: "Ahmed Khalil, Cummins Bahrain",
        vendorId: vendorMaint.id,
        notes: "No faults found.",
      },
      {
        assetId: asrAssetMap["ThyssenKrupp Passenger Lift"],
        date: wDate(WIN, 0, 21),
        description: "Unscheduled repair — door sensor replacement, floor 2",
        cost: 340,
        technician: "ThyssenKrupp service technician",
        notes: "Door sensor faulty — replaced. Full door cycle test completed. Back in service.",
      },
      {
        assetId: asrAssetMap["Grundfos Water Pump"],
        date: wDate(WIN, 1, 14),
        description: "Biannual inspection — pressure test, seals check, flow rate measurement",
        cost: 110,
        technician: "Aqua Systems Bahrain technician",
        notes: "Pump within spec. Pressure seal showing minor wear — flagged for next service.",
      },
    ],
  });

  // (Arrears escalation history is seeded with the cases above, as CaseEvents.)

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
// Kilimani Court — Kenya demo (10 units, long-term, Jan–Mar 2026, incl. Cases)
// ─────────────────────────────────────────────────────────────────────────────

async function seedKilimaniCourt(organizationId: string): Promise<{ id: string }> {
  const now = new Date();
  const WIN = recentMonths(3, now); // [2 months ago, last month, current month]

  // ── Property ────────────────────────────────────────────────────────────────
  const property = await prisma.property.create({
    data: {
      name: "Kilimani Court",
      type: PropertyType.LONGTERM,
      category: PropertyCategory.RESIDENTIAL,
      address: "Ngong Road, Kilimani",
      city: "Nairobi",
      description:
        "Modern 3-storey residential block in Kilimani, Nairobi. 10 well-appointed apartments with borehole water, standby generator, lift, secure parking and 24/7 manned security.",
      serviceChargeDefault: 5000,
      organizationId,
      currency: "KES",
    },
  });
  const propCode = property.id.slice(-6).toUpperCase();

  // ── Units (9 occupied + 1 vacant) ────────────────────────────────────────────
  const unitDefs = [
    { number: "G01", type: UnitType.BEDSITTER, rent: 28000,  floor: 0, sqm: 32  },
    { number: "G02", type: UnitType.ONE_BED,   rent: 50000,  floor: 0, sqm: 48  },
    { number: "101", type: UnitType.ONE_BED,   rent: 55000,  floor: 1, sqm: 50  },
    { number: "102", type: UnitType.TWO_BED,   rent: 85000,  floor: 1, sqm: 82  },
    { number: "103", type: UnitType.TWO_BED,   rent: 85000,  floor: 1, sqm: 82  },
    { number: "201", type: UnitType.ONE_BED,   rent: 55000,  floor: 2, sqm: 50  },
    { number: "202", type: UnitType.TWO_BED,   rent: 90000,  floor: 2, sqm: 88  },
    { number: "203", type: UnitType.THREE_BED, rent: 130000, floor: 2, sqm: 120 },
    { number: "301", type: UnitType.TWO_BED,   rent: 95000,  floor: 3, sqm: 90  }, // VACANT
    { number: "302", type: UnitType.THREE_BED, rent: 140000, floor: 3, sqm: 125 },
  ];
  const VACANT = "301";

  const typeLabel = (t: UnitType) =>
    t === UnitType.BEDSITTER ? "Bedsitter" : t === UnitType.ONE_BED ? "1-bedroom" : t === UnitType.TWO_BED ? "2-bedroom" : "3-bedroom";

  const units: Record<string, { id: string }> = {};
  for (const u of unitDefs) {
    units[u.number] = await prisma.unit.create({
      data: {
        unitNumber: u.number,
        propertyId: property.id,
        type: u.type,
        floor: u.floor,
        monthlyRent: u.rent,
        status: u.number === VACANT ? UnitStatus.VACANT : UnitStatus.ACTIVE,
        vacantSince: u.number === VACANT ? wDate(WIN, 1, 15) : null,
        amenities: [
          "Borehole Water",
          "Standby Generator",
          "Secure Parking",
          "24/7 Security",
          ...(u.floor >= 2 ? ["Balcony", "City View"] : []),
        ],
        description: `${typeLabel(u.type)} apartment on floor ${u.floor}`,
        sizeSqm: u.sqm,
      },
    });
  }

  // Service charge + flat management fee by unit type (KES)
  const scFor = (t: UnitType) => (t === UnitType.BEDSITTER ? 3000 : t === UnitType.ONE_BED ? 5000 : t === UnitType.TWO_BED ? 8000 : 12000);
  const mgmtFor = (t: UnitType) => (t === UnitType.BEDSITTER ? 2500 : t === UnitType.ONE_BED ? 4000 : t === UnitType.TWO_BED ? 6000 : 8000);
  const sc = (unitNumber: string) => scFor(unitDefs.find((x) => x.number === unitNumber)!.type);

  // ── Tenants (9 — unit 301 left vacant) ───────────────────────────────────────
  const tenantDefs = [
    { unit: "G01", name: "Brian Otieno",            leaseEnd: "2026-12-31", phone: "+254 722 100 101", email: "brian.otieno@gmail.com",   nationalId: "28456712", portal: true },
    { unit: "G02", name: "Mercy Wanjiru",           leaseEnd: "2027-05-31", phone: "+254 723 100 102", email: "mercy.wanjiru@gmail.com",  nationalId: "31245678" },
    { unit: "101", name: "Kevin Mwangi",            leaseEnd: "2026-11-30", phone: "+254 724 100 103", email: "kevin.mwangi@gmail.com",   nationalId: "29345612" },
    { unit: "102", name: "Grace & Daniel Kamau",    leaseEnd: "2027-01-31", phone: "+254 725 100 104", email: "gd.kamau@gmail.com",       nationalId: "34561230", portal: true },
    { unit: "103", name: "Faith Chebet",            leaseEnd: "2026-12-31", phone: "+254 726 100 105", email: "faith.chebet@gmail.com",   nationalId: "32156789", arrears: true },
    { unit: "201", name: "Samuel Kiprono",          leaseEnd: "2027-03-31", phone: "+254 727 100 106", email: "samuel.kiprono@gmail.com", nationalId: "35678901" },
    { unit: "202", name: "Aisha Mohamed",           leaseEnd: "2027-02-28", phone: "+254 728 100 107", email: "aisha.mohamed@gmail.com",  nationalId: "27890123" },
    { unit: "203", name: "James & Lucy Njoroge",    leaseEnd: "2026-08-31", phone: "+254 729 100 108", email: "jl.njoroge@gmail.com",     nationalId: "33012345", renewal: true },
    { unit: "302", name: "Peter Omondi",            leaseEnd: "2027-04-30", phone: "+254 731 100 110", email: "peter.omondi@gmail.com",   nationalId: "30234567" },
  ] as { unit: string; name: string; leaseEnd: string; phone: string; email: string; nationalId: string; portal?: boolean; arrears?: boolean; renewal?: boolean }[];

  const tenants: Record<string, { id: string }> = {};
  for (const t of tenantDefs) {
    const u = unitDefs.find((x) => x.number === t.unit)!;
    tenants[t.unit] = await prisma.tenant.create({
      data: {
        name: t.name,
        unitId: units[t.unit].id,
        depositAmount: u.rent * 2,
        depositPaidDate: wDate(WIN, 0),
        leaseStart: subY(now, 1),
        leaseEnd: t.renewal ? addM(now, 2) : t.arrears ? addM(now, 8) : addM(now, 13),
        monthlyRent: u.rent,
        serviceCharge: scFor(u.type),
        rentDueDay: 5,
        isActive: true,
        phone: t.phone,
        email: t.email,
        nationalId: t.nationalId,
        renewalStage: t.renewal ? RenewalStage.NOTICE_SENT : RenewalStage.NONE,
        proposedRent: t.renewal ? Math.round(u.rent * 1.08) : null,
        proposedLeaseEnd: t.renewal ? addM(now, 14) : null,
        notes: t.renewal ? "Lease ending soon. Renewal notice sent — proposed 8% escalation. Awaiting tenant response." : null,
        portalToken: t.portal ? crypto.randomUUID() : null,
        portalTokenExpiresAt: t.portal ? addM(now, 12) : null,
      },
    });
  }

  // ── Per-unit management fee configs ──────────────────────────────────────────
  await prisma.managementFeeConfig.createMany({
    data: unitDefs.map((u) => ({
      unitId: units[u.number].id,
      flatAmount: mgmtFor(u.type),
      ratePercent: 0,
      effectiveFrom: wDate(WIN, 0),
    })),
  });

  // ── Income & invoices (rolling 3-month window) ───────────────────────────────
  // Arrears: Faith Chebet (103) misses the latest 2 months (incl. current).
  const arrears: Record<string, number[]> = { "103": [1, 2] };
  let invoiceSeq = 1;
  const incomeEntryData: {
    date: Date; unitId: string; tenantId: string; invoiceId: string;
    type: IncomeType; grossAmount: number; agentCommission: number; paymentMethod: "MPESA" | "BANK_TRANSFER";
  }[] = [];

  for (let i = 0; i < WIN.length; i++) {
    for (const t of tenantDefs) {
      const u = unitDefs.find((x) => x.number === t.unit)!;
      const serviceCharge = scFor(u.type);
      const grossAmount = u.rent + serviceCharge;
      const isArrears = (arrears[t.unit] ?? []).includes(i);

      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber: `KMC-${propCode}-${WIN[i].y}-${String(WIN[i].m + 1).padStart(2, "0")}-${String(invoiceSeq++).padStart(3, "0")}`,
          tenantId: tenants[t.unit].id,
          periodYear: WIN[i].y,
          periodMonth: WIN[i].m + 1,
          rentAmount: u.rent,
          serviceCharge,
          totalAmount: grossAmount,
          dueDate: wDate(WIN, i, 5),
          status: isArrears ? InvoiceStatus.OVERDUE : InvoiceStatus.PAID,
          paidAt: isArrears ? null : wDate(WIN, i, 3),
          paidAmount: isArrears ? null : grossAmount,
        },
      });

      if (!isArrears) {
        incomeEntryData.push({
          date: wDate(WIN, i),
          unitId: units[t.unit].id,
          tenantId: tenants[t.unit].id,
          invoiceId: invoice.id,
          type: IncomeType.LONGTERM_RENT,
          grossAmount,
          agentCommission: 0,
          paymentMethod: t.unit === "G01" || t.unit === "102" ? "MPESA" : "BANK_TRANSFER",
        });
      }
    }
  }
  await prisma.incomeEntry.createMany({ data: incomeEntryData });

  // ── Property-level monthly expenses ──────────────────────────────────────────
  const monthlyPropExpenses = [
    { category: ExpenseCategory.MANAGEMENT_FEE,     amount: 48000, desc: "Monthly management fee — Kilimani Court" },
    { category: ExpenseCategory.WATER,              amount: 18000, desc: "Nairobi Water & Sewerage — building supply" },
    { category: ExpenseCategory.ELECTRICITY,        amount: 24000, desc: "KPLC — common areas, lift, borehole pump & security lighting" },
    { category: ExpenseCategory.WIFI,               amount: 12000, desc: "Safaricom Fibre — building internet" },
    { category: ExpenseCategory.SECURITY,           amount: 45000, desc: "Lavington Security Ltd — 3 guards, 24/7 cover" },
    { category: ExpenseCategory.GARBAGE_COLLECTION, amount: 8000,  desc: "Taka Taka Solutions — weekly waste collection" },
    { category: ExpenseCategory.CLEANER,            amount: 22000, desc: "Common area cleaning — 2 staff" },
  ];
  await prisma.expenseEntry.createMany({
    data: WIN.flatMap((_, i) =>
      monthlyPropExpenses.map((e) => ({
        date: wDate(WIN, i),
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

  // ── Unit-level ad-hoc expenses ───────────────────────────────────────────────
  await prisma.expenseEntry.createMany({
    data: [
      { month: 0, unit: "102", cat: ExpenseCategory.MAINTENANCE,   amount: 6500,  desc: "Plumbing — kitchen mixer tap replacement",       sunk: false },
      { month: 1, unit: "201", cat: ExpenseCategory.MAINTENANCE,   amount: 4200,  desc: "Electrical — socket & circuit repair",            sunk: false },
      { month: 1, unit: "302", cat: ExpenseCategory.MAINTENANCE,   amount: 18500, desc: "Water heater replacement — master ensuite",       sunk: true  },
      { month: 2, unit: "301", cat: ExpenseCategory.REINSTATEMENT, amount: 32000, desc: "Repaint & deep clean — turnover of vacated unit",  sunk: true  },
    ].map((e) => ({
      date: wDate(WIN, e.month),
      unitId: units[e.unit].id,
      scope: ExpenseScope.UNIT,
      category: e.cat,
      amount: e.amount,
      description: e.desc,
      isSunkCost: e.sunk,
      paidFromPettyCash: false,
    })),
  });

  // ── Petty cash ───────────────────────────────────────────────────────────────
  await prisma.pettyCash.createMany({
    data: [
      ...WIN.map((_, i) => ({
        date: wDate(WIN, i),
        type: PettyCashType.IN,
        amount: 15000,
        description: "Monthly petty cash top-up",
        propertyId: property.id,
      })),
      ...([
        { month: 0, day: 7,  amount: 1200, desc: "Light bulbs & fittings — corridors" },
        { month: 0, day: 16, amount: 3500, desc: "Emergency plumber call-out — G02 blockage" },
        { month: 0, day: 24, amount: 800,  desc: "Stationery & notice printing" },
        { month: 1, day: 5,  amount: 2600, desc: "Cleaning materials restock" },
        { month: 1, day: 14, amount: 4500, desc: "Generator diesel top-up" },
        { month: 1, day: 21, amount: 1500, desc: "Replacement padlocks — gate & store" },
        { month: 2, day: 8,  amount: 3000, desc: "Garden tools & landscaping supplies" },
        { month: 2, day: 18, amount: 2200, desc: "Minor plumbing repairs — common WC" },
        { month: 2, day: 26, amount: 900,  desc: "Courier & lease document printing" },
      ] as { month: number; day: number; amount: number; desc: string }[]).map((p) => ({
        date: wDate(WIN, p.month, p.day),
        type: PettyCashType.OUT,
        amount: p.amount,
        description: p.desc,
        propertyId: property.id,
      })),
    ],
  });

  // ── Insurance policies ───────────────────────────────────────────────────────
  await prisma.insurancePolicy.createMany({
    data: [
      {
        propertyId: property.id,
        type: InsuranceType.BUILDING,
        insurer: "Jubilee Insurance",
        policyNumber: "JUB-BLD-0451",
        startDate: addM(now, -6),
        endDate: addM(now, 6),
        premiumAmount: 320000,
        premiumFrequency: PremiumFrequency.ANNUALLY,
        coverageAmount: 180000000,
        brokerName: "ICEA Lion Brokers",
        brokerContact: "+254 20 275 0000",
        notes: "Full building structure & fixtures cover.",
      },
      {
        propertyId: property.id,
        type: InsuranceType.PUBLIC_LIABILITY,
        insurer: "Britam General Insurance",
        policyNumber: "BRT-PL-0218",
        startDate: addM(now, -11),
        endDate: addD(now, 25),
        premiumAmount: 85000,
        premiumFrequency: PremiumFrequency.ANNUALLY,
        coverageAmount: 20000000,
        brokerName: "ICEA Lion Brokers",
        brokerContact: "+254 20 275 0000",
        notes: "Third-party injury & property damage within common areas.",
      },
    ],
  });

  // ── Vendors ──────────────────────────────────────────────────────────────────
  const [vPlumb, vElec, vSec, vGen] = await Promise.all([
    prisma.vendor.create({ data: { name: "MajiFix Plumbers", category: VendorCategory.CONTRACTOR, phone: "+254 720 334 455", email: "jobs@majifix.co.ke", taxId: "P051234567A", bankDetails: "M-Pesa Paybill 400200", organizationId, isActive: true, notes: "Plumbing & drainage contractor." } }),
    prisma.vendor.create({ data: { name: "Brightline Electrical", category: VendorCategory.CONTRACTOR, phone: "+254 721 556 677", email: "info@brightline.co.ke", taxId: "P052345678B", organizationId, isActive: true, notes: "Licensed electrical contractor." } }),
    prisma.vendor.create({ data: { name: "Lavington Security Ltd", category: VendorCategory.SERVICE_PROVIDER, phone: "+254 733 778 899", email: "ops@lavsec.co.ke", taxId: "P053456789C", organizationId, isActive: true, notes: "Manned guarding — 24/7 cover." } }),
    prisma.vendor.create({ data: { name: "PowerGen Kenya", category: VendorCategory.CONTRACTOR, phone: "+254 722 889 900", email: "service@powergen.co.ke", taxId: "P054567890D", organizationId, isActive: true, notes: "Standby generator service & repairs." } }),
  ]);

  // ── Agent ────────────────────────────────────────────────────────────────────
  await prisma.agent.create({
    data: {
      organizationId,
      name: "Nairobi Lettings Co.",
      phone: "+254 709 100 200",
      email: "lettings@nairobilettings.co.ke",
      agency: "Nairobi Lettings Co.",
      notes: "Primary letting agent for Kilimani Court.",
    },
  });

  // ── Management agreement (KPI + SLA targets feed case SLAs) ──────────────────
  await prisma.managementAgreement.create({
    data: {
      propertyId: property.id,
      managementFeeRate: 10.0,
      vacancyFeeRate: 5.0,
      vacancyFeeThresholdMonths: 6,
      newLettingFeeRate: 50.0,
      leaseRenewalFeeFlat: 8000,
      repairAuthorityLimit: 20000,
      rentRemittanceDay: 7,
      mgmtFeeInvoiceDay: 5,
      landlordPaymentDays: 3,
      kpiStartDate: subY(now, 1),
      kpiOccupancyTarget: 90,
      kpiRentCollectionTarget: 92,
      kpiExpenseRatioTarget: 80,
      kpiDaysToLeaseTarget: 30,
      kpiRenewalRateTarget: 80,
      kpiMaintenanceCompletionTarget: 95,
      kpiEmergencyResponseHrs: 4,
      kpiStandardResponseHrs: 48,
    },
  });

  // ── Rent history ─────────────────────────────────────────────────────────────
  await prisma.rentHistory.createMany({
    data: [
      { tenantId: tenants["G02"].id, monthlyRent: 47000,  effectiveDate: d("2025-01-01"), reason: "Previous lease rate" },
      { tenantId: tenants["102"].id, monthlyRent: 80000,  effectiveDate: d("2025-01-01"), reason: "Previous lease rate" },
      { tenantId: tenants["203"].id, monthlyRent: 122000, effectiveDate: d("2025-01-01"), reason: "Previous lease rate" },
      { tenantId: tenants["302"].id, monthlyRent: 132000, effectiveDate: d("2025-01-01"), reason: "Previous lease rate" },
      ...tenantDefs.map((t) => ({
        tenantId: tenants[t.unit].id,
        monthlyRent: unitDefs.find((x) => x.number === t.unit)!.rent,
        effectiveDate: d("2026-01-01"),
        reason: "Lease commencement / annual review",
      })),
    ],
  });

  // ── Assets + maintenance schedules ───────────────────────────────────────────
  const assetDefs = [
    { name: "Grundfos Borehole Pump", category: AssetCategory.PLUMBING,  serial: "GRF-BH-2023-0091", cost: 280000, provider: "MajiFix Plumbers",     contact: "+254 720 334 455", sched: { taskName: "Quarterly Borehole Pump Service", frequency: MaintenanceFrequency.QUARTERLY, nextDue: d("2026-06-01"), estimatedCost: 12000 } },
    { name: "Perkins 60kVA Standby Generator", category: AssetCategory.GENERATOR, serial: "PRK-60-2022-0033", cost: 1450000, provider: "PowerGen Kenya", contact: "+254 722 889 900", sched: { taskName: "Monthly Generator Service Check", frequency: MaintenanceFrequency.MONTHLY, nextDue: d("2026-06-10"), estimatedCost: 8000 } },
    { name: "Kone Passenger Lift", category: AssetCategory.LIFT, serial: "KON-MRL-2021-KE-007", cost: 3200000, provider: "Kone East Africa", contact: "+254 20 386 1000", sched: { taskName: "Quarterly Lift Servicing", frequency: MaintenanceFrequency.QUARTERLY, nextDue: d("2026-06-01"), estimatedCost: 18000 } },
    { name: "Hikvision 8-Channel CCTV", category: AssetCategory.SECURITY, serial: "HIK-8CH-2023-KE", cost: 145000, provider: "Lavington Security Ltd", contact: "+254 733 778 899", sched: { taskName: "Annual CCTV Maintenance", frequency: MaintenanceFrequency.ANNUALLY, nextDue: d("2026-09-01"), estimatedCost: 15000 } },
  ];
  for (const a of assetDefs) {
    const asset = await prisma.asset.create({
      data: {
        propertyId: property.id,
        name: a.name,
        category: a.category,
        serialNumber: a.serial,
        purchaseDate: subY(now, 3),
        purchaseCost: a.cost,
        serviceProvider: a.provider,
        serviceContact: a.contact,
      },
    });
    await prisma.assetMaintenanceSchedule.create({
      data: {
        assetId: asset.id,
        propertyId: property.id,
        taskName: a.sched.taskName,
        frequency: a.sched.frequency,
        nextDue: addM(now, 1),
        isActive: true,
        estimatedCost: a.sched.estimatedCost,
      },
    });
  }

  // ── Recurring expenses ───────────────────────────────────────────────────────
  await prisma.recurringExpense.createMany({
    data: [
      { description: "Manned Security — Lavington Security Ltd", category: ExpenseCategory.SECURITY,           amount: 45000, scope: ExpenseScope.PROPERTY, propertyId: property.id, vendorId: vSec.id,  frequency: RecurringFrequency.MONTHLY,   nextDueDate: addM(now, 1), isActive: true },
      { description: "Garbage Collection — Taka Taka Solutions",  category: ExpenseCategory.GARBAGE_COLLECTION, amount: 8000,  scope: ExpenseScope.PROPERTY, propertyId: property.id,                    frequency: RecurringFrequency.MONTHLY,   nextDueDate: addM(now, 1), isActive: true },
      { description: "Landscaping & Grounds Maintenance",          category: ExpenseCategory.LANDSCAPING,        amount: 10000, scope: ExpenseScope.PROPERTY, propertyId: property.id,                    frequency: RecurringFrequency.MONTHLY,   nextDueDate: addM(now, 1), isActive: true },
      { description: "Quarterly Generator Service — PowerGen",     category: ExpenseCategory.MAINTENANCE,        amount: 24000, scope: ExpenseScope.PROPERTY, propertyId: property.id, vendorId: vGen.id,  frequency: RecurringFrequency.QUARTERLY, nextDueDate: addM(now, 2), isActive: true },
    ],
  });

  // ── Arrears case + escalation history (Faith Chebet, unit 103) ───────────────
  await seedArrearsCase({
    tenantId: tenants["103"].id,
    tenantName: "Faith Chebet",
    organizationId,
    propertyId: property.id,
    unitId: units["103"].id,
    stageKey: "demand_letter",
    status: "AWAITING_TENANT",
    waitingOn: "TENANT",
    stageStartedAt: wDate(WIN, 2, 2),
    openedNote: "Rent unpaid for the last two months (KES 93,000 × 2). Informal reminders ignored. Demand letter issued.",
    escalations: [
      { stageKey: "informal_reminder", notes: "M-Pesa reminder & call. Tenant cited delayed salary.",          createdAt: wDate(WIN, 1, 8) },
      { stageKey: "informal_reminder", notes: "Follow-up call. Promised payment by month-end — not received.", createdAt: wDate(WIN, 1, 20) },
      { stageKey: "demand_letter",     notes: "Demand letter hand-delivered. 14-day window given.",            createdAt: wDate(WIN, 2, 2) },
    ],
  });

  // ── Compliance certificates ──────────────────────────────────────────────────
  await prisma.complianceCertificate.createMany({
    data: [
      { propertyId: property.id, organizationId, certificateType: "Fire Safety Certificate", certificateNumber: "FSC-NRB-3391", issuedBy: "Nairobi City County Fire Brigade", issueDate: addM(now, -11), expiryDate: addD(now, 20), notes: "Annual fire safety inspection. Extinguishers & hose reels compliant. Renewal due soon." },
      { propertyId: property.id, organizationId, certificateType: "Single Business Permit", certificateNumber: "SBP-NRB-1180", issuedBy: "Nairobi City County", issueDate: addM(now, -4), expiryDate: addM(now, 8), notes: "County business permit for rental operations." },
      { propertyId: property.id, organizationId, certificateType: "Occupancy Certificate", certificateNumber: "OCC-NRB-0455", issuedBy: "Nairobi City County — Development Control", issueDate: subY(now, 5), notes: "Original occupancy certificate. No expiry." },
    ],
  });

  // ── Building condition report ────────────────────────────────────────────────
  await prisma.buildingConditionReport.create({
    data: {
      propertyId: property.id,
      reportDate: wDate(WIN, 2, 1),
      inspector: "Eng. Wanjiku Maina, Registered Inspector",
      overallCondition: "Good",
      summary:
        "Kilimani Court is in good overall condition. Structure, common areas and services are well-maintained. Borehole pump and generator serviced. Fire safety certificate renewal due soon. One unit (301) vacant and being turned around.",
      nextReviewDate: addM(now, 6),
      items: [
        { area: "Roof & Gutters",         condition: "Good",      notes: "No leaks. Gutters cleared." },
        { area: "Exterior & Paint",       condition: "Good",      notes: "Facade clean. Minor touch-ups scheduled." },
        { area: "Common Areas",           condition: "Very Good", notes: "Well-lit and clean." },
        { area: "Lift & Machine Room",    condition: "Good",      notes: "Serviced; next quarterly service upcoming." },
        { area: "Borehole & Water",       condition: "Good",      notes: "Pump within spec; tanks clean." },
        { area: "Generator",              condition: "Good",      notes: "Load-tested monthly. Diesel topped up." },
        { area: "Parking & Grounds",      condition: "Fair",      notes: "Resurfacing of one bay recommended." },
        { area: "Fire Safety",            condition: "Good",      notes: "Certificate renewal due soon." },
        { area: "Security & CCTV",        condition: "Good",      notes: "8 cameras operational; guards 24/7." },
      ],
    },
  });

  // ── Owner invoices (management fee — rolling window) ─────────────────────────
  const mgmtTotal = unitDefs.reduce((s, u) => s + mgmtFor(u.type), 0);
  for (let i = 0; i < WIN.length; i++) {
    const paid = i < WIN.length - 1; // current month still SENT
    await prisma.ownerInvoice.create({
      data: {
        invoiceNumber: `OWN-KMC-${propCode}-${WIN[i].y}-${String(WIN[i].m + 1).padStart(2, "0")}-MGMT`,
        propertyId: property.id,
        type: OwnerInvoiceType.MANAGEMENT_FEE,
        periodYear: WIN[i].y,
        periodMonth: WIN[i].m + 1,
        lineItems: [
          { description: "Management fee — 1 bedsitter",     units: 1, unitRate: 2500, amount: 2500  },
          { description: "Management fee — 3 one-bedroom",   units: 3, unitRate: 4000, amount: 12000 },
          { description: "Management fee — 4 two-bedroom",   units: 4, unitRate: 6000, amount: 24000 },
          { description: "Management fee — 2 three-bedroom", units: 2, unitRate: 8000, amount: 16000 },
        ],
        totalAmount: mgmtTotal,
        dueDate: wDate(WIN, i, 5),
        status: paid ? InvoiceStatus.PAID : InvoiceStatus.SENT,
        paidAt: paid ? wDate(WIN, i, 7) : null,
        paidAmount: paid ? mgmtTotal : null,
        notes: `Monthly management fee — ${new Date(WIN[i].y, WIN[i].m).toLocaleString("en-GB", { month: "long", year: "numeric" })}`,
      },
    });
  }

  // ── Maintenance jobs + linked Cases ──────────────────────────────────────────
  // DONE jobs sit in earlier window months; active jobs are in the current month
  // with stageStartedAt a few days back so SLA deadlines land near/after today.
  const allUnitIds = Object.values(units).map((u) => u.id);
  await seedMaintenanceJobsWithCases({
    organizationId, propertyId: property.id, allUnitIds,
    agreement: { kpiEmergencyResponseHrs: 4, kpiStandardResponseHrs: 48 },
    jobs: [
      {
        title: "Kitchen mixer tap replacement — unit 102", description: "Mixer tap dripping continuously. Tenant reported via call.",
        category: MaintenanceCategory.PLUMBING, priority: MaintenancePriority.MEDIUM, status: MaintenanceStatus.DONE,
        reportedBy: "Grace Kamau (unit 102)", assignedTo: "MajiFix Plumbers", unitId: units["102"].id,
        reportedDate: wDate(WIN, 0, 12), scheduledDate: wDate(WIN, 0, 14), completedDate: wDate(WIN, 0, 14),
        cost: 6500, vendorId: vPlumb.id, vendorName: "MajiFix Plumbers", isEmergency: false, stageStartedAt: wDate(WIN, 0, 14),
      },
      {
        title: "Socket & circuit repair — unit 201", description: "Bedroom sockets dead after a trip. Suspected loose wiring.",
        category: MaintenanceCategory.ELECTRICAL, priority: MaintenancePriority.MEDIUM, status: MaintenanceStatus.DONE,
        reportedBy: "Samuel Kiprono (unit 201)", assignedTo: "Brightline Electrical", unitId: units["201"].id,
        reportedDate: wDate(WIN, 1, 6), scheduledDate: wDate(WIN, 1, 8), completedDate: wDate(WIN, 1, 8),
        cost: 4200, vendorId: vElec.id, vendorName: "Brightline Electrical", isEmergency: false, stageStartedAt: wDate(WIN, 1, 8),
      },
      {
        title: "Water heater replacement — unit 302", description: "Instant water heater failed in master ensuite. No hot water.",
        category: MaintenanceCategory.APPLIANCE, priority: MaintenancePriority.HIGH, status: MaintenanceStatus.DONE,
        reportedBy: "Peter Omondi (unit 302)", assignedTo: "Brightline Electrical", unitId: units["302"].id,
        reportedDate: wDate(WIN, 1, 18), scheduledDate: wDate(WIN, 1, 20), completedDate: wDate(WIN, 1, 21),
        cost: 18500, vendorId: vElec.id, vendorName: "Brightline Electrical", isEmergency: true, stageStartedAt: wDate(WIN, 1, 21),
      },
      {
        title: "Lift intermittent door fault", description: "Lift door occasionally fails to close on floor 2. Reported by several tenants.",
        category: MaintenanceCategory.OTHER, priority: MaintenancePriority.HIGH, status: MaintenanceStatus.IN_PROGRESS,
        reportedBy: "Building caretaker", assignedTo: "Kone East Africa",
        reportedDate: addD(now, -7), scheduledDate: addD(now, 2),
        isEmergency: false, stageStartedAt: addD(now, -3),
      },
      {
        title: "Borehole pump losing pressure", description: "Upper-floor units reporting low water pressure mornings. Pump inspection needed.",
        category: MaintenanceCategory.PLUMBING, priority: MaintenancePriority.HIGH, status: MaintenanceStatus.IN_PROGRESS,
        reportedBy: "Caretaker", assignedTo: "MajiFix Plumbers",
        reportedDate: addD(now, -5), scheduledDate: addD(now, 1),
        vendorId: vPlumb.id, vendorName: "MajiFix Plumbers", isEmergency: false, stageStartedAt: addD(now, -6),
      },
      {
        title: "Leaking shower head — unit G01", description: "Shower head drips even when fully closed. Worsening.",
        category: MaintenanceCategory.PLUMBING, priority: MaintenancePriority.LOW, status: MaintenanceStatus.OPEN,
        reportedBy: "Brian Otieno", unitId: units["G01"].id,
        reportedDate: addD(now, -4), isEmergency: false, portal: true, stageStartedAt: addD(now, -4),
      },
      {
        title: "Bedroom light flickering — unit 203", description: "Main bedroom ceiling light flickers. Suspected loose connection.",
        category: MaintenanceCategory.ELECTRICAL, priority: MaintenancePriority.MEDIUM, status: MaintenanceStatus.OPEN,
        reportedBy: "Lucy Njoroge", unitId: units["203"].id,
        reportedDate: addD(now, -1), isEmergency: false, portal: true, stageStartedAt: addD(now, -1),
      },
    ],
  });

  // ── Standalone LEASE_RENEWAL case ────────────────────────────────────────────
  // (Faith Chebet's arrears case is seeded above by seedArrearsCase.)
  await seedStandaloneCase({
    caseType: "LEASE_RENEWAL", subjectId: tenants["203"].id, organizationId, propertyId: property.id, unitId: units["203"].id,
    title: "Lease renewal — James & Lucy Njoroge (unit 203)", status: "AWAITING_TENANT", stageIndex: 3, waitingOn: "TENANT",
    stageStartedAt: addD(now, -8),
    commentBody: "Lease ending soon. Renewal terms sent with proposed 8% escalation. Awaiting tenant decision.",
  });

  // ── Tax configuration (Kenya VAT 16%) ────────────────────────────────────────
  await prisma.taxConfiguration.createMany({
    data: [
      {
        orgId: organizationId,
        propertyId: property.id,
        label: "VAT — Management & Letting Fees",
        rate: 0.16,
        type: TaxType.ADDITIVE,
        appliesTo: ["MANAGEMENT_FEE_INCOME", "LETTING_FEE_INCOME"],
        isInclusive: false,
        effectiveFrom: subY(now, 1),
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
  const now = new Date();
  const WIN = recentMonths(4, now); // last 4 months incl current; MONTHS below indexes into WIN

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
        depositPaidDate: wDate(WIN, 0),
        leaseStart: subY(now, 1),
        leaseEnd: t.unit === "303" ? addM(now, 2) : t.unit === "102" || t.unit === "302" ? addM(now, 9) : addM(now, 14),
        monthlyRent: t.rent,
        serviceCharge: sc(t.unit),
        rentDueDay: 1,
        isActive: true,
        phone: t.phone,
        email: t.email,
        nationalId: t.nationalId,
        renewalStage: t.unit === "303" ? RenewalStage.NOTICE_SENT : RenewalStage.NONE,
        proposedRent: t.unit === "303" ? Math.round(t.rent * 1.07) : null,
        proposedLeaseEnd: t.unit === "303" ? addM(now, 14) : null,
        notes: t.unit === "303" ? "Lease ending soon. Renewal notice sent — proposed 7% escalation. Awaiting tenant response." : null,
      },
    });
  }

  // ── Management fee configs ──────────────────────────────────────────────────
  await prisma.managementFeeConfig.createMany({
    data: unitDefs.map((u) => ({
      unitId: units[u.number].id,
      flatAmount: u.type === UnitType.ONE_BED ? 850 : u.type === UnitType.TWO_BED ? 1100 : 1500,
      ratePercent: 0,
      effectiveFrom: wDate(WIN, 0),
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

  // ── Income & invoices (rolling 4-month window) ───────────────────────────────
  const MONTHS = [0, 1, 2, 3]; // indices into WIN (oldest → current)
  // Arrears: unit 102 misses the latest 3 months; unit 302 misses the latest 2 (incl current)
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

      const invoiceNum = `SH-${propCode}-${WIN[month].y}-${String(WIN[month].m + 1).padStart(2, "0")}-${String(
        invoiceSeq++
      ).padStart(3, "0")}`;

      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber: invoiceNum,
          tenantId: tenant.id,
          periodYear: WIN[month].y,
          periodMonth: WIN[month].m + 1,
          rentAmount: t.rent,
          serviceCharge,
          totalAmount: grossAmount,
          dueDate: wDate(WIN, month, 5),
          status: isArrears ? InvoiceStatus.OVERDUE : InvoiceStatus.PAID,
          paidAt: isArrears ? null : wDate(WIN, month, 1),
          paidAmount: isArrears ? null : grossAmount,
        },
      });

      if (!isArrears) {
        incomeEntryData.push({
          date: wDate(WIN, month),
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
        date: wDate(WIN, month),
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
        date: wDate(WIN, 0),
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
        date: wDate(WIN, 1),
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
        date: wDate(WIN, 1),
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
        date: wDate(WIN, 2),
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
        date: wDate(WIN, 3),
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
        date: wDate(WIN, month),
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
        date: wDate(WIN, p.month, p.day),
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
        policyNumber: "SAN-BLD-4421",
        startDate: addM(now, -6),
        endDate: addM(now, 6),
        premiumAmount: 18500,
        premiumFrequency: PremiumFrequency.ANNUALLY,
        coverageAmount: 8000000,
        brokerName: "Marsh South Africa",
        brokerContact: "+27 11 060 7100",
        notes: "Full building structure coverage.",
      },
      {
        propertyId: property.id,
        type: InsuranceType.PUBLIC_LIABILITY,
        insurer: "Old Mutual Insure",
        policyNumber: "OMI-PL-0312",
        startDate: addM(now, -5),
        endDate: addD(now, 25),
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
        purchaseDate: subY(now, 3),
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
        nextDue: addM(now, 1),
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
        nextDueDate: addM(now, 1),
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
        nextDueDate: addM(now, 1),
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
        nextDueDate: addM(now, 2),
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
        nextDueDate: addM(now, 6),
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
  // Unit 102: 3 months overdue (R9,000 × 3 = R27,000)
  await seedArrearsCase({
    tenantId: tenants["102"].id,
    tenantName: "Priya Naidoo",
    organizationId,
    propertyId: property.id,
    unitId: units["102"].id,
    stageKey: "demand_letter",
    status: "AWAITING_TENANT",
    waitingOn: "TENANT",
    stageStartedAt: wDate(WIN, 2, 20),
    openedNote:
      "Tenant has not paid rent for the last three months (R9,000 × 3). Section 4 notice issued. Court proceedings under review if no settlement soon.",
    escalations: [
      { stageKey: "informal_reminder", notes: "WhatsApp reminder sent. Tenant read message but did not respond.", createdAt: wDate(WIN, 1, 5) },
      { stageKey: "informal_reminder", notes: "Phone call. Tenant cited financial difficulty — requested 2-week extension. Following month also missed.", createdAt: wDate(WIN, 1, 18) },
      { stageKey: "demand_letter",     notes: "Section 4 notice issued via registered post. 20-business-day compliance window.", createdAt: wDate(WIN, 2, 20) },
      { stageKey: "demand_letter",     notes: "Current month also unpaid. Total arrears R27,000. Compliance window expired. Court application being prepared.", createdAt: wDate(WIN, 3, 15) },
    ],
  });

  // Unit 302: 2 months overdue (incl current) = R15,150 × 2 = R30,300
  await seedArrearsCase({
    tenantId: tenants["302"].id,
    tenantName: "Rajesh Govender",
    organizationId,
    propertyId: property.id,
    unitId: units["302"].id,
    stageKey: "informal_reminder",
    status: "AWAITING_TENANT",
    waitingOn: "TENANT",
    stageStartedAt: wDate(WIN, 3, 10),
    openedNote:
      "Last two months' rent outstanding (R14,500 + R650 service charge = R15,150 × 2). Tenant unresponsive. Escalation to formal demand under review.",
    escalations: [
      { stageKey: "informal_reminder", notes: "WhatsApp reminder sent. Tenant acknowledged and promised payment within a week.", createdAt: wDate(WIN, 2, 8) },
      { stageKey: "informal_reminder", notes: "Follow-up call. Tenant did not pay by promised date. Escalation under review.", createdAt: wDate(WIN, 2, 20) },
      { stageKey: "informal_reminder", notes: "Current month also not paid. Total arrears R30,300. Formal demand letter to be issued if not settled soon.", createdAt: wDate(WIN, 3, 10) },
    ],
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
      kpiStartDate: subY(now, 1),
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
      { tenantId: tenants["101"].id, monthlyRent: 7800,  effectiveDate: subY(now, 1), reason: "Previous lease rate" },
      { tenantId: tenants["103"].id, monthlyRent: 12500, effectiveDate: subY(now, 1), reason: "Previous lease rate" },
      { tenantId: tenants["203"].id, monthlyRent: 18000, effectiveDate: subY(now, 1), reason: "Previous lease rate" },
      { tenantId: tenants["303"].id, monthlyRent: 18500, effectiveDate: subY(now, 1), reason: "Previous lease rate" },
      // Lease commencement / annual review records
      ...tenantDefs.map((t) => ({
        tenantId: tenants[t.unit].id,
        monthlyRent: t.rent,
        effectiveDate: wDate(WIN, 0),
        reason: "Lease commencement / annual review",
      })),
    ],
  });

  // ── Maintenance jobs + linked Cases ──────────────────────────────────────────
  await seedMaintenanceJobsWithCases({
    organizationId, propertyId: property.id, allUnitIds: Object.values(units).map((u) => u.id),
    agreement: { kpiEmergencyResponseHrs: 4, kpiStandardResponseHrs: 48 },
    jobs: [
      {
        title: "Geyser element failure — unit 103", description: "No hot water in unit 103. Geyser element failed overnight.",
        category: MaintenanceCategory.PLUMBING, priority: MaintenancePriority.HIGH, status: MaintenanceStatus.DONE,
        reportedBy: "Thabo Mokoena (unit 103)", assignedTo: "BuildFix SA", unitId: units["103"].id,
        reportedDate: wDate(WIN, 0, 8), scheduledDate: wDate(WIN, 0, 9), completedDate: wDate(WIN, 0, 9),
        cost: 1800, vendorId: shVendorMaint.id, vendorName: "BuildFix SA", isEmergency: true, stageStartedAt: wDate(WIN, 0, 9),
      },
      {
        title: "Generator — fuel system service post load-shedding", description: "Generator ran for extended periods during load-shedding. Full service required.",
        category: MaintenanceCategory.OTHER, priority: MaintenancePriority.HIGH, status: MaintenanceStatus.DONE,
        reportedBy: "Building manager", assignedTo: "Agrico Equipment",
        reportedDate: wDate(WIN, 0, 20), scheduledDate: wDate(WIN, 0, 22), completedDate: wDate(WIN, 0, 23),
        cost: 2400, vendorId: shVendorAgrico.id, vendorName: "Agrico Equipment", isEmergency: false, stageStartedAt: wDate(WIN, 0, 23),
      },
      {
        title: "DB board trip — intermittent fault unit 201", description: "Main DB board tripping after power restoration from load-shedding.",
        category: MaintenanceCategory.ELECTRICAL, priority: MaintenancePriority.MEDIUM, status: MaintenanceStatus.DONE,
        reportedBy: "Johan van der Merwe (unit 201)", assignedTo: "Sparks Electrical", unitId: units["201"].id,
        reportedDate: wDate(WIN, 1, 7), scheduledDate: wDate(WIN, 1, 9), completedDate: wDate(WIN, 1, 9),
        cost: 950, vendorId: shVendorSparks.id, vendorName: "Sparks Electrical", isEmergency: false, stageStartedAt: wDate(WIN, 1, 9),
      },
      {
        title: "Air conditioning compressor failure — master bedroom unit 203", description: "Split A/C unit in master bedroom not cooling. Compressor failure confirmed.",
        category: MaintenanceCategory.APPLIANCE, priority: MaintenancePriority.HIGH, status: MaintenanceStatus.DONE,
        reportedBy: "Lungelo Khumalo (unit 203)", assignedTo: "BuildFix SA", unitId: units["203"].id,
        reportedDate: wDate(WIN, 1, 14), scheduledDate: wDate(WIN, 1, 16), completedDate: wDate(WIN, 1, 17),
        cost: 4200, vendorId: shVendorMaint.id, vendorName: "BuildFix SA", isEmergency: false, stageStartedAt: wDate(WIN, 1, 17),
      },
      {
        title: "Security gate motor fault — basement entry", description: "Automated gate to basement parking not opening. Motor fault diagnosed and replaced.",
        category: MaintenanceCategory.SECURITY, priority: MaintenancePriority.MEDIUM, status: MaintenanceStatus.DONE,
        reportedBy: "Multiple tenants", assignedTo: "ADT Security",
        reportedDate: wDate(WIN, 2, 5), scheduledDate: wDate(WIN, 2, 8), completedDate: wDate(WIN, 2, 10),
        cost: 8500, vendorId: shVendorADT.id, vendorName: "ADT Security", isEmergency: false, stageStartedAt: wDate(WIN, 2, 10),
      },
      {
        title: "Drain blockage — ground floor common bathroom", description: "Drain in ground floor staff bathroom blocking repeatedly.",
        category: MaintenanceCategory.PLUMBING, priority: MaintenancePriority.LOW, status: MaintenanceStatus.IN_PROGRESS,
        reportedBy: "Cleaning staff", assignedTo: "BuildFix SA",
        reportedDate: addD(now, -6), scheduledDate: addD(now, 2), vendorId: shVendorMaint.id, vendorName: "BuildFix SA",
        isEmergency: false, stageStartedAt: addD(now, -4),
      },
      {
        title: "Blocked kitchen drain — unit 101", description: "Kitchen sink draining slowly — possible grease blockage.",
        category: MaintenanceCategory.PLUMBING, priority: MaintenancePriority.LOW, status: MaintenanceStatus.OPEN,
        reportedBy: "Sipho Dlamini", unitId: units["101"].id,
        reportedDate: addD(now, -3), isEmergency: false, portal: true, stageStartedAt: addD(now, -3),
      },
      {
        title: "Intercom handset dead — unit 202", description: "Lobby intercom handset not responding — cannot buzz visitors in.",
        category: MaintenanceCategory.ELECTRICAL, priority: MaintenancePriority.MEDIUM, status: MaintenanceStatus.OPEN,
        reportedBy: "Ayesha Patel", unitId: units["202"].id,
        reportedDate: addD(now, -2), isEmergency: false, portal: true, stageStartedAt: addD(now, -2),
      },
      {
        title: "Bedroom ceiling fan noise — unit 303", description: "Ceiling fan vibrating loudly. Gets worse at high speed.",
        category: MaintenanceCategory.APPLIANCE, priority: MaintenancePriority.LOW, status: MaintenanceStatus.OPEN,
        reportedBy: "Michael & Sarah Pretorius", unitId: units["303"].id,
        reportedDate: addD(now, -1), isEmergency: false, portal: true, stageStartedAt: addD(now, -1),
      },
    ],
  });

  // ── Standalone LEASE_RENEWAL case ────────────────────────────────────────────
  // (Units 102 and 302 get their arrears cases from seedArrearsCase above.)
  await seedStandaloneCase({
    caseType: "LEASE_RENEWAL", subjectId: tenants["303"].id, organizationId, propertyId: property.id, unitId: units["303"].id,
    title: "Lease renewal — Michael & Sarah Pretorius (unit 303)", status: "AWAITING_TENANT", stageIndex: 3, waitingOn: "TENANT",
    stageStartedAt: addD(now, -7), commentBody: "Lease ending soon. Renewal terms sent with proposed 7% escalation. Awaiting tenant decision.",
  });

  // ── Compliance certificates ─────────────────────────────────────────────────
  await prisma.complianceCertificate.createMany({
    data: [
      {
        propertyId: property.id,
        organizationId,
        certificateType: "Certificate of Compliance (COC) — Electrical",
        certificateNumber: "COC-GP-44821",
        issuedBy: "Sparks Electrical — Registered Wireman",
        issueDate: subY(now, 1),
        expiryDate: addM(now, 12),
        notes: "Full electrical installation compliance certificate. Valid for 2 years.",
      },
      {
        propertyId: property.id,
        organizationId,
        certificateType: "Fire Safety Certificate",
        certificateNumber: "FSC-GP-0932",
        issuedBy: "Johannesburg Fire & Rescue Services",
        issueDate: addM(now, -11),
        expiryDate: addD(now, 20),
        notes: "Annual fire safety inspection passed. Renewal due soon.",
      },
      {
        propertyId: property.id,
        organizationId,
        certificateType: "Occupation Certificate",
        certificateNumber: "OC-JHB-1154",
        issuedBy: "City of Johannesburg — Building Development Management",
        issueDate: subY(now, 5),
        notes: "Original occupation certificate issued on completion. No expiry.",
      },
    ],
  });

  // ── Building condition report ───────────────────────────────────────────────
  await prisma.buildingConditionReport.create({
    data: {
      propertyId: property.id,
      reportDate: wDate(WIN, WIN.length - 1, 5),
      inspector: "Pieter Swanepoel, SACAP Registered Professional",
      overallCondition: "Good",
      summary:
        "Sandton Heights is in good overall condition. The structure, common areas, and services are well-maintained. The fire safety certificate renewal is due soon. The security gate motor was recently repaired. Generator is performing well given sustained load-shedding periods.",
      nextReviewDate: addM(now, 6),
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

  // ── Owner invoices (management fee — rolling window) ─────────────────────────
  for (let i = 0; i < MONTHS.length; i++) {
    const paid = i < MONTHS.length - 1; // current month still SENT
    await prisma.ownerInvoice.create({
      data: {
        invoiceNumber: `OWN-SH-${propCode}-${WIN[i].y}-${String(WIN[i].m + 1).padStart(2, "0")}-MGMT`,
        propertyId: property.id,
        type: OwnerInvoiceType.MANAGEMENT_FEE,
        periodYear: WIN[i].y,
        periodMonth: WIN[i].m + 1,
        lineItems: [
          { description: "Management fee — 3 one-bedroom units",   units: 3, unitRate: 850,  amount: 2550 },
          { description: "Management fee — 4 two-bedroom units",   units: 4, unitRate: 1100, amount: 4400 },
          { description: "Management fee — 2 three-bedroom units", units: 2, unitRate: 1500, amount: 3000 },
        ],
        totalAmount: 9950,
        dueDate: wDate(WIN, i, 8),
        status: paid ? InvoiceStatus.PAID : InvoiceStatus.SENT,
        paidAt: paid ? wDate(WIN, i, 10) : null,
        paidAmount: paid ? 9950 : null,
        notes: `Monthly property management fee — ${new Date(WIN[i].y, WIN[i].m).toLocaleString("en-GB", { month: "long", year: "numeric" })}`,
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
        date: wDate(WIN, 0, 8),
        description: "Full service — oil change, filters, fuel injectors, load test",
        cost: 2400,
        technician: "Agrico Equipment technician",
        notes: "Generator ran extended hours during load-shedding. All consumables replaced. Performing normally.",
      },
      {
        assetId: shAssetMap["Perkins Standby Generator"],
        date: wDate(WIN, 1, 10),
        description: "Monthly routine check — oil level, coolant, battery voltage, 30-min load test",
        cost: 850,
        technician: "Agrico Equipment technician",
        vendorId: shVendorAgrico.id,
        notes: "All systems nominal. No faults detected.",
      },
      {
        assetId: shAssetMap["Perkins Standby Generator"],
        date: wDate(WIN, 2, 10),
        description: "Monthly routine check — oil level, coolant, battery voltage, 30-min load test",
        cost: 850,
        technician: "Agrico Equipment technician",
        vendorId: shVendorAgrico.id,
        notes: "All systems nominal. No faults detected.",
      },
      {
        assetId: shAssetMap["Otis Passenger Lift"],
        date: wDate(WIN, 0, 15),
        description: "Quarterly service — lubrication, safety brake test, door mechanism check",
        cost: 3200,
        technician: "Otis Elevator SA technician",
        vendorId: shVendorOtis.id,
        notes: "All checks passed. Certificate of service issued.",
      },
      {
        assetId: shAssetMap["Grundfos Pressure Pump"],
        date: wDate(WIN, 2, 10),
        description: "Routine inspection — pressure output, seal condition, impeller check",
        cost: 1400,
        technician: "Pump & Valve SA technician",
        notes: "Pump within spec. Shaft seal showing slight wear — replacement recommended at next service.",
      },
      {
        assetId: shAssetMap["Hikvision 16-Channel CCTV System"],
        date: wDate(WIN, 3, 10),
        description: "Annual CCTV review — camera alignment, recording integrity check, firmware update",
        cost: 2800,
        technician: "ADT Security technician",
        vendorId: shVendorADT.id,
        notes: "All 16 cameras verified operational. DVR storage healthy. Firmware updated to latest version.",
      },
    ],
  });

  // (Arrears escalation history is seeded with the cases above, as CaseEvents.)

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
  const now = new Date();
  const WIN = recentMonths(4, now); // MONTHS indexes into WIN; [1,2,3] = last 3 months incl current
  const MONTHS = [1, 2, 3];
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
        "Elegant 3-storey residential block in the heart of Belsize Park, NW3. 10 apartments across three floors with secure entry, communal garden, residents' indoor pool, cycle store, and EV charging. Professionally managed under a Haverstock PM management brief.",
      serviceChargeDefault: SC,
      organizationId,
      currency: "GBP",
    },
  });
  // Namespace invoice numbers per seeded property — invoiceNumber is globally
  // unique, so a second org seeding this demo must not collide (same fix as
  // the other demos).
  const propCode = property.id.slice(-6).toUpperCase();

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

  // Parallel — all units depend only on property.id, not on each other
  const unitRows = await Promise.all(
    unitDefs.map((u) => prisma.unit.create({
      data: {
        unitNumber: u.number,
        propertyId: property.id,
        type: u.type,
        floor: u.floor,
        monthlyRent: u.rent,
        status: u.status,
        vacantSince: u.status === UnitStatus.VACANT ? wDate(WIN, 1, 1) : null,
        sizeSqm: u.sqm,
        amenities: ["Double glazing", "Gas central heating", "Built-in wardrobes"],
        description: `${u.type.replace("_", " ")} apartment on floor ${u.floor}`,
      },
    })),
  );
  const units: Record<string, { id: string }> = Object.fromEntries(
    unitRows.map((u, i) => [unitDefs[i].number, { id: u.id }]),
  );

  // ── Tenants (9 active; unit 104 vacant after a former tenant moved out) ─────
  // Oliver Thompson (unit 201) is in arrears AND opted into late penalties — demos
  // the late-penalty workflow. Sophie Bennett (103) is mid-renewal (NOTICE_SENT).
  const tenantDefs = [
    { unit: "101", name: "Emily Clarke",     rent: 1750, leaseEnd: "2027-01-31", phone: "+44 7911 000101", email: "emily.clarke@email.co.uk",    nationalId: "NS 12 34 56 A", renewal: RenewalStage.NONE,        chargeLatePenalty: false, escalationRate: 3.0 },
    { unit: "102", name: "James Hartley",    rent: 1800, leaseEnd: "2027-03-31", phone: "+44 7911 000102", email: "james.hartley@email.co.uk",    nationalId: "NS 23 45 67 B", renewal: RenewalStage.NONE,        chargeLatePenalty: false, escalationRate: 3.0 },
    { unit: "103", name: "Sophie Bennett",   rent: 1800, leaseEnd: "2026-06-30", phone: "+44 7911 000103", email: "sophie.bennett@email.co.uk",   nationalId: "NS 34 56 78 C", renewal: RenewalStage.NOTICE_SENT, chargeLatePenalty: false, escalationRate: 3.0 },
    { unit: "201", name: "Oliver Thompson",  rent: 2350, leaseEnd: "2026-12-31", phone: "+44 7911 000201", email: "oliver.thompson@email.co.uk",  nationalId: "NS 45 67 89 D", renewal: RenewalStage.NONE,        chargeLatePenalty: true,  escalationRate: 4.0 },
    { unit: "202", name: "Charlotte Davies", rent: 2400, leaseEnd: "2027-02-28", phone: "+44 7911 000202", email: "charlotte.davies@email.co.uk", nationalId: "NS 56 78 90 E", renewal: RenewalStage.NONE,        chargeLatePenalty: false, escalationRate: 3.0 },
    { unit: "203", name: "William Foster",   rent: 2450, leaseEnd: "2026-09-30", phone: "+44 7911 000203", email: "william.foster@email.co.uk",   nationalId: "NS 67 89 01 F", renewal: RenewalStage.NONE,        chargeLatePenalty: false, escalationRate: 3.0 },
    { unit: "204", name: "Rebecca Morgan",   rent: 2400, leaseEnd: "2027-04-30", phone: "+44 7911 000204", email: "rebecca.morgan@email.co.uk",   nationalId: "NS 78 90 12 G", renewal: RenewalStage.NONE,        chargeLatePenalty: false, escalationRate: 3.0 },
    { unit: "301", name: "Daniel Walsh",     rent: 3100, leaseEnd: "2026-08-31", phone: "+44 7911 000301", email: "daniel.walsh@email.co.uk",     nationalId: "NS 89 01 23 H", renewal: RenewalStage.NONE,        chargeLatePenalty: false, escalationRate: 3.0 },
    { unit: "302", name: "Natasha Singh",    rent: 3200, leaseEnd: "2026-12-31", phone: "+44 7911 000302", email: "natasha.singh@email.co.uk",    nationalId: "NS 90 12 34 I", renewal: RenewalStage.NONE,        chargeLatePenalty: false, escalationRate: 4.0 },
  ];

  // Parallel — tenants depend only on unit IDs which already exist
  const tenantRows = await Promise.all(
    tenantDefs.map((t) => prisma.tenant.create({
      data: {
        name: t.name,
        unitId: units[t.unit].id,
        depositAmount: t.rent * 2,
        depositPaidDate: subY(now, 1),
        leaseStart: subY(now, 1),
        leaseEnd: t.renewal === RenewalStage.NOTICE_SENT ? addM(now, 2) : t.unit === "201" || t.unit === "302" ? addM(now, 8) : addM(now, 12),
        monthlyRent: t.rent,
        serviceCharge: SC,
        rentDueDay: 1,
        isActive: true,
        phone: t.phone,
        email: t.email,
        nationalId: t.nationalId,
        renewalStage: t.renewal,
        proposedRent: t.renewal === RenewalStage.NOTICE_SENT ? 1890 : null,
        proposedLeaseEnd: t.renewal === RenewalStage.NOTICE_SENT ? addM(now, 14) : null,
        renewalNotes: t.renewal === RenewalStage.NOTICE_SENT
          ? "Renewal notice sent. Awaiting tenant response on proposed new rent of £1,890."
          : null,
        chargeLatePenalty: t.chargeLatePenalty,
        escalationRate: t.escalationRate,
        notes: `AST in place. ${t.name.split(" ")[0]} is a tenant in good standing.`,
      },
    })),
  );
  const tenants: Record<string, { id: string }> = Object.fromEntries(
    tenantRows.map((t, i) => [tenantDefs[i].unit, { id: t.id }]),
  );

  // Former tenant of unit 104 — vacated 31 Jan 2026, deposit settled. Drives the
  // DepositSettlement demo (unit 104 itself is now VACANT, awaiting re-let).
  const formerTenant104 = await prisma.tenant.create({
    data: {
      name: "Hannah Pierce",
      unitId: units["104"].id,
      depositAmount: 3700,
      depositPaidDate: subY(now, 2),
      leaseStart: subY(now, 2),
      leaseEnd: wDate(WIN, 0, 31),
      monthlyRent: 1850,
      serviceCharge: SC,
      rentDueDay: 1,
      isActive: false,
      vacatedDate: wDate(WIN, 0, 31),
      phone: "+44 7911 000104",
      email: "hannah.pierce@email.co.uk",
      nationalId: "NS 01 23 45 J",
      renewalStage: RenewalStage.NONE,
      chargeLatePenalty: false,
      notes: "Former tenant. Lease recently ended. Deposit settled with deductions for cleaning & wall repair.",
    },
  });

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
      effectiveFrom: wDate(WIN, 1),
    })),
  });

  // ── Vendors (all before expenses) ───────────────────────────────────────────
  const [
    vendorMgmt, vendorWater, vendorElec, vendorCleaning, vendorInternet,
    vendorMaint, vendorElectrical, vendorLift, vendorSecurity, vendorGarden,
    vendorPool,
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
    prisma.vendor.create({ data: { name: "AquaCare Pool Services Ltd",         category: VendorCategory.SERVICE_PROVIDER,  phone: "+44 20 7946 0707", email: "service@aquacarepools.co.uk",         organizationId, isActive: true, notes: "Residents' indoor pool — weekly dosing visits, water testing & plant servicing. Paid by monthly account." } }),
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

  // ── Tax Configurations (UK VAT @ 20%) ────────────────────────────────────────
  // Created early so Income entries below can reference taxConfigId — otherwise
  // the tax tabs in the UI look empty even though configs exist.
  const [vatMgmtConfig, vatContractorConfig] = await Promise.all([
    prisma.taxConfiguration.create({ data: { orgId: organizationId, propertyId: property.id, label: "VAT — Management & Agency Fees",     rate: 0.20, type: TaxType.ADDITIVE, appliesTo: ["MANAGEMENT_FEE_INCOME", "LETTING_FEE_INCOME"],                isInclusive: false, effectiveFrom: d("2020-01-01"), isActive: true } }),
    prisma.taxConfiguration.create({ data: { orgId: organizationId, propertyId: property.id, label: "VAT — Contractor & Vendor Invoices", rate: 0.20, type: TaxType.ADDITIVE, appliesTo: ["CONTRACTOR_LABOUR", "CONTRACTOR_MATERIALS", "VENDOR_INVOICE"], isInclusive: true,  effectiveFrom: d("2020-01-01"), isActive: true } }),
  ]);
  // Suppress unused-var lint for vatContractorConfig — kept for symmetry / future wiring on expense lines
  void vatContractorConfig;

  // ── Income & Invoices ────────────────────────────────────────────────────────
  // Units with arrears (month indices that are overdue)
  const arrears: Record<string, number[]> = {
    "201": [2, 3],     // Oliver Thompson — last 2 months (incl current) → INFORMAL_REMINDER
    "302": [1, 2, 3],  // Natasha Singh — all 3 months → DEMAND_LETTER
  };

  const incomeRows: {
    date: Date; unitId: string; tenantId: string; invoiceId: string;
    type: IncomeType; grossAmount: number; agentCommission: number;
    taxConfigId?: string; taxRate?: number; taxAmount?: number; taxType?: TaxType;
  }[] = [];

  // Parallel within each month — invoices for different tenants in the same month
  // are independent. Sequential across months keeps invoice numbering predictable.
  for (const month of MONTHS) {
    const mm = String(WIN[month].m + 1).padStart(2, "0"); // calendar month from the window
    const monthInvoices = await Promise.all(tenantDefs.map(async (t) => {
      const isArrears = (arrears[t.unit] ?? []).includes(month);
      const total = t.rent + SC;
      const inv = await prisma.invoice.create({
        data: {
          invoiceNumber: `BC-${propCode}-${t.unit}-${WIN[month].y}-${mm}-001`,
          tenantId: tenants[t.unit].id,
          periodYear: WIN[month].y,
          periodMonth: WIN[month].m + 1,
          rentAmount: t.rent,
          serviceCharge: SC,
          totalAmount: total,
          dueDate: wDate(WIN, month, 1),
          status: isArrears ? InvoiceStatus.OVERDUE : InvoiceStatus.PAID,
          paidAt: isArrears ? null : wDate(WIN, month, 5),
          paidAmount: isArrears ? null : total,
        },
      });
      return { inv, t, isArrears };
    }));
    for (const { inv, t, isArrears } of monthInvoices) {
      if (!isArrears) {
        // Wire tax to the management fee component of rent — feeds the tax UI.
        // Computed as 20% VAT on the unit's flat management fee (additive, not
        // included in rent shown to tenants).
        const mgmtFee = feeConfigs.find((f) => f.unit === t.unit)?.flat ?? 0;
        const taxAmount = Math.round(mgmtFee * 0.20 * 100) / 100;
        incomeRows.push({
          date: wDate(WIN, month, 5),
          unitId: units[t.unit].id,
          tenantId: tenants[t.unit].id,
          invoiceId: inv.id,
          type: IncomeType.LONGTERM_RENT,
          grossAmount: t.rent,
          agentCommission: 0,
          taxConfigId: vatMgmtConfig.id,
          taxRate: 0.20,
          taxAmount,
          taxType: TaxType.ADDITIVE,
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
        date: wDate(WIN, month),
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
      { date: wDate(WIN, 1), unitId: units["103"].id, scope: ExpenseScope.UNIT, category: ExpenseCategory.MAINTENANCE,   amount: 540,  description: "Emergency burst pipe repair — unit 103",    isSunkCost: false, paidFromPettyCash: false, vendorId: vendorMaint.id      },
      { date: wDate(WIN, 1), unitId: units["201"].id, scope: ExpenseScope.UNIT, category: ExpenseCategory.MAINTENANCE,   amount: 384,  description: "Cracked window replacement — unit 201",     isSunkCost: false, paidFromPettyCash: false, vendorId: vendorMaint.id      },
      { date: wDate(WIN, 2), unitId: units["102"].id, scope: ExpenseScope.UNIT, category: ExpenseCategory.MAINTENANCE,   amount: 216,  description: "Leaking kitchen tap repair — unit 102",     isSunkCost: false, paidFromPettyCash: false, vendorId: vendorMaint.id      },
      { date: wDate(WIN, 2), unitId: units["301"].id, scope: ExpenseScope.UNIT, category: ExpenseCategory.MAINTENANCE,   amount: 1020, description: "Electrical DB board fault — unit 301",      isSunkCost: false, paidFromPettyCash: false, vendorId: vendorElectrical.id },
      { date: wDate(WIN, 3), unitId: units["104"].id, scope: ExpenseScope.UNIT, category: ExpenseCategory.REINSTATEMENT, amount: 1440, description: "Carpet replacement — void unit 104",        isSunkCost: false, paidFromPettyCash: false, vendorId: vendorMaint.id      },
      { date: wDate(WIN, 3), unitId: units["104"].id, scope: ExpenseScope.UNIT, category: ExpenseCategory.CLEANER,       amount: 336,  description: "Deep clean — void unit 104",                isSunkCost: false, paidFromPettyCash: true,  vendorId: vendorCleaning.id   },
    ],
  });

  // ── Pool supplier expenses (vendor payables/statement showcase) ─────────────
  // AquaCare invoices monthly on account. The first two service invoices are
  // settled by ONE vendor payment below; the pump overhaul is part-paid by
  // cheque; the current month's invoice is left unpaid — so the vendor
  // statement shows a payment spanning two invoices, a partial payment, and a
  // live outstanding balance (£442 + £378 = £820).
  await prisma.expenseEntry.createMany({
    data: [
      { date: wDate(WIN, 1, 6),  propertyId: property.id, scope: ExpenseScope.PROPERTY, category: ExpenseCategory.POOL, amount: 378, description: "AquaCare — monthly pool service & water treatment", dueDate: wDate(WIN, 1, 20), isSunkCost: false, paidFromPettyCash: false, vendorId: vendorPool.id },
      { date: wDate(WIN, 2, 6),  propertyId: property.id, scope: ExpenseScope.PROPERTY, category: ExpenseCategory.POOL, amount: 378, description: "AquaCare — monthly pool service & water treatment", dueDate: wDate(WIN, 2, 20), isSunkCost: false, paidFromPettyCash: false, vendorId: vendorPool.id },
      { date: wDate(WIN, 2, 12), propertyId: property.id, scope: ExpenseScope.PROPERTY, category: ExpenseCategory.POOL, amount: 942, description: "Pool circulation pump overhaul — AquaCare",         dueDate: wDate(WIN, 2, 26), isSunkCost: false, paidFromPettyCash: false, vendorId: vendorPool.id },
      { date: wDate(WIN, 3, 6),  propertyId: property.id, scope: ExpenseScope.PROPERTY, category: ExpenseCategory.POOL, amount: 378, description: "AquaCare — monthly pool service & water treatment", dueDate: wDate(WIN, 3, 20), isSunkCost: false, paidFromPettyCash: false, vendorId: vendorPool.id },
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

  // ── Vendor payments — AquaCare payables showcase ─────────────────────────────
  // Reconciliation rule: once an expense has allocations, SUM(allocations) is
  // its amountPaid, and (because these expenses carry line items) the same
  // total is waterfalled across the line items. The rows below are seeded
  // already-consistent with that invariant.
  const [poolSvc1, poolSvc2, poolPump, poolSvc3] = await prisma.expenseEntry.findMany({
    where: { propertyId: property.id, category: ExpenseCategory.POOL },
    select: { id: true },
    orderBy: { date: "asc" },
  });

  await prisma.expenseLineItem.createMany({
    data: [
      // Month 1 service — fully settled by the BACS remittance below
      { expenseId: poolSvc1.id, category: LineItemCategory.LABOUR,   description: "Weekly visits — dosing, testing & poolside clean (excl. VAT)", amount: 315, isVatable: true,  paymentStatus: LineItemPaymentStatus.PAID,    amountPaid: 315 },
      { expenseId: poolSvc1.id, category: LineItemCategory.QUOTE,    description: "VAT @ 20%",                                                    amount: 63,  isVatable: false, paymentStatus: LineItemPaymentStatus.PAID,    amountPaid: 63  },
      // Month 2 service — settled by the same BACS remittance
      { expenseId: poolSvc2.id, category: LineItemCategory.LABOUR,   description: "Weekly visits — dosing, testing & poolside clean (excl. VAT)", amount: 315, isVatable: true,  paymentStatus: LineItemPaymentStatus.PAID,    amountPaid: 315 },
      { expenseId: poolSvc2.id, category: LineItemCategory.QUOTE,    description: "VAT @ 20%",                                                    amount: 63,  isVatable: false, paymentStatus: LineItemPaymentStatus.PAID,    amountPaid: 63  },
      // Pump overhaul — £500 cheque on account, waterfalled oldest-first
      { expenseId: poolPump.id, category: LineItemCategory.LABOUR,   description: "Pump strip-down & overhaul labour (excl. VAT)",                amount: 450, isVatable: true,  paymentStatus: LineItemPaymentStatus.PAID,    amountPaid: 450 },
      { expenseId: poolPump.id, category: LineItemCategory.MATERIAL, description: "Impeller, mechanical seals & bearings (excl. VAT)",            amount: 335, isVatable: true,  paymentStatus: LineItemPaymentStatus.PARTIAL, amountPaid: 50  },
      { expenseId: poolPump.id, category: LineItemCategory.QUOTE,    description: "VAT @ 20%",                                                    amount: 157, isVatable: false, paymentStatus: LineItemPaymentStatus.UNPAID,  amountPaid: 0   },
      // Current month service — unpaid (drives the outstanding balance)
      { expenseId: poolSvc3.id, category: LineItemCategory.LABOUR,   description: "Weekly visits — dosing, testing & poolside clean (excl. VAT)", amount: 315, isVatable: true,  paymentStatus: LineItemPaymentStatus.UNPAID,  amountPaid: 0   },
      { expenseId: poolSvc3.id, category: LineItemCategory.QUOTE,    description: "VAT @ 20%",                                                    amount: 63,  isVatable: false, paymentStatus: LineItemPaymentStatus.UNPAID,  amountPaid: 0   },
    ],
  });

  // One BACS remittance settling TWO monthly invoices — the core "one payment,
  // many invoices" statement story.
  await prisma.vendorPayment.create({
    data: {
      organizationId,
      vendorId: vendorPool.id,
      paymentDate: wDate(WIN, 2, 24),
      amount: 756,
      paymentMethod: PaymentMethod.BANK_TRANSFER,
      reference: "BACS-88231",
      notes: "Monthly account run — settles the two outstanding pool service invoices in one remittance.",
      allocations: {
        create: [
          { expenseEntryId: poolSvc1.id, amount: 378 },
          { expenseEntryId: poolSvc2.id, amount: 378 },
        ],
      },
    },
  });

  // Part payment on the pump overhaul — leaves £442 outstanding on that invoice.
  await prisma.vendorPayment.create({
    data: {
      organizationId,
      vendorId: vendorPool.id,
      paymentDate: wDate(WIN, 3, 5),
      amount: 500,
      paymentMethod: PaymentMethod.CHEQUE,
      reference: "CHQ-000412",
      notes: "Part payment on account — balance held pending pump commissioning check.",
      allocations: { create: [{ expenseEntryId: poolPump.id, amount: 500 }] },
    },
  });

  // Stamp each allocated expense's amountPaid = its allocation sum.
  await Promise.all([
    prisma.expenseEntry.update({ where: { id: poolSvc1.id }, data: { amountPaid: 378 } }),
    prisma.expenseEntry.update({ where: { id: poolSvc2.id }, data: { amountPaid: 378 } }),
    prisma.expenseEntry.update({ where: { id: poolPump.id }, data: { amountPaid: 500 } }),
  ]);

  // ── Petty Cash ───────────────────────────────────────────────────────────────
  await prisma.pettyCash.createMany({
    data: [
      ...MONTHS.map((month) => ({ date: wDate(WIN, month), type: PettyCashType.IN, amount: 400, description: "Monthly petty cash top-up — Belsize Court", propertyId: property.id })),
      { date: wDate(WIN, 1,  8), type: PettyCashType.OUT, amount: 45,  description: "Lightbulbs — common area replacements",            propertyId: property.id },
      { date: wDate(WIN, 1, 14), type: PettyCashType.OUT, amount: 65,  description: "Notice board replacement — lobby",                  propertyId: property.id },
      { date: wDate(WIN, 1, 22), type: PettyCashType.OUT, amount: 28,  description: "Postage — legal correspondence",                    propertyId: property.id },
      { date: wDate(WIN, 2,  5), type: PettyCashType.OUT, amount: 35,  description: "Emergency padlock — car park gate",                 propertyId: property.id },
      { date: wDate(WIN, 2, 19), type: PettyCashType.OUT, amount: 78,  description: "Drain rods & plunger — maintenance stock",          propertyId: property.id },
      { date: wDate(WIN, 2, 28), type: PettyCashType.OUT, amount: 40,  description: "First aid kit restock — building",                  propertyId: property.id },
      { date: wDate(WIN, 3,  3), type: PettyCashType.OUT, amount: 24,  description: "Key cutting — unit 104 void preparation",           propertyId: property.id },
      { date: wDate(WIN, 3, 15), type: PettyCashType.OUT, amount: 55,  description: "Garden supplies — communal planting",                propertyId: property.id },
      { date: wDate(WIN, 3, 22), type: PettyCashType.OUT, amount: 336, description: "Deep clean — void unit 104 (paid from petty cash)", propertyId: property.id },
    ],
  });

  // ── Insurance Policies ───────────────────────────────────────────────────────
  await prisma.insurancePolicy.createMany({
    data: [
      { propertyId: property.id, type: InsuranceType.BUILDING,          insurer: "Aviva Insurance Ltd",       policyNumber: "AVI-BC-001", startDate: addM(now, -2), endDate: addM(now, 10), premiumAmount: 4800, premiumFrequency: PremiumFrequency.ANNUALLY, coverageAmount: 2500000, brokerName: "Marsh Insurance Brokers", brokerContact: "+44 20 7357 1000", notes: "Full buildings reinstatement insurance." },
      { propertyId: property.id, type: InsuranceType.PUBLIC_LIABILITY,   insurer: "AXA Business Insurance",   policyNumber: "AXA-BC-002", startDate: addM(now, -5), endDate: addM(now, 7), premiumAmount: 1200, premiumFrequency: PremiumFrequency.ANNUALLY, coverageAmount: 5000000, brokerName: "Marsh Insurance Brokers", brokerContact: "+44 20 7357 1000", notes: "Public liability & employer liability combined policy." },
      { propertyId: property.id, type: InsuranceType.CONTENTS,           insurer: "Zurich UK",                policyNumber: "ZUR-BC-003", startDate: addM(now, -11), endDate: addD(now, 18), premiumAmount: 800,  premiumFrequency: PremiumFrequency.ANNUALLY, coverageAmount: 150000,  brokerName: "Marsh Insurance Brokers", brokerContact: "+44 20 7357 1000", notes: "Communal contents & common parts insurance. DUE FOR RENEWAL soon." },
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
      data: { propertyId: property.id, name: a.name, category: a.category, serialNumber: a.serial, purchaseDate: subY(now, 4), purchaseCost: a.purchaseCost, warrantyExpiry: a.warrantyExpiry, serviceProvider: a.serviceProvider, serviceContact: a.serviceContact, notes: a.notes },
    });
    await prisma.assetMaintenanceSchedule.create({
      data: { assetId: asset.id, propertyId: property.id, taskName: a.schedule.taskName, frequency: a.schedule.frequency, nextDue: addM(now, 1), isActive: true, estimatedCost: a.schedule.estimatedCost },
    });
  }

  // Pool plant — first-class POOL asset category (mirrors the POOL expense
  // category). Linked to AquaCare via vendorId.
  const poolPlant = await prisma.asset.create({
    data: {
      propertyId: property.id,
      name: "Pool Plant — Circulation Pump & Filtration",
      category: AssetCategory.POOL,
      serialNumber: "AQ-CPF-BC-22",
      purchaseDate: subY(now, 3),
      purchaseCost: 6400,
      warrantyExpiry: addM(now, 10),
      serviceProvider: "AquaCare Pool Services Ltd",
      serviceContact: "+44 20 7946 0707",
      vendorId: vendorPool.id,
      notes: "Residents' indoor pool plant room: circulation pump, sand filter and UV dosing unit. Serviced quarterly by AquaCare; chemicals topped up weekly.",
    },
  });
  await prisma.assetMaintenanceSchedule.create({
    data: { assetId: poolPlant.id, propertyId: property.id, taskName: "Quarterly Pool Plant Service", frequency: MaintenanceFrequency.QUARTERLY, nextDue: addM(now, 1), isActive: true, estimatedCost: 260 },
  });

  // ── Recurring Expenses ───────────────────────────────────────────────────────
  await prisma.recurringExpense.createMany({
    data: [
      { description: "Monthly management fee — Haverstock PM",  category: ExpenseCategory.MANAGEMENT_FEE, amount: 2772, scope: ExpenseScope.PROPERTY, propertyId: property.id, frequency: RecurringFrequency.MONTHLY,   nextDueDate: addM(now, 1), isActive: true, vendorId: vendorMgmt.id      },
      { description: "Thames Water — communal water supply",    category: ExpenseCategory.WATER,          amount: 456,  scope: ExpenseScope.PROPERTY, propertyId: property.id, frequency: RecurringFrequency.MONTHLY,   nextDueDate: addM(now, 1), isActive: true, vendorId: vendorWater.id     },
      { description: "UK Power Networks — common areas",        category: ExpenseCategory.ELECTRICITY,    amount: 336,  scope: ExpenseScope.PROPERTY, propertyId: property.id, frequency: RecurringFrequency.MONTHLY,   nextDueDate: addM(now, 1), isActive: true, vendorId: vendorElec.id      },
      { description: "BrightHouse communal cleaning contract",  category: ExpenseCategory.CLEANER,        amount: 864,  scope: ExpenseScope.PROPERTY, propertyId: property.id, frequency: RecurringFrequency.MONTHLY,   nextDueDate: addM(now, 1), isActive: true, vendorId: vendorCleaning.id  },
      { description: "Virgin Media Business — building WiFi",   category: ExpenseCategory.WIFI,           amount: 102,  scope: ExpenseScope.PROPERTY, propertyId: property.id, frequency: RecurringFrequency.MONTHLY,   nextDueDate: addM(now, 1), isActive: true, vendorId: vendorInternet.id  },
      { description: "GreenThumb grounds maintenance",          category: ExpenseCategory.OTHER,          amount: 420,  scope: ExpenseScope.PROPERTY, propertyId: property.id, frequency: RecurringFrequency.MONTHLY,   nextDueDate: addM(now, 1), isActive: true, vendorId: vendorGarden.id    },
      { description: "Quarterly Lift Maintenance — Otis UK",    category: ExpenseCategory.MAINTENANCE,    amount: 650,  scope: ExpenseScope.PROPERTY, propertyId: property.id, frequency: RecurringFrequency.QUARTERLY, nextDueDate: addM(now, 2), isActive: true, vendorId: vendorLift.id      },
      { description: "Quarterly Generator Service — BuildRight",category: ExpenseCategory.MAINTENANCE,    amount: 280,  scope: ExpenseScope.PROPERTY, propertyId: property.id, frequency: RecurringFrequency.QUARTERLY, nextDueDate: addM(now, 2), isActive: true, vendorId: vendorMaint.id     },
      { description: "Annual fire extinguisher service",        category: ExpenseCategory.MAINTENANCE,    amount: 420,  scope: ExpenseScope.PROPERTY, propertyId: property.id, frequency: RecurringFrequency.ANNUAL,    nextDueDate: addM(now, 6), isActive: true, vendorId: vendorSecurity.id  },
      { description: "AquaCare — monthly pool service & water treatment", category: ExpenseCategory.POOL, amount: 378,  scope: ExpenseScope.PROPERTY, propertyId: property.id, frequency: RecurringFrequency.MONTHLY,   nextDueDate: addM(now, 1), isActive: true, vendorId: vendorPool.id      },
      { description: "AquaCare — pool chemicals & consumables top-up",    category: ExpenseCategory.POOL, amount: 120,  scope: ExpenseScope.PROPERTY, propertyId: property.id, frequency: RecurringFrequency.MONTHLY,   nextDueDate: addM(now, 1), isActive: true, vendorId: vendorPool.id      },
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
      // DONE — historical (earlier window months)
      { propertyId: property.id, unitId: units["103"].id, title: "Burst pipe — bathroom ceiling",          description: "Emergency call-out. Overflow pipe burst above bathroom ceiling. Pipe replaced, area dried and resealed.",               category: MaintenanceCategory.PLUMBING,   priority: MaintenancePriority.URGENT,  status: MaintenanceStatus.DONE,        reportedBy: "Sophie Bennett",          assignedTo: "BuildRight Maintenance Ltd", reportedDate: wDate(WIN, 1, 3), scheduledDate: wDate(WIN, 1, 3), completedDate: wDate(WIN, 1, 3), cost: 540,  vendorId: vendorMaint.id,      isEmergency: true,  submittedViaPortal: false, notes: "Resolved same day. Tenant confirmed resolved." },
      { propertyId: property.id, unitId: units["201"].id, title: "Cracked double-glazed window — unit 201", description: "Impact crack on inner pane of living room window. Double-glazed unit replaced by BuildRight.",                         category: MaintenanceCategory.STRUCTURAL, priority: MaintenancePriority.MEDIUM,  status: MaintenanceStatus.DONE,        reportedBy: "Oliver Thompson",         assignedTo: "BuildRight Maintenance Ltd", reportedDate: wDate(WIN, 1, 10), scheduledDate: wDate(WIN, 1, 12), completedDate: wDate(WIN, 1, 12), cost: 384,  vendorId: vendorMaint.id,      isEmergency: false, submittedViaPortal: false, notes: "Access via concierge key. Tenant confirmed." },
      { propertyId: property.id, unitId: units["102"].id, title: "Leaking kitchen tap — unit 102",          description: "Dripping monobloc kitchen tap. Cartridge and O-ring replaced.",                                                       category: MaintenanceCategory.PLUMBING,   priority: MaintenancePriority.LOW,     status: MaintenanceStatus.DONE,        reportedBy: "James Hartley",           assignedTo: "BuildRight Maintenance Ltd", reportedDate: wDate(WIN, 2, 18), scheduledDate: wDate(WIN, 2, 20), completedDate: wDate(WIN, 2, 20), cost: 216,  vendorId: vendorMaint.id,      isEmergency: false, submittedViaPortal: false, notes: "Routine repair." },
      // DB board fault cost £1,020 — exceeds repairAuthorityLimit (£500), so it
      // ran through the owner-approval workflow. Demos requiresApproval/approvedAt.
      { propertyId: property.id, unitId: units["301"].id, title: "DB board fault — fuse tripping (unit 301)",description: "RCD tripping repeatedly. Faulty RCBO identified and replaced. Board tested and certified.",                            category: MaintenanceCategory.ELECTRICAL, priority: MaintenancePriority.HIGH,    status: MaintenanceStatus.DONE,        reportedBy: "Daniel Walsh",            assignedTo: "SparkSafe Electrical Ltd",   reportedDate: wDate(WIN, 2, 7), scheduledDate: wDate(WIN, 2, 8), completedDate: wDate(WIN, 2, 8), cost: 1020, vendorId: vendorElectrical.id, isEmergency: false, submittedViaPortal: false, requiresApproval: true, acknowledgedAt: wDate(WIN, 2, 7), approvedAt: wDate(WIN, 2, 7), approvalNotes: "Approved by landlord (J. Smith) via email — quote of £1,020 exceeds standard £500 repair authority but works are urgent (DB safety).", notes: "EIC certificate issued post-works." },
      // DONE — pool pump overhaul (matches the AquaCare expense + part payment)
      { propertyId: property.id,                          title: "Pool circulation pump pressure loss — plant room", description: "Low flow pressure on the pool circulation loop. Pump stripped: worn impeller and failed mechanical seal found. Overhauled with new impeller, seals and bearings, then recommissioned.", category: MaintenanceCategory.OTHER, priority: MaintenancePriority.MEDIUM, status: MaintenanceStatus.DONE, reportedBy: "Building Manager", assignedTo: "AquaCare Pool Services Ltd", reportedDate: wDate(WIN, 2, 10), scheduledDate: wDate(WIN, 2, 12), completedDate: wDate(WIN, 2, 12), cost: 942, vendorId: vendorPool.id, isEmergency: false, submittedViaPortal: false, notes: "Invoice part-paid by cheque (£500); balance held pending commissioning check." },
      // IN_PROGRESS (current)
      { propertyId: property.id,                          title: "Quarterly lift inspection — Otis UK",     description: "Scheduled quarterly inspection and lubrication service. Engineer on-site, report pending.",                            category: MaintenanceCategory.OTHER,      priority: MaintenancePriority.MEDIUM,  status: MaintenanceStatus.IN_PROGRESS, reportedBy: "Building Manager",        assignedTo: "Otis Elevator Company UK",   reportedDate: addD(now, -6), scheduledDate: addD(now, 2),                                                 vendorId: vendorLift.id,       isEmergency: false, submittedViaPortal: false, notes: "Otis engineer to return with replacement door sensor." },
      { propertyId: property.id, unitId: units["104"].id, title: "Void works — carpet & painting (unit 104)",description: "Full void refurb in progress: carpet fitted, emulsion painting of all rooms underway.",                               category: MaintenanceCategory.OTHER,      priority: MaintenancePriority.LOW,     status: MaintenanceStatus.IN_PROGRESS, reportedBy: "Building Manager",        assignedTo: "BuildRight Maintenance Ltd", reportedDate: addD(now, -8), scheduledDate: addD(now, 1),                                                 vendorId: vendorMaint.id,      isEmergency: false, submittedViaPortal: false, notes: "Void refurb nearing completion." },
      // OPEN — tenant portal requests (current)
      { propertyId: property.id, unitId: units["102"].id, title: "Blocked kitchen drain — unit 102",        description: "Kitchen sink draining very slowly. Possible grease build-up.",                                                         category: MaintenanceCategory.PLUMBING,   priority: MaintenancePriority.MEDIUM,  status: MaintenanceStatus.OPEN,        reportedBy: "James Hartley (portal)",                                            reportedDate: addD(now, -4),                                                                                                             isEmergency: false, submittedViaPortal: true,  notes: "Awaiting scheduling." },
      { propertyId: property.id, unitId: units["202"].id, title: "Intercom handset not working — unit 202", description: "Intercom rings but tenant cannot hear caller. Handset unit suspected faulty.",                                         category: MaintenanceCategory.ELECTRICAL, priority: MaintenancePriority.LOW,     status: MaintenanceStatus.OPEN,        reportedBy: "Charlotte Davies (portal)",                                         reportedDate: addD(now, -3),                                                                                                             isEmergency: false, submittedViaPortal: true,  notes: "Non-urgent." },
      { propertyId: property.id, unitId: units["204"].id, title: "Bathroom extractor fan noisy — unit 204", description: "Extractor fan vibrating loudly when running. Possible bearing failure.",                                               category: MaintenanceCategory.OTHER,      priority: MaintenancePriority.LOW,     status: MaintenanceStatus.OPEN,        reportedBy: "Rebecca Morgan (portal)",                                           reportedDate: addD(now, -1),                                                                                                             isEmergency: false, submittedViaPortal: true  },
      // OPEN — manager logged (current)
      { propertyId: property.id,                          title: "Repaint 3rd floor corridor",               description: "Scuff marks and paint peeling on 3rd floor corridor walls. Full repaint recommended.",                                category: MaintenanceCategory.PAINTING,   priority: MaintenancePriority.LOW,     status: MaintenanceStatus.OPEN,        reportedBy: "Building Manager",                                                  reportedDate: addD(now, -10),                                                                                                            isEmergency: false, submittedViaPortal: false, notes: "To be quoted with BuildRight." },
      { propertyId: property.id,                          title: "CCTV camera 4 offline",                    description: "Camera 4 (car park east side) showing offline on NVR. Possible cable fault.",                                        category: MaintenanceCategory.SECURITY,   priority: MaintenancePriority.MEDIUM,  status: MaintenanceStatus.OPEN,        reportedBy: "Building Manager",                                                  reportedDate: addD(now, -5),                                                    vendorId: vendorSecurity.id, isEmergency: false, submittedViaPortal: false, notes: "SecureGuard to investigate." },
    ],
  });

  // ── Cases — link a MAINTENANCE CaseThread to every job above ─────────────────
  await backfillMaintenanceCases(property.id, organizationId, { kpiEmergencyResponseHrs: 4, kpiStandardResponseHrs: 48 });

  // ── Compliance Certificates ──────────────────────────────────────────────────
  await prisma.complianceCertificate.createMany({
    data: [
      { propertyId: property.id, organizationId, certificateType: "Gas Safety Certificate",                       certificateNumber: "GSC-BC-004",  issuedBy: "Corgi Homeplan Ltd",                  issueDate: addM(now, -13), expiryDate: addD(now, -30), notes: "Annual Gas Safety Record (CP12). EXPIRED — renewal overdue. Contact Corgi Homeplan immediately."  },
      { propertyId: property.id, organizationId, certificateType: "Electrical Installation Condition Report (EICR)", certificateNumber: "EICR-BC-005", issuedBy: "SparkSafe Electrical Ltd (NICEIC)",    issueDate: addM(now, -2), expiryDate: addM(now, 58), notes: "5-year EICR recently completed. Grade C2 observations — remedial works completed. Certificate satisfactory." },
      { propertyId: property.id, organizationId, certificateType: "Energy Performance Certificate (EPC)",          certificateNumber: "EPC-BC-006",  issuedBy: "Elmhurst Energy",                     issueDate: subY(now, 6), expiryDate: addM(now, 48), notes: "EPC rating: C (72 SAP points)."                                                       },
      { propertyId: property.id, organizationId, certificateType: "Fire Risk Assessment",                          certificateNumber: "FRA-BC-007",  issuedBy: "London Fire Safety Ltd",              issueDate: addM(now, -4), expiryDate: addM(now, 8), notes: "Annual fire risk assessment. Low risk rating. 3 actions raised — all completed."                     },
      { propertyId: property.id, organizationId, certificateType: "Legionella Risk Assessment",                    certificateNumber: "LRA-BC-008",  issuedBy: "Hydrosafe UK Ltd",                    issueDate: subY(now, 1), expiryDate: addD(now, -20), notes: "Legionella L8 assessment — EXPIRED. Annual renewal required. Contact Hydrosafe UK."                  },
    ],
  });

  // ── Building Condition Report ────────────────────────────────────────────────
  await prisma.buildingConditionReport.create({
    data: {
      propertyId: property.id,
      reportDate: wDate(WIN, 1, 15),
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
      nextReviewDate: addM(now, 6),
    },
  });

  // ── Owner Invoices (management fee — rolling window) ─────────────────────────
  for (const i of MONTHS) {
    const paid = i < MONTHS[MONTHS.length - 1]; // current month still SENT
    const mm = String(WIN[i].m + 1).padStart(2, "0");
    const totalAmount = 2772;
    await prisma.ownerInvoice.create({
      data: {
        invoiceNumber: `OWN-BC-${propCode}-${WIN[i].y}-${mm}-MGMT`,
        propertyId: property.id,
        type: OwnerInvoiceType.MANAGEMENT_FEE,
        periodYear: WIN[i].y,
        periodMonth: WIN[i].m + 1,
        lineItems: [
          { description: "Management fee — 10 units @ £231.00/unit", units: 10, unitRate: 231.00, amount: 2310.00 },
          { description: "VAT @ 20%",                                 units: 1,  unitRate: 462.00, amount: 462.00  },
        ],
        totalAmount,
        dueDate: wDate(WIN, i, 7),
        status: paid ? InvoiceStatus.PAID : InvoiceStatus.SENT,
        paidAt: paid ? wDate(WIN, i, 10) : null,
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
      { assetId: generatorId, date: wDate(WIN, 1, 15), description: "Monthly generator run test & inspection — all systems nominal",    cost: 280, technician: "Dave Kirk (BuildRight)",    vendorId: vendorMaint.id,    notes: "Oil level OK. Battery 12.8V. Run test 15 min."             },
      { assetId: generatorId, date: wDate(WIN, 2, 15), description: "Monthly generator run test & inspection — minor oil top-up",       cost: 280, technician: "Dave Kirk (BuildRight)",    vendorId: vendorMaint.id,    notes: "Oil topped up. Run test 15 min."                           },
      { assetId: generatorId, date: wDate(WIN, 3, 15), description: "Monthly generator run test & inspection — all systems nominal",    cost: 280, technician: "Dave Kirk (BuildRight)",    vendorId: vendorMaint.id,    notes: "All checks passed."          },
      { assetId: liftId,      date: wDate(WIN, 2, 20), description: "Quarterly lift inspection and lubrication service",                cost: 650, technician: "Otis Field Engineer",       vendorId: vendorLift.id,     notes: "Door operation adjusted. Guide rails lubricated. No defects." },
      { assetId: cctvId,      date: wDate(WIN, 1, 20), description: "Annual CCTV health check and recording verification",              cost: 150, technician: "SecureGuard Systems Ltd",   vendorId: vendorSecurity.id, notes: "All 16 channels verified. 30-day retention confirmed. Camera 12 realigned." },
      { assetId: poolPlant.id, date: wDate(WIN, 2, 12), description: "Circulation pump overhaul — impeller, mechanical seals & bearings replaced", cost: 942, technician: "AquaCare Field Engineer", vendorId: vendorPool.id, notes: "Pump recommissioned; flow pressure restored to spec. Invoice part-paid — see vendor statement." },
    ],
  });

  // ── Arrears cases (with escalation history on the case timeline) ─────────────
  for (const at of [
    {
      unit: "201", tenantName: "Oliver Thompson", stageKey: "informal_reminder",
      notes: "Oliver Thompson — 2 months overdue (incl current). Total: £5,200 (rent £4,700 + SC £500).",
      stageStartedAt: wDate(WIN, 3, 2),
      escalations: [
        { stageKey: "informal_reminder", notes: "Informal reminder email & phone call. Tenant cited delayed bank transfer.", createdAt: wDate(WIN, 2, 8) },
        { stageKey: "informal_reminder", notes: "Second reminder issued. Tenant acknowledged arrears. Partial payment of £2,600 promised — not received.", createdAt: wDate(WIN, 3, 2) },
      ],
    },
    {
      unit: "302", tenantName: "Natasha Singh", stageKey: "demand_letter",
      notes: "Natasha Singh — 3 months overdue. Total: £10,350 (rent £9,600 + SC £750). Demand letter served.",
      stageStartedAt: wDate(WIN, 3, 2),
      escalations: [
        { stageKey: "informal_reminder", notes: "Informal reminder email and text. No response from tenant.",                                                         createdAt: wDate(WIN, 1, 8) },
        { stageKey: "informal_reminder", notes: "Second reminder. Tenant responded citing financial difficulty. No payment made.",                                    createdAt: wDate(WIN, 2, 12) },
        { stageKey: "demand_letter",     notes: "Section 8 demand letter served via solicitors (Ground 10 & 11). 14-day cure period running.",                       createdAt: wDate(WIN, 3, 2) },
      ],
    },
  ]) {
    await seedArrearsCase({
      tenantId: tenants[at.unit].id,
      tenantName: at.tenantName,
      organizationId,
      propertyId: property.id,
      unitId: units[at.unit].id,
      stageKey: at.stageKey,
      status: "AWAITING_TENANT",
      waitingOn: "TENANT",
      stageStartedAt: at.stageStartedAt,
      openedNote: at.notes,
      escalations: at.escalations,
    });
  }

  // ── Standalone LEASE_RENEWAL case ────────────────────────────────────────────
  // (Units 201 and 302 get their arrears cases from seedArrearsCase above.)
  await seedStandaloneCase({
    caseType: "LEASE_RENEWAL", subjectId: tenants["103"].id, organizationId, propertyId: property.id, unitId: units["103"].id,
    title: "Lease renewal — Sophie Bennett (unit 103)", status: "AWAITING_TENANT", stageIndex: 3, waitingOn: "TENANT",
    stageStartedAt: addD(now, -7), commentBody: "Lease ending soon. Renewal terms sent (proposed £1,890). Awaiting tenant decision.",
  });

  // ── Link maintenance jobs → expense entries ──────────────────────────────────
  for (const { titleFragment, amount } of [
    { titleFragment: "Burst pipe",          amount: 540  },
    { titleFragment: "DB board fault",      amount: 1020 },
    { titleFragment: "Cracked double-glazed", amount: 384 },
    { titleFragment: "Pool circulation pump", amount: 942 },
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
      ...Object.entries(priorRents).map(([unit, rent]) => ({ tenantId: tenants[unit].id, monthlyRent: rent, effectiveDate: subY(now, 1), reason: "AST commencement — agreed rent per tenancy agreement"  })),
      ...tenantDefs.map((t)                              => ({ tenantId: tenants[t.unit].id, monthlyRent: t.rent, effectiveDate: wDate(WIN, 0), reason: "Annual rent review — CPI + 1% increase" })),
    ],
  });

  // ── Tenant Documents ─────────────────────────────────────────────────────────
  // Lease agreement + ID copy for every active tenant. Storage paths are
  // placeholders — actual file blobs are not seeded.
  await prisma.tenantDocument.createMany({
    data: tenantDefs.flatMap((t) => [
      {
        tenantId: tenants[t.unit].id,
        category: DocumentCategory.LEASE_AGREEMENT,
        label: `AST — ${t.name} (Unit ${t.unit})`,
        fileName: `lease-belsize-${t.unit}-2025.pdf`,
        storagePath: `demo/belsize-court/tenants/${t.unit}/lease-belsize-${t.unit}-2025.pdf`,
        fileSize: 184320,
        mimeType: "application/pdf",
      },
      {
        tenantId: tenants[t.unit].id,
        category: DocumentCategory.ID_COPY,
        label: `Photo ID — ${t.name}`,
        fileName: `id-${t.unit}.jpg`,
        storagePath: `demo/belsize-court/tenants/${t.unit}/id-${t.unit}.jpg`,
        fileSize: 92160,
        mimeType: "image/jpeg",
      },
    ]),
  });

  // ── Communication Log ────────────────────────────────────────────────────────
  // Realistic outbound emails — rent receipts, renewal notice, arrears reminders.
  // One entry has an open follow-up to demo the follow-up tracking workflow.
  await prisma.communicationLog.createMany({
    data: [
      // Sophie Bennett (103) — renewal notice
      { tenantId: tenants["103"].id, type: CommunicationType.EMAIL, subject: "Lease renewal — Belsize Court Unit 103",  body: "Dear Sophie, your current AST expires 30 June 2026. We'd like to offer renewal at a new monthly rent of £1,890 (4.7% increase). Please confirm your intent to renew within 14 days.", templateUsed: "renewal_offer",       loggedByEmail: "manager@haverstockpm.co.uk", loggedByName: "Property Manager", sentAt: wDate(WIN, 2, 1), followUpDate: wDate(WIN, 3, 1), followUpCompleted: false },
      // Oliver Thompson (201) — arrears reminders (matching the arrears case)
      { tenantId: tenants["201"].id, type: CommunicationType.EMAIL, subject: "Friendly reminder — February rent outstanding", body: "Hi Oliver, just a quick reminder that February's rent (£2,600) is now overdue. Please confirm payment date at your convenience.",                                                                  templateUsed: "rent_reminder",       loggedByEmail: "manager@haverstockpm.co.uk", loggedByName: "Property Manager", sentAt: wDate(WIN, 2, 8), followUpCompleted: true  },
      { tenantId: tenants["201"].id, type: CommunicationType.EMAIL, subject: "Second reminder — March rent now also outstanding", body: "Hi Oliver, March's rent is now also outstanding (combined balance £5,200). Please respond with a payment plan by 20 March.",                                                                  templateUsed: "rent_reminder",       loggedByEmail: "manager@haverstockpm.co.uk", loggedByName: "Property Manager", sentAt: wDate(WIN, 2, 12), followUpCompleted: true  },
      // Emily Clarke (101) — payment receipt
      { tenantId: tenants["101"].id, type: CommunicationType.EMAIL, subject: "March rent — payment received",          body: "Dear Emily, we confirm receipt of £2,000 for March 2026 rent + service charge. Thank you.",                                                                                                              templateUsed: "payment_receipt",     loggedByEmail: "accounts@haverstockpm.co.uk", loggedByName: "Accounts",         sentAt: wDate(WIN, 3, 5), followUpCompleted: true  },
      // James Hartley (102) — maintenance acknowledgement
      { tenantId: tenants["102"].id, type: CommunicationType.EMAIL, subject: "Re: Blocked kitchen drain (unit 102)",   body: "Hi James, thanks for raising this via the portal. We've scheduled BuildRight to attend Tuesday 28 April between 10am–12pm. Please confirm.",                                                            templateUsed: null,                  loggedByEmail: "manager@haverstockpm.co.uk", loggedByName: "Property Manager", sentAt: addD(now, -2), followUpCompleted: false },
      // Natasha Singh (302) — demand letter notification
      { tenantId: tenants["302"].id, type: CommunicationType.EMAIL, subject: "Formal demand — unpaid rent (Unit 302)", body: "Dear Ms Singh, please find attached our formal demand for unpaid rent totalling £10,350 covering February to April 2026. You have 14 days to clear the balance or contact us with a payment plan.", templateUsed: "demand_letter",       loggedByEmail: "legal@haverstockpm.co.uk", loggedByName: "Legal/Compliance",  sentAt: wDate(WIN, 3, 2), followUpCompleted: true  },
    ],
  });

  // ── Deposit Settlement (former tenant of unit 104) ───────────────────────────
  // Hannah Pierce vacated 31 Jan 2026. Deposit of £3,700 settled with two
  // deductions — drives the deposit-settlement UI on the vacated tenant page.
  await prisma.depositSettlement.create({
    data: {
      tenantId: formerTenant104.id,
      depositHeld: 3700,
      deductions: [
        { description: "Professional cleaning — exit clean (kitchen + bathroom)", amount: 280 },
        { description: "Wall repair & repainting — bedroom 1 (picture-hook damage)", amount: 180 },
      ],
      totalDeductions: 460,
      netRefunded: 3240,
      settledDate: wDate(WIN, 1, 12),
      notes: "Inventory check-out completed at move-out. Deductions agreed with tenant via email. Refund issued via BACS.",
    },
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
      kpiStartDate: subY(now, 1),
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
    } else if (demo.key === "kilimani-court") {
      const property = await seedKilimaniCourt(organizationId);
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
