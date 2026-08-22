/**
 * Per-tutorial recording preconditions.
 *
 * Idempotent: every ensure* function checks before it creates, so running the
 * recorder repeatedly never duplicates data. Everything is scoped to the
 * recording account's organisation (guide@groundworkpm.com by default —
 * the same dedicated demo org used by scripts/capture-screenshots.js).
 *
 * SAFETY: refuses to run unless DATABASE_URL points at localhost or a
 * Supabase project whose hostname contains "dev". Never run this against
 * production.
 */
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as XLSX from "xlsx";
import type { TutorialKey } from "../../src/lib/tutorial-videos";

const RECORD_EMAIL = process.env.RECORD_EMAIL ?? "guide@groundworkpm.com";
const BASE_URL = process.env.RECORD_BASE_URL ?? "http://localhost:3000";
export const FIXTURES_DIR = path.join(__dirname, "fixtures");

function assertSafeDatabase(): void {
  const url = process.env.DATABASE_URL ?? "";
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("DATABASE_URL is not set or not a valid URL — refusing to seed.");
  }
  const safe = host === "localhost" || host === "127.0.0.1" || host.includes("dev");
  if (!safe) {
    throw new Error(
      `DATABASE_URL host "${host}" is neither localhost nor a "dev" project — refusing to seed recording state. ` +
        "Never run the tutorial recorder against production."
    );
  }
}

const prisma = new PrismaClient();

// ── Shared context ────────────────────────────────────────────────────────────

type Ctx = {
  orgId: string;
  userId: string;
  property: { id: string; name: string; currency: string };
  units: { id: string; unitNumber: string; monthlyRent: number | null }[];
  tenants: { id: string; name: string; unitId: string; monthlyRent: unknown }[];
};

