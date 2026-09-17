/* eslint-disable no-console, @typescript-eslint/no-explicit-any */
/**
 * Utility metering smoke test — drives the real API end to end against a live
 * dev server (default http://localhost:3000).
 *
 *   npx tsx scripts/utilities-smoke.ts            # BASE_URL env overrides the target
 *
 * Seeds (idempotently) a "Utilities Smoke Org" with one property, three units
 * (two let, one vacant), a manager, a caretaker and an outsider from another
 * org; wipes the previous run's meters / readings / invoices; then walks:
 * meters + tariffs → caretaker readings (units only, own rows only) → manager
 * approval → invoices with the rent → split payments → stragglers, cancel,
 * void. Exit code 1 on any failure.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PASSWORD = "smoke-pass-123";
const EMAILS = {
  manager: "util-manager@groundworkpm.test",
  caretaker: "util-caretaker@groundworkpm.test",
  caretaker2: "util-caretaker2@groundworkpm.test",
  outsider: "util-outsider@groundworkpm.test",
};

const prisma = new PrismaClient();

class Client {
  private jar = new Map<string, string>();
  constructor(public label: string) {}
  private absorb(res: Response) {
    const raw: string[] =
      typeof (res.headers as any).getSetCookie === "function"
        ? (res.headers as any).getSetCookie()
        : ([res.headers.get("set-cookie")].filter(Boolean) as string[]);
    for (const c of raw) {
      const [pair] = c.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) this.jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }
  async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.jar.size) headers.set("cookie", Array.from(this.jar.entries()).map(([k, v]) => `${k}=${v}`).join("; "));
    const res = await fetch(BASE + path, { ...init, headers, redirect: "manual" });
    this.absorb(res);
    return res;
  }
  async json(path: string, init: RequestInit & { json?: unknown } = {}): Promise<{ status: number; body: any }> {
    const headers = new Headers(init.headers);
    let body = init.body;
    if (init.json !== undefined) {
      headers.set("content-type", "application/json");
      body = JSON.stringify(init.json);
    }
    const res = await this.fetch(path, { ...init, headers, body });
    let parsed: any = null;
    try { parsed = await res.json(); } catch { /* non-JSON */ }
    return { status: res.status, body: parsed };
  }
  async login(email: string) {
    const { csrfToken } = (await (await this.fetch("/api/auth/csrf")).json()) as { csrfToken: string };
    const form = new URLSearchParams({ csrfToken, email, password: PASSWORD, callbackUrl: BASE + "/" });
    const res = await this.fetch("/api/auth/callback/credentials", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    if (!Array.from(this.jar.keys()).some((k) => k.includes("session-token"))) {
      throw new Error(`${this.label}: login failed (${res.status})`);
    }
  }
}