async function loadContext(): Promise<Ctx> {
  const user = await prisma.user.findUnique({ where: { email: RECORD_EMAIL } });
  if (!user?.organizationId) {
    throw new Error(
      `Recording user ${RECORD_EMAIL} not found (or has no active org) in this database. ` +
        "Create the dedicated recording org first — see docs/tutorials/README.md."
    );
  }
  const access = await prisma.propertyAccess.findFirst({
    where: { userId: user.id },
    include: { property: true },
    orderBy: { property: { createdAt: "asc" } },
  });
  const property =
    access?.property ??
    (await prisma.property.findFirst({ where: { organizationId: user.organizationId } }));
  if (!property) throw new Error("Recording org has no property — seed a demo first.");

  const units = await prisma.unit.findMany({ where: { propertyId: property.id } });
  const tenants = await prisma.tenant.findMany({
    where: { unit: { propertyId: property.id }, isActive: true },
  });
  return {
    orgId: user.organizationId,
    userId: user.id,
    property: { id: property.id, name: property.name, currency: property.currency },
    units: units.map((u) => ({
      id: u.id,
      unitNumber: u.unitNumber,
      monthlyRent: u.monthlyRent === null ? null : Number(u.monthlyRent),
    })),
    tenants: tenants.map((t) => ({ id: t.id, name: t.name, unitId: t.unitId, monthlyRent: t.monthlyRent })),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function ensureInvoice(opts: {
  tenantId: string;
  amount: number;
  status: "SENT" | "PAID" | "OVERDUE";
  year: number;
  month: number;
}): Promise<{ id: string }> {
  const existing = await prisma.invoice.findFirst({
    where: { tenantId: opts.tenantId, periodYear: opts.year, periodMonth: opts.month },
  });
  if (existing) return existing;
  const count = await prisma.invoice.count();
  return prisma.invoice.create({
    data: {
      invoiceNumber: `REC-${opts.year}${String(opts.month).padStart(2, "0")}-${count + 1}`,
      tenantId: opts.tenantId,
      periodYear: opts.year,
      periodMonth: opts.month,
      rentAmount: opts.amount,
      totalAmount: opts.amount,
      dueDate: new Date(opts.year, opts.month - 1, 5),
      status: opts.status,
      ...(opts.status === "PAID" ? { paidAt: new Date(), paidAmount: opts.amount } : {}),
    },
  });
}

// A 1×1 red PNG — stands in for an M-Pesa screenshot in the proof upload.
const SAMPLE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

// ── Per-tutorial seeds ────────────────────────────────────────────────────────

async function seedFirst15(ctx: Ctx): Promise<void> {
  // A fresh, honest empty state: 2 units, no tenants, no money recorded.
  let prop = await prisma.property.findFirst({
    where: { organizationId: ctx.orgId, name: "Harbour View" },
  });
  if (!prop) {
    prop = await prisma.property.create({
      data: {
        name: "Harbour View",
        type: "LONGTERM",
        currency: ctx.property.currency,
        organizationId: ctx.orgId,
      },
    });
    await prisma.unit.createMany({
      data: [
        // VACANT so the Add Tenant modal (vacant/listed-only) offers them.
        { unitNumber: "A1", propertyId: prop.id, type: "ONE_BED", monthlyRent: 850, status: "VACANT" },
        { unitNumber: "A2", propertyId: prop.id, type: "TWO_BED", monthlyRent: 1200, status: "VACANT" },
      ],
    });
  }
  // Every org member must see it (mirrors the demo-seed grantAccess pattern).
  const members = await prisma.userOrganizationMembership.findMany({
    where: { organizationId: ctx.orgId },
  });
  await prisma.propertyAccess.createMany({
    data: members.map((m) => ({ userId: m.userId, propertyId: prop!.id })),
    skipDuplicates: true,
  });
  // Reset to "no tenant yet" so the video can add one live. Include any
  // stray "Amina Yusuf" from earlier recording runs, wherever she landed.
  const stale = await prisma.tenant.findMany({
    where: { OR: [{ unit: { propertyId: prop.id } }, { name: "Amina Yusuf" }] },
    select: { id: true, unitId: true },
  });
  if (stale.length) {
    const ids = stale.map((t) => t.id);
    await prisma.incomeEntry.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.invoice.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.unit.updateMany({ where: { propertyId: prop.id }, data: { status: "VACANT" } });
  console.log(`  ✓ Harbour View reset (${prop.id}) — 2 units, no tenants`);
}

async function seedPettyCash(ctx: Ctx): Promise<void> {
  const float = await prisma.pettyCash.findFirst({
    where: { propertyId: ctx.property.id, type: "IN", description: "Recording float top-up" },
  });
  if (!float) {
    await prisma.pettyCash.create({
      data: {
        date: new Date(),
        type: "IN",
        amount: 500,
        description: "Recording float top-up",
        propertyId: ctx.property.id,
        organizationId: ctx.orgId,
        status: "APPROVED",
      },
    });
  }
  const unlinked = await prisma.pettyCash.findFirst({
    where: { propertyId: ctx.property.id, type: "OUT", expenseEntryId: null, status: "APPROVED" },
  });
  if (!unlinked) {
    await prisma.pettyCash.create({
      data: {
        date: new Date(Date.now() - 7 * 86400_000),
        type: "OUT",
        amount: 45,
        description: "Stationery purchase (unrecorded)",
        propertyId: ctx.property.id,
        organizationId: ctx.orgId,
        status: "APPROVED",
      },
    });
  }
  console.log("  ✓ petty cash float + one unlinked OUT present");
}

async function seedInvoiceIncomeLink(ctx: Ctx): Promise<void> {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  // Guarantee at least 3 SENT invoices this month (the demo data may already
  // hold PAID ones for some tenants — those don't count).
  let sent = await prisma.invoice.count({
    where: { status: "SENT", periodYear: y, periodMonth: m, tenantId: { in: ctx.tenants.map((t) => t.id) } },
  });
  for (const t of ctx.tenants) {
    if (sent >= 3) break;
    const rent = Number(t.monthlyRent) || 1000;
    const inv = await ensureInvoice({ tenantId: t.id, amount: rent, status: "SENT", year: y, month: m });
    const fresh = await prisma.invoice.findUnique({ where: { id: inv.id } });
    if (fresh?.status === "SENT") sent++;
  }
  if (sent < 3) {
    // Existing non-SENT invoices block the unique period slot — flip spares back.
    const flippable = await prisma.invoice.findMany({
      where: {
        status: { in: ["DRAFT", "OVERDUE"] },
        periodYear: y,
        periodMonth: m,
        tenantId: { in: ctx.tenants.map((t) => t.id) },
      },
      take: 3 - sent,
    });
    for (const inv of flippable) {
      await prisma.invoice.update({ where: { id: inv.id }, data: { status: "SENT" } });
      sent++;
    }
  }
  if (sent < 2) {
    // Last resort: revert PAID demo invoices (delete their linked income rows
    // first so the books stay consistent — this is a dev-only recording DB).
    const paid = await prisma.invoice.findMany({
      where: { status: "PAID", periodYear: y, periodMonth: m, tenantId: { in: ctx.tenants.map((t) => t.id) } },
      take: 3 - sent,
    });
    for (const inv of paid) {
      await prisma.incomeEntry.deleteMany({ where: { invoiceId: inv.id } });
      await prisma.invoice.update({
        where: { id: inv.id },
        data: { status: "SENT", paidAt: null, paidAmount: null },
      });
      sent++;
    }
  }
  console.log(`  ✓ ${sent} SENT invoices ready for ${y}-${m}`);
}

async function seedProofOfPayment(ctx: Ctx): Promise<void> {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  fs.writeFileSync(path.join(FIXTURES_DIR, "mpesa-confirmation.png"), SAMPLE_PNG);
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;

  // Tenant A: has a portal token + an open invoice (the live portal beat).
  const tenantA = await prisma.tenant.findFirst({
    where: { id: { in: ctx.tenants.map((t) => t.id) } },
    orderBy: { name: "asc" },
  });
  if (!tenantA) throw new Error("No active tenant for proof-of-payment seed.");
  let token = tenantA.portalToken;
  if (!token) {
    token = randomUUID();
    await prisma.tenant.update({
      where: { id: tenantA.id },
      data: { portalToken: token, portalTokenExpiresAt: new Date(Date.now() + 90 * 86400_000) },
    });
  }
  const invA = await ensureInvoice({
    tenantId: tenantA.id,
    amount: Number(tenantA.monthlyRent) || 1000,
    status: "SENT",
    year: y,
    month: m,
  });
  // The demo data may already hold this period's invoice as PAID — the portal
  // only offers "I've Paid This" on SENT/OVERDUE, so force it back (dev DB).
  const invAFresh = await prisma.invoice.findUnique({ where: { id: invA.id } });
  if (invAFresh && !["SENT", "OVERDUE"].includes(invAFresh.status)) {
    await prisma.incomeEntry.deleteMany({ where: { invoiceId: invA.id } });
    await prisma.invoice.update({
      where: { id: invA.id },
      data: {
        status: "SENT",
        paidAt: null,
        paidAmount: null,
        proofOfPaymentUrl: null,
        proofOfPaymentText: null,
        proofOfPaymentType: null,
        proofSubmittedAt: null,
      },
    });
  }

  // Tenant B (or A's previous month): an invoice already PENDING_VERIFICATION
  // with a real file proof, submitted through the actual portal API so the
  // storage upload is genuine and the drawer preview works.
  const prevM = m === 1 ? 12 : m - 1;
  const prevY = m === 1 ? y - 1 : y;
  const invB = await ensureInvoice({
    tenantId: tenantA.id,
    amount: Number(tenantA.monthlyRent) || 1000,
    status: "SENT",
    year: prevY,
    month: prevM,
  });
  let fresh = await prisma.invoice.findUnique({ where: { id: invB.id } });
  // Same demo-data caveat: the proof endpoint only accepts SENT/OVERDUE.
  if (fresh && !["SENT", "OVERDUE", "PENDING_VERIFICATION"].includes(fresh.status)) {
    await prisma.incomeEntry.deleteMany({ where: { invoiceId: invB.id } });
    fresh = await prisma.invoice.update({
      where: { id: invB.id },
      data: { status: "SENT", paidAt: null, paidAmount: null },
    });
  }
  if (fresh && fresh.status !== "PENDING_VERIFICATION") {
    const form = new FormData();
    form.append("file", new Blob([SAMPLE_PNG], { type: "image/png" }), "mpesa-confirmation.png");
    form.append("text", "TFA9K2M1XQ Confirmed. Ksh45,000.00 sent to GROUNDWORK PM");
    const res = await fetch(`${BASE_URL}/api/portal/${token}/invoices/${invB.id}/proof`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      console.warn(
        `  ⚠ proof submission via portal API failed (${res.status}) — ` +
          "is the dev server running and Supabase storage configured? Falling back to text-only proof."
      );
      await prisma.invoice.update({
        where: { id: invB.id },
        data: {
          status: "PENDING_VERIFICATION",
          proofOfPaymentText: "TFA9K2M1XQ Confirmed. Ksh45,000.00 sent to GROUNDWORK PM",
          proofOfPaymentType: "TEXT",
          proofSubmittedAt: new Date(),
        },
      });
    }
  }
  console.log(`  ✓ portal token + PENDING_VERIFICATION invoice ready (tenant ${tenantA.name})`);
}

async function seedBulkImport(ctx: Ctx): Promise<void> {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });

  // Tenants file: 3 valid rows + 1 deliberately broken (missing Monthly Rent).
  const tenantHeaders = ["Name", "Unit Number", "Monthly Rent", "Lease Start", "Property Name"];
  const hint = ["REQUIRED", "REQUIRED", "REQUIRED", "REQUIRED", "optional"];
  const unit = ctx.units[0]?.unitNumber ?? "A1";
  const unit2 = ctx.units[1]?.unitNumber ?? unit;
  const start = new Date().toISOString().slice(0, 10);
  const tenantRows = [
    ["Imogen Carter", unit, 950, start, ctx.property.name],
    ["Farid Hassan", unit2, 1100, start, ctx.property.name],
    ["Lena Okafor", unit, 990, start, ctx.property.name],
    ["Broken Row", unit2, "", start, ctx.property.name], // missing rent → validation error beat
  ];
  const wb1 = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb1,
    XLSX.utils.aoa_to_sheet([tenantHeaders, hint, ...tenantRows]),
    "Data"
  );
  XLSX.writeFile(wb1, path.join(FIXTURES_DIR, "tenants-import.xlsx"));

  console.log(`  ✓ fixtures written to ${FIXTURES_DIR}`);
}