const results: { name: string; ok: boolean; detail?: string }[] = [];
function check(name: string, ok: boolean, detail?: unknown) {
  results.push({ name, ok, detail: ok ? undefined : typeof detail === "string" ? detail : JSON.stringify(detail) });
  console.log(`${ok ? "  ok  " : " FAIL "} ${name}${ok || detail === undefined ? "" : `  →  ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`);
}

/** Every key anywhere in a JSON value. */
function allKeys(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => allKeys(x, out));
  else if (v && typeof v === "object") {
    for (const [k, val] of Object.entries(v)) { out.add(k); allKeys(val, out); }
  }
  return out;
}

async function seed() {
  const hashed = await bcrypt.hash(PASSWORD, 10);
  const orgFor = async (name: string) =>
    (await prisma.organization.findFirst({ where: { name } })) ??
    (await prisma.organization.create({ data: { name, pricingTier: "PRO", freeAccess: true } as any }));
  const org = await orgFor("Utilities Smoke Org");
  const otherOrg = await orgFor("Utilities Smoke Other Org");

  const property =
    (await prisma.property.findFirst({ where: { organizationId: org.id, name: "Meter Court" } })) ??
    (await prisma.property.create({ data: { name: "Meter Court", type: "LONGTERM", currency: "KES", organizationId: org.id } }));

  const unitFor = async (unitNumber: string) =>
    (await prisma.unit.findFirst({ where: { propertyId: property.id, unitNumber } })) ??
    (await prisma.unit.create({ data: { propertyId: property.id, unitNumber, type: "ONE_BED", monthlyRent: 20000 } as any }));
  const [u1, u2, u3] = [await unitFor("M1"), await unitFor("M2"), await unitFor("M3")];

  const tenantFor = async (unitId: string, name: string) =>
    (await prisma.tenant.findFirst({ where: { unitId, name } })) ??
    (await prisma.tenant.create({
      data: { name, unitId, email: null, phone: "0711000001", depositAmount: 20000, monthlyRent: 20000, leaseStart: new Date("2026-01-01"), isActive: true } as any,
    }));
  let [t1, t2] = [await tenantFor(u1.id, "Meter Tenant One"), await tenantFor(u2.id, "Meter Tenant Two")];
  if (!t1.portalToken) t1 = await prisma.tenant.update({ where: { id: t1.id }, data: { portalToken: `util-portal-1-${Date.now()}`, portalTokenExpiresAt: null } });
  if (!t2.portalToken) t2 = await prisma.tenant.update({ where: { id: t2.id }, data: { portalToken: `util-portal-2-${Date.now()}`, portalTokenExpiresAt: null } });

  async function user(email: string, name: string, role: "ADMIN" | "CARETAKER", organizationId: string, propertyId?: string) {
    const u = await prisma.user.upsert({
      where: { email },
      create: { email, name, password: hashed, role, organizationId, isActive: true },
      update: { password: hashed, role, organizationId, isActive: true },
    });
    await prisma.userOrganizationMembership.upsert({
      where: { userId_organizationId: { userId: u.id, organizationId } },
      create: { userId: u.id, organizationId, role },
      update: { role },
    });
    if (propertyId) {
      await prisma.propertyAccess.upsert({
        where: { userId_propertyId: { userId: u.id, propertyId } },
        create: { userId: u.id, propertyId },
        update: {},
      });
    }
    return u;
  }
  await user(EMAILS.manager, "Util Manager", "ADMIN", org.id);
  await user(EMAILS.caretaker, "Util Caretaker", "CARETAKER", org.id, property.id);
  await user(EMAILS.caretaker2, "Util Caretaker Two", "CARETAKER", org.id, property.id);
  await user(EMAILS.outsider, "Util Outsider", "ADMIN", otherOrg.id);

  // Wipe the previous run (meters cascade to readings).
  const tenantIds = [t1.id, t2.id];
  await prisma.incomeEntry.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.utilityMeter.deleteMany({ where: { propertyId: property.id } });
  await prisma.invoice.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.utilityTariff.deleteMany({ where: { propertyId: property.id } });
  await prisma.utilitySetting.deleteMany({ where: { propertyId: property.id } });
  await prisma.expenseEntry.deleteMany({ where: { propertyId: property.id, category: { in: ["WATER", "ELECTRICITY", "GENERATOR"] } } });

  return { property, u1, u2, u3, t1, t2 };
}

async function main() {
  const { property, u1, u2, u3, t1, t2 } = await seed();
  const mgr = new Client("manager");
  const care = new Client("caretaker");
  const care2 = new Client("caretaker2");
  const out = new Client("outsider");
  await Promise.all([mgr.login(EMAILS.manager), care.login(EMAILS.caretaker), care2.login(EMAILS.caretaker2), out.login(EMAILS.outsider)]);
  console.log("logged in\n");

  const now = new Date();
  const inv = { year: now.getFullYear(), month: now.getMonth() + 1 }; // invoice period = this month
  const rd = inv.month === 1 ? { year: inv.year - 1, month: 12 } : { year: inv.year, month: inv.month - 1 }; // reading period = last month
  const next = inv.month === 12 ? { year: inv.year + 1, month: 1 } : { year: inv.year, month: inv.month + 1 };
  const lastDayOfReadingMonth = new Date(Date.UTC(rd.year, rd.month, 0, 12)).toISOString();
  const P = property.id;

  // ── 1. Meters ────────────────────────────────────────────────────────────
  console.log("— meters & tariffs");
  let r = await mgr.json("/api/utilities/meters", { method: "POST", json: { bulk: true, propertyId: P, utility: "WATER", label: "Water" } });
  check("manager bulk-creates a water meter per unit", r.status === 201 && r.body.created === 3, r);
  r = await mgr.json("/api/utilities/meters", { method: "POST", json: { bulk: true, propertyId: P, utility: "WATER", label: "Water" } });
  check("bulk create is idempotent", r.body.created === 0 && r.body.skipped === 3, r);
  r = await mgr.json("/api/utilities/meters", { method: "POST", json: { propertyId: P, unitId: u1.id, utility: "WATER", role: "UNIT", label: "Hot water", openingReading: 46.8, ratePerUnitOverride: 350 } });
  check("hot-water meter with its own rate", r.status === 201 && r.body.ratePerUnitOverride === 350, r);
  r = await mgr.json("/api/utilities/meters", { method: "POST", json: { propertyId: P, utility: "WATER", role: "UNIT", label: "No unit" } });
  check("a unit meter needs a unit (400)", r.status === 400, r);
  r = await mgr.json("/api/utilities/meters", { method: "POST", json: { propertyId: P, unitId: u1.id, utility: "ELECTRICITY", role: "UNIT", label: "Electricity", openingReading: 1000 } });
  check("electricity check meter on M1", r.status === 201, r);
  r = await mgr.json("/api/utilities/meters", { method: "POST", json: { propertyId: P, unitId: u2.id, utility: "ELECTRICITY", role: "UNIT", label: "Electricity", openingReading: 100 } });
  check("electricity check meter on M2", r.status === 201, r);
  r = await mgr.json("/api/utilities/meters", { method: "POST", json: { propertyId: P, utility: "ELECTRICITY", role: "BULK", label: "KPLC bulk meter", openingReading: 50000, ratePerUnitOverride: 99 } });
  check("bulk KPLC meter has no unit and never a rate", r.status === 201 && r.body.unitId === null && r.body.ratePerUnitOverride === null, r);
  r = await mgr.json("/api/utilities/meters", { method: "POST", json: { propertyId: P, utility: "ELECTRICITY", role: "COMMON", label: "Common areas", openingReading: 200 } });
  check("common-area meter", r.status === 201, r);
  r = await care.json("/api/utilities/meters", { method: "POST", json: { propertyId: P, unitId: u3.id, utility: "WATER", role: "UNIT", label: "Sneaky" } });
  check("caretaker cannot create meters (403)", r.status === 403, r);

  // ── 2. Tariffs ───────────────────────────────────────────────────────────
  r = await care.json("/api/utilities/tariffs", { method: "POST", json: { propertyId: P, utility: "WATER", effectiveFrom: "2026-01-01", supplyRate: 1 } });
  check("caretaker cannot set a tariff (403)", r.status === 403, r);
  r = await care.json(`/api/utilities/tariffs?propertyId=${P}`);
  check("caretaker cannot read tariffs (403)", r.status === 403, r);
  r = await mgr.json("/api/utilities/tariffs", { method: "POST", json: { propertyId: P, utility: "WATER", effectiveFrom: "2026-01-01", supplyRate: 150 } });
  check("water tariff 150", r.status === 201 && r.body.supplyRate === 150 && r.body.fuelRate === 0, r);
  r = await mgr.json("/api/utilities/tariffs", { method: "POST", json: { propertyId: P, utility: "WATER", effectiveFrom: "2026-01-15", supplyRate: 150, fuelRate: 40 } });
  check("same month replaces the row, water never takes a fuel rate", r.status === 200 && r.body.fuelRate === 0, r);
  r = await mgr.json("/api/utilities/tariffs", { method: "POST", json: { propertyId: P, utility: "ELECTRICITY", effectiveFrom: "2026-01-01", supplyRate: 25, fuelRate: 5 } });
  check("electricity tariff 25 + 5 fuel", r.status === 201 && r.body.fuelRate === 5, r);

  // ── 3. Caretaker projection ──────────────────────────────────────────────
  console.log("\n— caretaker sees units only");
  r = await care.json(`/api/utilities/meters?propertyId=${P}`);
  const meters: any[] = r.body ?? [];
  check("caretaker lists the meters", r.status === 200 && meters.length === 8, r.status + " / " + meters.length);
  check("…without any meter's own rate", !allKeys(meters).has("ratePerUnitOverride"));
  r = await out.json(`/api/utilities/meters?propertyId=${P}`);
  check("another org's manager is refused (403)", r.status === 403, r);
  r = await out.json(`/api/utilities/readings?propertyId=${P}&year=${rd.year}&month=${rd.month}`);
  check("…and cannot read the sheet (403)", r.status === 403, r);

  const m = (unitId: string | null, label: string) => meters.find((x) => x.unitId === unitId && x.label === label)!;
  const waterM1 = m(u1.id, "Water"), hotM1 = m(u1.id, "Hot water"), waterM2 = m(u2.id, "Water"), waterM3 = m(u3.id, "Water");
  const elecM1 = m(u1.id, "Electricity"), elecM2 = m(u2.id, "Electricity");
  const bulk = meters.find((x) => x.role === "BULK")!, common = meters.find((x) => x.role === "COMMON")!;

  // ── 4. Caretaker submits readings ────────────────────────────────────────
  console.log("\n— readings");
  const submit = (c: Client, meterId: string, currentReading: number, extra: Record<string, unknown> = {}, period = rd, date = lastDayOfReadingMonth) =>
    c.json("/api/utilities/readings", { method: "POST", json: { meterId, periodYear: period.year, periodMonth: period.month, readingDate: date, currentReading, ...extra } });

  r = await submit(care, waterM1.id, 5);
  check("water 0 → 5 = 5 units", r.status === 201 && r.body.previousReading === 0 && r.body.consumption === 5, r);
  const readingWaterM1 = r.body.id;
  check("…response carries no money", !["amount", "ratePerUnit"].some((k) => allKeys(r.body).has(k)));
  r = await submit(care, hotM1.id, 48.7);
  check("hot water 46.80 → 48.70 = 1.9 (no float noise)", r.status === 201 && r.body.consumption === 1.9, r);
  r = await submit(care, waterM2.id, 3);
  check("water M2 = 3", r.status === 201 && r.body.consumption === 3, r);
  const readingWaterM2 = r.body.id;
  r = await submit(care, waterM3.id, 2);
  check("vacant M3 read too", r.status === 201, r);
  r = await submit(care, elecM1.id, 1100);
  check("electricity M1 = 100 kWh", r.status === 201 && r.body.consumption === 100, r);
  r = await submit(care, elecM2.id, 90);
  check("a reading below the previous one is saved as negative", r.status === 201 && r.body.consumption === -10, r);
  const readingElecM2 = r.body.id;
  r = await submit(care, bulk.id, 50500);
  check("bulk meter = 500 kWh", r.status === 201 && r.body.consumption === 500, r);
  r = await submit(care, common.id, 250);
  check("common areas = 50 kWh", r.status === 201 && r.body.consumption === 50, r);

  r = await submit(care, waterM1.id, 6);
  check("second reading for the month is refused (409 READING_EXISTS)", r.status === 409 && r.body.code === "READING_EXISTS", r);
  r = await submit(care2, waterM2.id, 9, { previousOverride: 1, previousOverrideReason: "x" }, next, new Date().toISOString());
  check("caretaker cannot override the previous reading (403)", r.status === 403, r);
  r = await submit(care, waterM1.id, 9, {}, rd, new Date(Date.now() + 5 * 86_400_000).toISOString());
  check("future reading date refused (400)", r.status === 400, r);

  r = await care.json(`/api/utilities/readings?propertyId=${P}&year=${rd.year}&month=${rd.month}`);
  const careKeys = allKeys(r.body);
  const leaked = ["amount", "ratePerUnit", "estimatedAmount", "estimatedRate", "invoiceId", "invoiceNumber", "anomalies", "tenantName"].filter((k) => careKeys.has(k));
  check("caretaker sheet: 8 rows, no rates / amounts / invoices", r.status === 200 && r.body.rows.length === 8 && leaked.length === 0, leaked);

  r = await care2.json(`/api/utilities/readings/${readingWaterM1}`, { method: "PATCH", json: { currentReading: 7 } });
  check("another caretaker cannot change the reading (403)", r.status === 403, r);
  r = await care.json(`/api/utilities/readings/${readingWaterM1}`, { method: "PATCH", json: { currentReading: 5 } });
  check("caretaker may correct their own submitted reading", r.status === 200 && r.body.consumption === 5, r);
  r = await care.json("/api/utilities/readings/approve", { method: "POST", json: { ids: [readingWaterM1] } });
  check("caretaker cannot approve (403)", r.status === 403, r);
  r = await care.json("/api/utilities/bill", { method: "POST", json: { propertyId: P, year: inv.year, month: inv.month } });
  check("caretaker cannot bill (403)", r.status === 403, r);

  // ── 5. Manager review & approval ─────────────────────────────────────────
  console.log("\n— approval");
  r = await mgr.json(`/api/utilities/readings?propertyId=${P}&year=${rd.year}&month=${rd.month}`);
  const sheetRow = (meterId: string) => r.body.rows.find((x: any) => x.meterId === meterId);
  check("manager sheet shows the estimate (5 × 150 = 750)", sheetRow(waterM1.id)?.reading?.estimatedAmount === 750, sheetRow(waterM1.id)?.reading);
  check("…the hot-water estimate uses the meter's rate (1.9 × 350 = 665)", sheetRow(hotM1.id)?.reading?.estimatedAmount === 665);
  check("…electricity estimate uses power + fuel (100 × 30 = 3000)", sheetRow(elecM1.id)?.reading?.estimatedAmount === 3000);
  check("…negative reading is flagged", sheetRow(elecM2.id)?.reading?.anomalies?.[0]?.code === "NEGATIVE");
  check("…vacant unit has no tenant", sheetRow(waterM3.id)?.reading?.tenantName === null);

  const allIds = r.body.rows.map((x: any) => x.reading.id);
  r = await mgr.json("/api/utilities/readings/approve", { method: "POST", json: { ids: allIds } });
  check("approve: 7 pass, the negative one is reported", r.status === 200 && r.body.approved === 7 && r.body.errors.length === 1, r);
  r = await mgr.json(`/api/utilities/readings/${readingElecM2}`, { method: "PATCH", json: { previousOverride: 0, previousOverrideReason: "Meter replaced in the month" } });
  check("manager overrides the previous reading with a reason", r.status === 200 && r.body.consumption === 90, r);
  r = await mgr.json(`/api/utilities/readings/${readingElecM2}`, { method: "PATCH", json: { previousOverride: 0 } });
  check("…but not without one (400)", r.status === 400, r);
  r = await mgr.json("/api/utilities/readings/approve", { method: "POST", json: { ids: [readingElecM2] } });
  check("then approves it", r.body.approved === 1, r);
  r = await care.json(`/api/utilities/readings/${readingWaterM1}`, { method: "PATCH", json: { currentReading: 8 } });
  check("caretaker cannot change an approved reading (409)", r.status === 409, r);

  const dbReading = await prisma.meterReading.findUnique({ where: { id: readingWaterM1 } });
  check("approval snapshots rate + amount + tenant", Number(dbReading?.amount) === 750 && dbReading?.ratePerUnit === 150 && dbReading?.tenantId === t1.id, dbReading);
  const dbBulk = await prisma.meterReading.findFirst({ where: { meterId: bulk.id } });
  check("bulk reading is approved without a price", dbBulk?.status === "APPROVED" && dbBulk.amount === null && dbBulk.tenantId === null);

  // ── 6. Billing with the rent ─────────────────────────────────────────────
  console.log("\n— invoices");
  r = await mgr.json(`/api/utilities/bill?propertyId=${P}&year=${inv.year}&month=${inv.month}`);
  check("preview: 2 tenants, water 1865, electricity 5700", r.body.tenants === 2 && r.body.waterAmount === 1865 && r.body.electricityAmount === 5700, r);
  r = await mgr.json("/api/invoices/bulk", { method: "POST", json: { year: inv.year, month: inv.month, propertyId: P } });
  check("rent invoices generated", r.status === 201 && r.body.created === 2, r);
  const invoices = await prisma.invoice.findMany({ where: { tenantId: { in: [t1.id, t2.id] } }, include: { meterReadings: true } });
  const inv1 = invoices.find((i) => i.tenantId === t1.id)!;
  const inv2 = invoices.find((i) => i.tenantId === t2.id)!;
  check("M1 invoice = rent 20,000 + water 1,415 + electricity 3,000", Number(inv1.waterAmount) === 1415 && Number(inv1.electricityAmount) === 3000 && Number(inv1.totalAmount) === 24415 && inv1.meterReadings.length === 3, inv1);
  check("M2 invoice = rent 20,000 + water 450 + electricity 2,700", Number(inv2.totalAmount) === 23150 && inv2.meterReadings.length === 2, inv2);
  r = await mgr.json(`/api/utilities/bill?propertyId=${P}&year=${inv.year}&month=${inv.month}`);
  check("nothing left to bill (vacant unit never billed)", r.body.tenants === 0, r);
  r = await mgr.json(`/api/invoices?propertyId=${P}`);
  const listed = (Array.isArray(r.body) ? r.body : r.body.invoices).find((i: any) => i.id === inv1.id);
  check("invoice list carries the readings behind the lines", listed?.meterReadings?.length === 3 && listed.waterAmount === 1415, listed?.meterReadings);
  const pdf = await mgr.fetch(`/api/invoices/${inv1.id}/pdf`);
  check("invoice PDF renders", pdf.status === 200 && (pdf.headers.get("content-type") ?? "").includes("pdf"), pdf.status);

  r = await mgr.json(`/api/invoices/${inv1.id}`, { method: "PATCH", json: { rentAmount: 21000 } });
  check("editing the rent line keeps the utilities in the total", r.status === 200 && r.body.totalAmount === 25415 && r.body.waterAmount === 1415, r.body?.totalAmount);
  await mgr.json(`/api/invoices/${inv1.id}`, { method: "PATCH", json: { rentAmount: 20000 } });

  // ── 7. Payments ──────────────────────────────────────────────────────────
  console.log("\n— payments");
  r = await mgr.json("/api/income", { method: "POST", json: { date: new Date().toISOString().slice(0, 10), unitId: u1.id, type: "LONGTERM_RENT", grossAmount: 20000, agentCommission: 0 } });
  check("a rent-sized payment is booked as rent only", r.status === 201 && r.body.allocation?.length === 1 && r.body.allocation[0].type === "LONGTERM_RENT", r.body?.allocation ?? r);
  let dbInv1 = await prisma.invoice.findUnique({ where: { id: inv1.id } });
  check("…invoice stays unpaid with 20,000 recorded", dbInv1?.status !== "PAID" && Number(dbInv1?.paidAmount) === 20000, dbInv1?.status);

  r = await mgr.json(`/api/utilities/readings/${readingWaterM1}/void`, { method: "POST", json: { reason: "testing the guard" } });
  check("void refused once a payment is on the invoice (409)", r.status === 409, r);

  // Paid & unpaid statement while M1 has paid the rent only.
  r = await mgr.json(`/api/utilities/statement?propertyId=${P}`);
  const rowOne = r.body?.rows?.find((x: any) => x.tenantId === t1.id);
  check("statement: M1 owes water 1,415 + electricity 3,000 after a rent-only payment",
    r.status === 200 && rowOne?.water.unpaid === 1415 && rowOne?.electricity.unpaid === 3000 && rowOne?.totalUnpaid === 4415, rowOne);
  check("statement totals: 2 tenants owing 7,565", r.body?.totals?.tenantsOwing === 2 && r.body.totals.totalUnpaid === 7565, r.body?.totals);
  r = await care.json(`/api/utilities/statement?propertyId=${P}`);
  check("caretaker cannot open the statement (403)", r.status === 403, r);
  r = await care.json(`/api/utilities/reconciliation?propertyId=${P}`);
  check("caretaker cannot open the reconciliation (403)", r.status === 403, r);
  r = await mgr.json("/api/utilities/statement/remind", { method: "POST", json: { propertyId: P, tenantIds: [t1.id] } });
  check("reminder: a tenant with no email is reported, not skipped", r.status === 200 && r.body.sent === 0 && r.body.failedDetails?.[0]?.error?.includes("email"), r);
  const stPdf = await mgr.fetch(`/api/utilities/statement?propertyId=${P}&format=pdf`);
  check("property statement PDF renders", stPdf.status === 200 && (stPdf.headers.get("content-type") ?? "").includes("pdf"), stPdf.status);

  r = await out.json(`/api/portal/${t1.portalToken}/utilities`);
  check("portal: tenant sees their 3 approved readings, water + hot water + power",
    r.status === 200 && r.body.readings.length === 3 && r.body.totalUnpaid === 4415 && r.body.readings.every((x: any) => x.paymentStatus === "UNPAID"), r.body);
  r = await out.json(`/api/portal/not-a-real-token/utilities`);
  check("portal: a bad token is a 404", r.status === 404, r);

  r = await mgr.json(`/api/invoices/${inv1.id}`, { method: "PATCH", json: { status: "PAID", paidAmount: 24415, paidAt: new Date().toISOString() } });
  check("marking PAID over the part payment", r.status === 200, r);
  let entries = await prisma.incomeEntry.findMany({ where: { invoiceId: inv1.id }, orderBy: { createdAt: "asc" } });
  const summary = entries.map((e) => `${e.type}${e.utilityType ? ":" + e.utilityType : ""}=${Number(e.grossAmount)}`).join(" ");
  check("…books the remainder as tagged utility income", summary === "LONGTERM_RENT=20000 UTILITY_RECOVERY:WATER=1415 UTILITY_RECOVERY:ELECTRICITY=3000", summary);

  r = await mgr.json("/api/invoices/bulk-mark-paid", { method: "POST", json: { ids: [inv2.id] } });
  check("bulk mark paid", r.status === 200 && r.body.paid === 1, r);
  entries = await prisma.incomeEntry.findMany({ where: { invoiceId: inv2.id }, orderBy: { createdAt: "asc" } });
  const summary2 = entries.map((e) => `${e.type}${e.utilityType ? ":" + e.utilityType : ""}=${Number(e.grossAmount)}`).sort().join(" ");
  check("…splits rent / water / electricity", summary2 === "LONGTERM_RENT=20000 UTILITY_RECOVERY:ELECTRICITY=2700 UTILITY_RECOVERY:WATER=450", summary2);

  // ── 7b. After payment: statuses, reconciliation, owner statement ─────────
  console.log("\n— statements & reconciliation");
  r = await out.json(`/api/portal/${t1.portalToken}/utilities`);
  check("portal: every reading flips to PAID", r.body.totalUnpaid === 0 && r.body.readings.every((x: any) => x.paymentStatus === "PAID"), r.body);
  const portalPdf = await out.fetch(`/api/portal/${t1.portalToken}/utilities?format=pdf`);
  check("portal: utility statement PDF renders", portalPdf.status === 200 && (portalPdf.headers.get("content-type") ?? "").includes("pdf"), portalPdf.status);
  r = await mgr.json(`/api/tenants/${t1.id}/utilities`);
  check("tenant page: utilities tab data", r.status === 200 && r.body.readings.length === 3 && r.body.water.billed === 1415, r.body);
  r = await care.json(`/api/tenants/${t1.id}/utilities`);
  check("caretaker cannot read a tenant's utility money (403)", r.status === 403, r);
  r = await mgr.json(`/api/utilities/statement?propertyId=${P}&unpaidOnly=true`);
  check("statement: nobody owes once both invoices are paid", r.body.rows.length === 0, r.body?.rows);

  // The council bill, the KPLC bill and generator fuel, as the Expenses page records them.
  const org = await prisma.property.findUnique({ where: { id: P }, select: { organizationId: true } });
  const today = new Date();
  for (const [category, amount] of [["WATER", 400], ["ELECTRICITY", 4000], ["GENERATOR", 700]] as const) {
    await prisma.expenseEntry.create({
      data: { date: today, propertyId: P, scope: "PROPERTY", category, amount, amountPaid: amount, description: `smoke ${category}`, organizationId: org?.organizationId ?? null } as any,
    });
  }
  r = await mgr.json(`/api/utilities/reconciliation?propertyId=${P}&year=${inv.year}`);
  check("water: collected 1,865 − council 400 = borehole surplus 1,465",
    r.status === 200 && r.body.water.total.collected === 1865 && r.body.water.total.supplierPaid === 400 && r.body.water.total.surplus === 1465, r.body?.water?.total);
  check("electricity: collected 5,700 − KPLC 4,000 − fuel 700 = 1,000 back to the owner",
    r.body.electricity.total.collected === 5700 && r.body.electricity.total.supplierPaid === 4000 && r.body.electricity.total.fuelPaid === 700 && r.body.electricity.total.surplus === 1000, r.body?.electricity?.total);
  r = await mgr.json(`/api/utilities/reconciliation?propertyId=${P}&year=${rd.year}`);
  const et = r.body.electricity.total;
  check("electricity meters: bulk 500 = billed 190 + common 50 + 260 unaccounted",
    et.unitsBulk === 500 && et.unitsBilled === 190 && et.unitsCommon === 50 && et.unitsUnaccounted === 260, et);
  check("…tariff set aside 4,750 for KPLC and 950 for fuel", et.supplyAllocation === 4750 && et.fuelAllocation === 950, et);
  check("water: a vacant unit's 2 units are consumed, not billed", r.body.water.total.unitsVacant === 2 && r.body.water.total.unitsBilled === 9.9, r.body.water.total);

  r = await mgr.json(`/api/report/owner-statement?propertyId=${P}&year=${inv.year}&month=${inv.month}`);
  const stmt = (Array.isArray(r.body) ? r.body : r.body?.statements ?? [])[0];
  check("owner statement: utilities memo (collected 7,565 − costs 5,100 = 2,465)",
    stmt?.utilities?.waterCollected === 1865 && stmt.utilities.electricityCollected === 5700 && stmt.utilities.surplus === 2465, stmt?.utilities);
  check("…and the memo is not a second deduction: net = gross − fee − expenses",
    Math.abs(stmt.netPayable - (stmt.grossIncome - stmt.managementFee - stmt.totalExpenses)) < 0.01 && stmt.grossIncome === 47565, { gross: stmt?.grossIncome, net: stmt?.netPayable });

  // Management-fee base: 10% of RENT only — utilities earn the manager nothing.
  await prisma.property.update({ where: { id: P }, data: { managementFeeRate: 10 } });
  r = await mgr.json(`/api/report/owner-statement?propertyId=${P}&year=${inv.year}&month=${inv.month}`);
  const stmtFee = (Array.isArray(r.body) ? r.body : r.body?.statements ?? [])[0];
  check("management fee is 10% of the 40,000 rent, not of the 47,565 gross", stmtFee?.managementFee === 4000, stmtFee?.managementFee);
  await prisma.property.update({ where: { id: P }, data: { managementFeeRate: null } });

  // ── 8. Stragglers, cancel, void ──────────────────────────────────────────
  console.log("\n— stragglers, cancel, void");
  r = await submit(care, waterM2.id, 7, {}, inv, new Date().toISOString());
  check("this month's reading continues from last month (3 → 7)", r.status === 201 && r.body.previousReading === 3 && r.body.consumption === 4, r);
  const readingNew = r.body.id;
  r = await out.json(`/api/portal/${t2.portalToken}/utilities`);
  check("portal: a reading the manager has not approved is not shown", r.body.readings.every((x: any) => x.id !== readingNew) && r.body.readings.length === 2, r.body?.readings?.length);
  r = await care.json(`/api/utilities/readings/${readingWaterM2}`, { method: "PATCH", json: { currentReading: 4 } });
  check("last month's reading is locked once a later month is read", r.status === 409 || r.status === 403, r);
  await mgr.json("/api/utilities/readings/approve", { method: "POST", json: { ids: [readingNew] } });

  r = await mgr.json("/api/utilities/bill", { method: "POST", json: { propertyId: P, year: next.year, month: next.month } });
  check("no invoice for next month yet → a utilities-only invoice (600)", r.status === 200 && r.body.created.length === 1 && r.body.created[0].total === 600, r);
  const utilInvoiceId = r.body.created[0].invoiceId;
  const utilInv = await prisma.invoice.findUnique({ where: { id: utilInvoiceId } });
  check("…rent 0, water 600", Number(utilInv?.rentAmount) === 0 && Number(utilInv?.waterAmount) === 600 && Number(utilInv?.totalAmount) === 600);

  r = await mgr.json("/api/invoices/bulk", { method: "POST", json: { year: next.year, month: next.month, propertyId: P } });
  check("the rent invoice for that month is still raised beside it", r.body.created === 2, r);

  r = await mgr.json(`/api/invoices/${utilInvoiceId}`, { method: "PATCH", json: { status: "CANCELLED" } });
  check("cancel the utilities invoice", r.status === 200, r);
  r = await mgr.json(`/api/utilities/bill?propertyId=${P}&year=${next.year}&month=${next.month}`);
  check("…the reading is billable again", r.body.tenants === 1 && r.body.waterAmount === 600, r);
  r = await mgr.json(`/api/invoices/${utilInvoiceId}`, { method: "PATCH", json: { status: "SENT" } });
  check("…and the cancelled invoice cannot be revived (400)", r.status === 400, r);

  r = await mgr.json("/api/utilities/bill", { method: "POST", json: { propertyId: P, year: next.year, month: next.month } });
  check("re-billing merges into the unpaid rent invoice", r.body.merged.length === 1 && r.body.merged[0].added === 600, r);
  const mergedId = r.body.merged[0].invoiceId;
  let merged = await prisma.invoice.findUnique({ where: { id: mergedId } });
  check("…total = rent 20,000 + water 600", Number(merged?.totalAmount) === 20600);

  r = await mgr.json(`/api/utilities/readings/${readingNew}/void`, { method: "POST", json: { reason: "wrong meter read" } });
  check("void a billed reading on an unpaid invoice", r.status === 200 && r.body.invoice?.totalAmount === 20000 && r.body.invoice.cancelled === false, r);
  merged = await prisma.invoice.findUnique({ where: { id: mergedId } });
  check("…invoice back to rent only", Number(merged?.waterAmount) === 0 && Number(merged?.totalAmount) === 20000);
  r = await submit(care, waterM2.id, 6, {}, inv, new Date().toISOString());
  check("the meter can be read again for the month (VOID row reused)", r.status === 201 && r.body.id === readingNew && r.body.consumption === 3, r);

  const failed = results.filter((x) => !x.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log("\nFAILED:");
    failed.forEach((f) => console.log(` - ${f.name}${f.detail ? `  →  ${f.detail}` : ""}`));
    process.exitCode = 1;
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