async function seedCases(ctx: Ctx): Promise<void> {
  // Idempotence: remove the job (and its case) created by earlier recording runs.
  const oldJobs = await prisma.maintenanceJob.findMany({
    where: { title: "Leaking kitchen tap" },
    select: { id: true, caseThreadId: true },
  });
  for (const j of oldJobs) {
    await prisma.maintenanceJob.delete({ where: { id: j.id } });
    if (j.caseThreadId) {
      await prisma.caseThread.delete({ where: { id: j.caseThreadId } }).catch(() => {});
    }
  }
  const vendor = await prisma.vendor.findFirst({
    where: { organizationId: ctx.orgId, isActive: true },
  });
  if (!vendor) {
    await prisma.vendor.create({
      data: {
        organizationId: ctx.orgId,
        name: "Rapid Plumbing Co.",
        category: "CONTRACTOR",
        phone: "+254 700 000000",
        email: "jobs@rapidplumbing.example",
      },
    });
  }
  console.log("  ✓ vendor registry has an active vendor");
}

async function seedCheckout(ctx: Ctx): Promise<void> {
  // Idempotence: drop IN_PROGRESS drafts left behind by earlier recording runs
  // (deductions cascade). COMPLETED checkouts are never touched.
  await prisma.checkoutProcess.deleteMany({
    where: { status: "IN_PROGRESS", tenant: { unit: { propertyId: ctx.property.id } } },
  });
  // A tenant with a verified deposit trail, one unpaid invoice, no checkout yet.
  const candidates = await prisma.tenant.findMany({
    where: { id: { in: ctx.tenants.map((t) => t.id) }, checkoutProcess: null },
    orderBy: { name: "desc" },
  });
  const tenant = candidates[0];
  if (!tenant) throw new Error("Every tenant already has a CheckoutProcess — add a tenant first.");

  const deposit = await prisma.incomeEntry.findFirst({
    where: { tenantId: tenant.id, type: "DEPOSIT" },
  });
  if (!deposit) {
    await prisma.incomeEntry.create({
      data: {
        date: tenant.leaseStart,
        unitId: tenant.unitId,
        tenantId: tenant.id,
        type: "DEPOSIT",
        grossAmount: tenant.depositAmount,
        note: "Security deposit (recording seed)",
      },
    });
  }
  const now = new Date();
  await ensureInvoice({
    tenantId: tenant.id,
    amount: Number(tenant.monthlyRent) || 1000,
    status: "SENT",
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  });
  console.log(`  ✓ checkout candidate ready: ${tenant.name}`);
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function seedForTutorial(key: TutorialKey): Promise<void> {
  assertSafeDatabase();
  const ctx = await loadContext();
  console.log(`Seeding preconditions for "${key}" in org ${ctx.orgId} (${ctx.property.name})`);
  switch (key) {
    case "first-15-minutes":
      return seedFirst15(ctx);
    case "petty-cash-vs-expenses":
      return seedPettyCash(ctx);
    case "invoice-income-link":
      return seedInvoiceIncomeLink(ctx);
    case "proof-of-payment":
      return seedProofOfPayment(ctx);
    case "bulk-import":
      return seedBulkImport(ctx);
    case "cases-and-approvals":
      return seedCases(ctx);
    case "tenant-checkout":
      return seedCheckout(ctx);
  }
}

export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}

export { prisma };
