/* eslint-disable no-console */
/**
 * CARETAKER role smoke test — runs the positive / negative access matrix
 * against a live dev server (default http://localhost:3000).
 *
 *   npx tsx scripts/caretaker-smoke.ts            # BASE_URL env overrides the target
 *
 * Seeds (idempotently) a "Caretaker Smoke Org" with one property + unit and
 * three users — caretaker / manager / accountant — then logs each in through
 * the real credentials flow and hits the routes. Rows created during the run
 * are deleted at the end. Exit code 1 on any failure.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PASSWORD = "smoke-pass-123";
const EMAILS = {
  caretaker:  "smoke-caretaker@groundworkpm.test",
  manager:    "smoke-manager@groundworkpm.test",
  accountant: "smoke-accountant@groundworkpm.test",
};

const prisma = new PrismaClient();

// ── tiny cookie-jar client ──────────────────────────────────────────────────
class Client {
  private jar = new Map<string, string>();
  constructor(public label: string) {}

  private absorb(res: Response) {
    const raw: string[] =
      typeof (res.headers as any).getSetCookie === "function"
        ? (res.headers as any).getSetCookie()
        : [res.headers.get("set-cookie")].filter(Boolean) as string[];
    for (const c of raw) {
      const [pair] = c.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) this.jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }
  private cookieHeader() {
    return Array.from(this.jar.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
  }

  async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.jar.size) headers.set("cookie", this.cookieHeader());
    const res = await fetch(BASE + path, { ...init, headers, redirect: "manual" });
    this.absorb(res);
    return res;
  }
  async json(path: string, init: RequestInit = {}): Promise<{ status: number; body: any; res: Response }> {
    const headers = new Headers(init.headers);
    if (init.body && !(init.body instanceof FormData) && !headers.has("content-type")) headers.set("content-type", "application/json");
    const res = await this.fetch(path, { ...init, headers });
    let body: any = null;
    try { body = await res.json(); } catch { /* non-JSON */ }
    return { status: res.status, body, res };
  }

  async login(email: string) {
    const csrfRes = await this.fetch("/api/auth/csrf");
    const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
    const form = new URLSearchParams({ csrfToken, email, password: PASSWORD, callbackUrl: BASE + "/" });
    const res = await this.fetch("/api/auth/callback/credentials", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const ok = Array.from(this.jar.keys()).some((k) => k.includes("session-token"));
    if (!ok) throw new Error(`${this.label}: login failed (${res.status})`);
  }
}

// ── assertions ──────────────────────────────────────────────────────────────
const results: { name: string; ok: boolean; detail?: string }[] = [];
function check(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? `  — ${detail}` : ""}`);
}
async function expectStatus(c: Client, name: string, path: string, want: number | number[], init: RequestInit = {}) {
  const { status, body } = await c.json(path, init);
  const wants = Array.isArray(want) ? want : [want];
  check(`${c.label}: ${name}`, wants.includes(status), `got ${status} ${JSON.stringify(body)?.slice(0, 120)}`);
  return body;
}
async function expectRedirect(c: Client, name: string, path: string, toPrefix: string) {
  const res = await c.fetch(path);
  const loc = res.headers.get("location") ?? "";
  const ok = (res.status === 302 || res.status === 307 || res.status === 308) && loc.includes(toPrefix);
  check(`${c.label}: ${name}`, ok, `got ${res.status} → ${loc || "(no location)"}`);
}

// ── seed ────────────────────────────────────────────────────────────────────
async function seed() {
  const hashed = await bcrypt.hash(PASSWORD, 10);
  let org = await prisma.organization.findFirst({ where: { name: "Caretaker Smoke Org" } });
  if (!org) {
    org = await prisma.organization.create({
      data: { name: "Caretaker Smoke Org", pricingTier: "PRO", freeAccess: true } as any,
    });
  }
  let property = await prisma.property.findFirst({ where: { organizationId: org.id, name: "Smoke Block A" } });
  if (!property) {
    property = await prisma.property.create({
      data: { name: "Smoke Block A", type: "LONGTERM", currency: "KES", organizationId: org.id },
    });
  }
  let unit = await prisma.unit.findFirst({ where: { propertyId: property.id, unitNumber: "S1" } });
  if (!unit) {
    unit = await prisma.unit.create({ data: { propertyId: property.id, unitNumber: "S1", type: "ONE_BED", monthlyRent: 10000 } as any });
  }

  async function user(email: string, name: string, role: "CARETAKER" | "ADMIN" | "ACCOUNTANT") {
    const u = await prisma.user.upsert({
      where: { email },
      create: { email, name, password: hashed, role, organizationId: org!.id, isActive: true },
      update: { password: hashed, role, organizationId: org!.id, isActive: true },
    });
    await prisma.userOrganizationMembership.upsert({
      where: { userId_organizationId: { userId: u.id, organizationId: org!.id } },
      create: { userId: u.id, organizationId: org!.id, role },
      update: { role },
    });
    if (role !== "ADMIN") {
      await prisma.propertyAccess.upsert({
        where: { userId_propertyId: { userId: u.id, propertyId: property!.id } },
        create: { userId: u.id, propertyId: property!.id },
        update: {},
      });
    }
    return u;
  }

  let tenant = await prisma.tenant.findFirst({ where: { unitId: unit.id, name: "Smoke Tenant" } });
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        name: "Smoke Tenant", phone: "0711000000", email: "smoke-tenant@groundworkpm.test", unitId: unit.id,
        depositAmount: 10000, leaseStart: new Date("2026-01-01"), monthlyRent: 10000, isActive: true,
        nationalId: "12345678", notes: "SECRET NOTE",
      } as any,
    });
  }

  if (!tenant.portalToken) {
    tenant = await prisma.tenant.update({ where: { id: tenant.id }, data: { portalToken: `smoke-portal-${Date.now()}`, portalTokenExpiresAt: null } });
  }

  const caretaker  = await user(EMAILS.caretaker, "Smoke Caretaker", "CARETAKER");
  const manager    = await user(EMAILS.manager, "Smoke Manager", "ADMIN");
  const accountant = await user(EMAILS.accountant, "Smoke Accountant", "ACCOUNTANT");
  return { org, property, unit, tenant, caretaker, manager, accountant };
}

// ── main ────────────────────────────────────────────────────────────────────
async function main() {
  const { property, unit, tenant, caretaker, manager } = await seed();
  const created = { expenses: new Set<string>(), vendors: new Set<string>(), jobs: new Set<string>(), complaints: new Set<string>() };

  const care = new Client("caretaker");
  const mgr  = new Client("manager");
  const acct = new Client("accountant");
  await Promise.all([care.login(EMAILS.caretaker), mgr.login(EMAILS.manager), acct.login(EMAILS.accountant)]);
  console.log("logged in all three users\n");

  const today = new Date().toISOString().slice(0, 10);
  const stamp = Date.now();

  // ── page redirects ──
  for (const p of ["/petty-cash", "/dashboard", "/tenants", "/settings", "/inbox", "/report", "/cases", "/income"]) {
    await expectRedirect(care, `page ${p} redirects to /maintenance`, p, "/maintenance");
  }
  for (const p of ["/expenses", "/maintenance", "/vendors"]) {
    const res = await care.fetch(p);
    check(`caretaker: page ${p} renders`, res.status === 200, `got ${res.status}`);
  }

  // ── positive: reads ──
  const props = await expectStatus(care, "GET /api/properties", "/api/properties", 200);
  const smokeProp = Array.isArray(props) ? props.find((p: any) => p.id === property.id) : null;
  check("caretaker: properties projection has units, no bank/owner fields",
    !!smokeProp && Array.isArray(smokeProp.units) && !("bankAccountNumber" in smokeProp) && !("owner" in smokeProp) && !("managementFeeRate" in smokeProp),
    JSON.stringify(smokeProp)?.slice(0, 200));
  await expectStatus(care, "GET /api/expenses", `/api/expenses?propertyId=${property.id}`, 200);
  await expectStatus(care, "GET /api/maintenance", `/api/maintenance?propertyId=${property.id}`, 200);
  await expectStatus(care, "GET /api/maintenance/schedules", `/api/maintenance/schedules?propertyId=${property.id}`, 200);
  await expectStatus(care, "GET /api/tax-configs", `/api/tax-configs?propertyId=${property.id}`, 200);
  await expectStatus(care, "GET /api/invitations/my", "/api/invitations/my", 200);
  await expectStatus(care, "GET /api/stripe/status", "/api/stripe/status", 200);

  // ── vendors ──
  const vName = `Smoke Plumbing ${stamp}`;
  const v1 = await expectStatus(care, "POST /api/vendors (full fields)", "/api/vendors", 201, {
    method: "POST", body: JSON.stringify({ name: vName, category: "CONTRACTOR", phone: "0700000000", bankDetails: "KCB 1234567", taxId: "P051234567X" }),
  });
  if (v1?.id) created.vendors.add(v1.id);
  check("caretaker: POST response echoes bankDetails + taxId", v1?.bankDetails === "KCB 1234567" && v1?.taxId === "P051234567X");
  const dup = await expectStatus(care, "POST /api/vendors duplicate → 409", "/api/vendors", 409, {
    method: "POST", body: JSON.stringify({ name: `  ${vName.toUpperCase()}, ` , category: "CONTRACTOR" }),
  });
  check("caretaker: 409 carries DUPLICATE_VENDOR + existing (trimmed)", dup?.code === "DUPLICATE_VENDOR" && dup?.existing?.id === v1?.id && !("bankDetails" in (dup?.existing ?? {})));
  const v2 = await expectStatus(care, "POST /api/vendors allowDuplicate → 201", "/api/vendors", 201, {
    method: "POST", body: JSON.stringify({ name: vName, category: "CONTRACTOR", allowDuplicate: true }),
  });
  if (v2?.id) created.vendors.add(v2.id);
  const list = await expectStatus(care, "GET /api/vendors (trimmed)", "/api/vendors", 200);
  const mine = Array.isArray(list) ? list.find((v: any) => v.id === v1?.id) : null;
  check("caretaker: vendor list has no bankDetails/taxId/email/_count", !!mine && !("bankDetails" in mine) && !("taxId" in mine) && !("email" in mine) && !("_count" in mine), JSON.stringify(mine));
  const one = await expectStatus(care, "GET /api/vendors/[id] (trimmed)", `/api/vendors/${v1?.id}`, 200);
  check("caretaker: vendor detail trimmed (no totalSpend/bankDetails)", !!one && !("totalSpend" in one) && !("bankDetails" in one));
  await expectStatus(care, "PATCH /api/vendors/[id] → 403", `/api/vendors/${v1?.id}`, 403, { method: "PATCH", body: JSON.stringify({ phone: "1" }) });
  await expectStatus(care, "DELETE /api/vendors/[id] → 403", `/api/vendors/${v1?.id}`, 403, { method: "DELETE" });
  await expectStatus(care, "GET /api/vendors/[id]/statement → 403", `/api/vendors/${v1?.id}/statement`, 403);
  const mgrList = await expectStatus(mgr, "GET /api/vendors (full)", "/api/vendors", 200);
  const mgrMine = Array.isArray(mgrList) ? mgrList.find((v: any) => v.id === v1?.id) : null;
  check("manager: vendor list still has bankDetails", mgrMine?.bankDetails === "KCB 1234567");
  const auditRow = await prisma.auditLog.findFirst({ where: { resource: "Vendor", resourceId: v1?.id, action: "CREATE" } });
  check("audit: Vendor CREATE row written by caretaker, bankDetails redacted",
    !!auditRow && auditRow.userId === caretaker.id && JSON.stringify(auditRow.after ?? {}).includes("KCB") === false, JSON.stringify(auditRow?.after));

  // ── expenses: caretaker creates a petty-cash expense ──
  const exp = await expectStatus(care, "POST /api/expenses paidFromPettyCash → 201", "/api/expenses", 201, {
    method: "POST",
    body: JSON.stringify({ date: today, scope: "PROPERTY", propertyId: property.id, category: "CONSUMABLES", amount: 450, description: `Smoke paint ${stamp}`, paidFromPettyCash: true, vendorId: v1?.id }),
  });
  if (exp?.id) created.expenses.add(exp.id);
  const pc = exp?.id ? await prisma.pettyCash.findUnique({ where: { expenseEntryId: exp.id } }) : null;
  check("db: linked OUT row exists, PENDING, createdByUserId = caretaker",
    !!pc && pc.status === "PENDING" && pc.type === "OUT" && exp?.createdByUserId === caretaker.id, JSON.stringify({ pc: pc?.status, creator: exp?.createdByUserId }));
  check("caretaker: expense payload carries pettyCashEntry.status only", exp?.pettyCashEntry?.status === "PENDING" && !("balance" in (exp?.pettyCashEntry ?? {})));
  await expectStatus(care, "POST /api/expenses PORTFOLIO → 400", "/api/expenses", 400, {
    method: "POST", body: JSON.stringify({ date: today, scope: "PORTFOLIO", category: "OTHER", amount: 5, description: "x" }),
  });
  await expectStatus(care, "PUT own PENDING expense → 200", `/api/expenses/${exp?.id}`, 200, {
    method: "PUT",
    body: JSON.stringify({ date: today, scope: "PROPERTY", propertyId: property.id, category: "CONSUMABLES", amount: 500, description: `Smoke paint ${stamp}`, paidFromPettyCash: true }),
  });
  const pcAfter = pc ? await prisma.pettyCash.findUnique({ where: { id: pc.id } }) : null;
  check("db: OUT row follows the edit and stays PENDING", pcAfter?.status === "PENDING" && Number(pcAfter?.amount) === 500, JSON.stringify(pcAfter?.status));

  // manager approves → caretaker locked
  await expectStatus(mgr, "PATCH /api/petty-cash/[id] approve → 200", `/api/petty-cash/${pc?.id}`, 200, { method: "PATCH", body: JSON.stringify({ action: "approve" }) });
  await expectStatus(care, "PUT own APPROVED expense → 409", `/api/expenses/${exp?.id}`, 409, {
    method: "PUT",
    body: JSON.stringify({ date: today, scope: "PROPERTY", propertyId: property.id, category: "CONSUMABLES", amount: 999, description: "tamper", paidFromPettyCash: true }),
  });
  await expectStatus(care, "DELETE own APPROVED expense → 409", `/api/expenses/${exp?.id}`, 409, { method: "DELETE" });

  // second petty expense → manager rejects → expense reverted to unpaid
  const exp2 = await expectStatus(care, "POST /api/expenses (2nd petty)", "/api/expenses", 201, {
    method: "POST",
    body: JSON.stringify({ date: today, scope: "UNIT", unitId: unit.id, category: "MAINTENANCE", amount: 120, description: `Smoke bulb ${stamp}`, paidFromPettyCash: true }),
  });
  if (exp2?.id) created.expenses.add(exp2.id);
  const pc2 = exp2?.id ? await prisma.pettyCash.findUnique({ where: { expenseEntryId: exp2.id } }) : null;
  await expectStatus(mgr, "PATCH /api/petty-cash/[id] reject → 200", `/api/petty-cash/${pc2?.id}`, 200, { method: "PATCH", body: JSON.stringify({ action: "reject", rejectionReason: "No receipt" }) });
  const exp2After = exp2?.id ? await prisma.expenseEntry.findUnique({ where: { id: exp2.id }, include: { pettyCashEntry: true } }) : null;
  check("db: rejected → expense reverted to unpaid, REJECTED row kept linked",
    exp2After?.paidFromPettyCash === false && Number(exp2After?.amountPaid) === 0 && exp2After?.pettyCashEntry?.status === "REJECTED",
    JSON.stringify({ paid: exp2After?.paidFromPettyCash, amountPaid: exp2After?.amountPaid, st: exp2After?.pettyCashEntry?.status }));
  await expectStatus(care, "PUT own REJECTED expense (resubmit) → 200", `/api/expenses/${exp2?.id}`, 200, {
    method: "PUT",
    body: JSON.stringify({ date: today, scope: "UNIT", unitId: unit.id, category: "MAINTENANCE", amount: 120, description: `Smoke bulb ${stamp}`, paidFromPettyCash: true }),
  });
  const pc2After = pc2 ? await prisma.pettyCash.findUnique({ where: { id: pc2.id } }) : null;
  check("db: resubmitted row is PENDING again", pc2After?.status === "PENDING", pc2After?.status);
  await expectStatus(care, "DELETE own PENDING expense → 200", `/api/expenses/${exp2?.id}`, 200, { method: "DELETE" });
  if (exp2?.id) created.expenses.delete(exp2.id);

  // manager-created expense → caretaker cannot touch
  const mExp = await expectStatus(mgr, "POST /api/expenses (manager)", "/api/expenses", 201, {
    method: "POST", body: JSON.stringify({ date: today, scope: "PROPERTY", propertyId: property.id, category: "OTHER", amount: 77, description: `Smoke mgr ${stamp}` }),
  });
  if (mExp?.id) created.expenses.add(mExp.id);
  await expectStatus(care, "PUT manager's expense → 403", `/api/expenses/${mExp?.id}`, 403, {
    method: "PUT", body: JSON.stringify({ date: today, scope: "PROPERTY", propertyId: property.id, category: "OTHER", amount: 1, description: "x" }),
  });
  await expectStatus(care, "DELETE manager's expense → 403", `/api/expenses/${mExp?.id}`, 403, { method: "DELETE" });
  await expectStatus(care, "POST documents on manager's expense → 403", `/api/expenses/${mExp?.id}/documents`, 403, { method: "POST", body: new FormData() });
  await expectStatus(care, "POST /api/expenses/bulk → 403", "/api/expenses/bulk", 403, { method: "POST", body: JSON.stringify({ action: "mark_sunk", ids: [mExp?.id] }) });
  // legacy row with no creator
  if (mExp?.id) await prisma.expenseEntry.update({ where: { id: mExp.id }, data: { createdByUserId: null } });
  await expectStatus(care, "DELETE legacy (null creator) expense → 403", `/api/expenses/${mExp?.id}`, 403, { method: "DELETE" });
  // accountant regression
  await expectStatus(acct, "DELETE expense → 403 PERMISSION_DENIED", `/api/expenses/${mExp?.id}`, 403, { method: "DELETE" });
  await expectStatus(acct, "PUT expense → 200 (accountant may edit)", `/api/expenses/${mExp?.id}`, 200, {
    method: "PUT", body: JSON.stringify({ date: today, scope: "PROPERTY", propertyId: property.id, category: "OTHER", amount: 78, description: `Smoke mgr ${stamp}` }),
  });

  // ── maintenance ──
  const job = await expectStatus(care, "POST /api/maintenance → 201", "/api/maintenance", 201, {
    method: "POST", body: JSON.stringify({ propertyId: property.id, unitId: unit.id, title: `Smoke leak ${stamp}`, category: "PLUMBING", priority: "MEDIUM", vendorId: v1?.id }),
  });
  if (job?.id) created.jobs.add(job.id);
  await expectStatus(care, "PATCH /api/maintenance/[id] status → 200", `/api/maintenance/${job?.id}`, 200, { method: "PATCH", body: JSON.stringify({ status: "IN_PROGRESS" }) });
  await expectStatus(care, "PATCH /api/maintenance/[id] DONE + cost → 200", `/api/maintenance/${job?.id}`, 200, { method: "PATCH", body: JSON.stringify({ status: "DONE", cost: 300 }) });
  const logged = await expectStatus(care, "PATCH log_expense → 200", `/api/maintenance/${job?.id}`, 200, {
    method: "PATCH", body: JSON.stringify({ action: "log_expense", amount: 300, description: `Smoke leak fix ${stamp}`, date: today, category: "MAINTENANCE" }),
  });
  if (logged?.expense?.id) created.expenses.add(logged.expense.id);
  check("db: log_expense stamps createdByUserId", logged?.expense?.createdByUserId === caretaker.id);
  await expectStatus(care, "DELETE /api/maintenance/[id] → 403", `/api/maintenance/${job?.id}`, 403, { method: "DELETE" });
  await expectStatus(care, "POST /api/maintenance/schedules → 403", "/api/maintenance/schedules", 403, { method: "POST", body: JSON.stringify({ propertyId: property.id, taskName: "x", frequency: "MONTHLY" }) });

  // ── denied APIs ──
  const denied: [string, string, RequestInit?][] = [
    ["GET /api/petty-cash", `/api/petty-cash?propertyId=${property.id}`],
    ["POST /api/petty-cash", "/api/petty-cash", { method: "POST", body: JSON.stringify({ date: today, type: "IN", amount: 1, description: "x", propertyId: property.id }) }],
    ["PATCH /api/petty-cash/[id]", `/api/petty-cash/${pc?.id}`, { method: "PATCH", body: JSON.stringify({ action: "approve" }) }],
    ["POST /api/petty-cash/[id]/convert-to-expense", `/api/petty-cash/${pc?.id}/convert-to-expense`, { method: "POST" }],
    ["POST /api/petty-cash/bulk", "/api/petty-cash/bulk", { method: "POST", body: JSON.stringify({ action: "delete", ids: [pc?.id] }) }],
    ["GET /api/dashboard", `/api/dashboard?year=2026&month=9&propertyId=${property.id}`],
    ["GET /api/dashboard/ops", `/api/dashboard/ops?propertyId=${property.id}`],
    ["GET /api/report", `/api/report?propertyId=${property.id}&year=2026&month=9`],
    ["GET /api/report/owner-statement", `/api/report/owner-statement?year=2026&month=9`],
    ["GET /api/hints", "/api/hints"],
    ["GET /api/inbox", "/api/inbox"],
    ["GET /api/income", `/api/income?propertyId=${property.id}`],
    ["GET /api/invoices", "/api/invoices"],
    ["GET /api/units", `/api/units?propertyId=${property.id}`],
    ["GET /api/cases", "/api/cases"],
    ["GET /api/settings", "/api/settings"],
    ["GET /api/users", "/api/users"],
    ["GET /api/audit-logs", "/api/audit-logs"],
    ["GET /api/recurring-expenses", "/api/recurring-expenses"],
    ["GET /api/assets", "/api/assets"],
    ["GET /api/insurance", "/api/insurance"],
    ["GET /api/compliance", "/api/compliance"],
    ["POST /api/demo/seed", "/api/demo/seed", { method: "POST", body: JSON.stringify({ demoKey: "al-seef" }) }],
    ["POST /api/invitations", "/api/invitations", { method: "POST", body: JSON.stringify({ email: "x@y.z", role: "MANAGER" }) }],
  ];
  for (const [name, path, init] of denied) {
    await expectStatus(care, `${name} → 403`, path, 403, init);
  }

  // ── manager regression ──
  await expectStatus(mgr, "GET /api/petty-cash → 200", `/api/petty-cash?propertyId=${property.id}`, 200);
  await expectStatus(mgr, "GET /api/dashboard → 200", `/api/dashboard?year=2026&month=9&propertyId=${property.id}`, 200);
  await expectStatus(mgr, "GET /api/inbox → 200", "/api/inbox", 200);
  const mgrProps = await expectStatus(mgr, "GET /api/properties (full) → 200", "/api/properties", 200);
  const mgrProp = Array.isArray(mgrProps) ? mgrProps.find((p: any) => p.id === property.id) : null;
  check("manager: properties still carry bank fields + owner", !!mgrProp && "bankAccountNumber" in mgrProp && "owner" in mgrProp);
  const acctProps = await expectStatus(acct, "GET /api/properties → 200", "/api/properties", 200);
  const acctProp = Array.isArray(acctProps) ? acctProps.find((p: any) => p.id === property.id) : null;
  check("accountant: properties scrubbed of bank fields", !!acctProp && !("bankAccountNumber" in acctProp) && "units" in acctProp, JSON.stringify(Object.keys(acctProp ?? {})));
  await expectStatus(acct, "GET /api/units scoped → 200", `/api/units?propertyId=${property.id}`, 200);

  // ── Phase 2a: complaints + tenant directory ──
  {
    const res = await care.fetch("/complaints");
    check("caretaker: page /complaints renders", res.status === 200, `got ${res.status}`);
  }
  const dir = await expectStatus(care, "GET /api/tenants (directory projection)", `/api/tenants?propertyId=${property.id}`, 200);
  const dirRow = Array.isArray(dir) ? dir.find((t: any) => t.id === tenant.id) : null;
  check("caretaker: tenant directory has name/phone/unit and nothing financial",
    !!dirRow && dirRow.name === "Smoke Tenant" && dirRow.phone === "0711000000" && dirRow.unit?.unitNumber === "S1"
      && !("monthlyRent" in dirRow) && !("depositAmount" in dirRow) && !("email" in dirRow) && !("nationalId" in dirRow) && !("notes" in dirRow) && !("portalToken" in dirRow),
    JSON.stringify(dirRow));
  await expectStatus(care, "GET /api/tenants/[id] → 403", `/api/tenants/${tenant.id}`, 403);
  const mgrDir = await expectStatus(mgr, "GET /api/tenants?projection=directory (manager opt-in)", `/api/tenants?projection=directory&propertyId=${property.id}`, 200);
  check("manager: directory projection on request has no monthlyRent", Array.isArray(mgrDir) && mgrDir.length > 0 && !("monthlyRent" in mgrDir[0]));
  const mgrFull = await expectStatus(mgr, "GET /api/tenants (full)", `/api/tenants?propertyId=${property.id}`, 200);
  check("manager: full tenant shape unchanged", Array.isArray(mgrFull) && mgrFull.some((t: any) => t.id === tenant.id && "monthlyRent" in t));

  const comp = await expectStatus(care, "POST /api/complaints → 201", "/api/complaints", 201, {
    method: "POST",
    body: JSON.stringify({ propertyId: property.id, tenantId: tenant.id, subjectUnitId: unit.id, category: "NOISE", title: `Smoke noise ${stamp}`, description: "Generator all night" }),
  });
  if (comp?.id) created.complaints.add(comp.id);
  const compCase = comp?.caseThread?.id ? await prisma.caseThread.findUnique({ where: { id: comp.caseThread.id } }) : null;
  check("db: COMPLAINT case created with workflowKey + stageSlaHours, subjectId = complaint.id",
    !!compCase && compCase.caseType === "COMPLAINT" && compCase.workflowKey === "COMPLAINT_V1" && !!compCase.stageSlaHours && compCase.subjectId === comp.id && compCase.waitingOn === "MANAGER",
    JSON.stringify({ wf: compCase?.workflowKey, sla: compCase?.stageSlaHours }));
  check("caretaker: complaint DTO carries tenant directory fields only",
    comp?.tenant?.name === "Smoke Tenant" && !("monthlyRent" in (comp?.tenant ?? {})) && !("email" in (comp?.tenant ?? {})) && comp?.source === "STAFF" && comp?.raisedByName === "Smoke Caretaker");
  const firstEvent = comp?.caseThread?.id ? await prisma.caseEvent.findFirst({ where: { caseThreadId: comp.caseThread.id, kind: "COMMENT" } }) : null;
  check("db: description became the first COMMENT, visible to tenant", !!firstEvent && (firstEvent.meta as any)?.visibleToTenant === true);
  await expectStatus(care, "POST /api/complaints STAFF_CONDUCT → 403", "/api/complaints", 403, {
    method: "POST", body: JSON.stringify({ propertyId: property.id, category: "STAFF_CONDUCT", title: "Rude guard" }),
  });
  await expectStatus(care, "POST /api/complaints tenant from another property → 400", "/api/complaints", 400, {
    method: "POST", body: JSON.stringify({ propertyId: property.id, tenantId: "nope", category: "NOISE", title: "Bad tenant id" }),
  });

  const compList = await expectStatus(care, "GET /api/complaints → 200", `/api/complaints?propertyId=${property.id}`, 200);
  check("caretaker: list contains the new complaint", Array.isArray(compList) && compList.some((c: any) => c.id === comp?.id));
  const detail = await expectStatus(care, "GET /api/complaints/[id] → 200 with timeline", `/api/complaints/${comp?.id}`, 200);
  check("caretaker: detail has events, no tenantContext / rent", Array.isArray(detail?.events) && detail.events.length >= 1 && !("tenantContext" in detail) && !JSON.stringify(detail).includes("monthlyRent"));

  const form = new FormData();
  form.append("body", "Spoke to the neighbour");
  form.append("file", new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])], { type: "image/jpeg" }), "photo.jpg");
  form.append("visibleToTenant", "true");
  // 503 = file storage not configured on this machine (dev without Supabase keys) — the code path is exercised up to the upload.
  const ev = await expectStatus(care, "POST /api/complaints/[id]/events (photo) → 201 (or 503 when storage is unconfigured)", `/api/complaints/${comp?.id}/events`, [201, 503], { method: "POST", body: form });
  if (ev?.id) check("caretaker: event has one attachment and visibleToTenant meta", ev?.attachmentUrls?.length === 1 && ev?.meta?.visibleToTenant === true, JSON.stringify(ev?.meta));
  const noteEv = await expectStatus(care, "POST /api/complaints/[id]/events (text, visibleToTenant) → 201", `/api/complaints/${comp?.id}/events`, 201, { method: "POST", body: JSON.stringify({ body: "Spoke to the neighbour", visibleToTenant: true }) });
  check("caretaker: text note carries visibleToTenant meta", noteEv?.meta?.visibleToTenant === true, JSON.stringify(noteEv?.meta));
  const hiddenEv = await expectStatus(care, "POST events (internal note) → 201", `/api/complaints/${comp?.id}/events`, 201, { method: "POST", body: JSON.stringify({ body: "Internal: tenant was rude" }) });
  check("caretaker: internal note defaults to hidden", hiddenEv?.meta?.visibleToTenant === false, JSON.stringify(hiddenEv?.meta));
  const big = new FormData();
  big.append("file", new Blob([new Uint8Array(11 * 1024 * 1024)], { type: "image/jpeg" }), "huge.jpg");
  await expectStatus(care, "POST events with 11 MB file → 400", `/api/complaints/${comp?.id}/events`, 400, { method: "POST", body: big });

  const ack = await expectStatus(care, "PATCH acknowledge → 200", `/api/complaints/${comp?.id}`, 200, { method: "PATCH", body: JSON.stringify({ action: "acknowledge" }) });
  check("caretaker: acknowledged → stage 1 + acknowledgedAt", ack?.caseThread?.currentStageIndex === 1 && !!ack?.acknowledgedAt);
  await expectStatus(care, "PATCH acknowledge again → 409", `/api/complaints/${comp?.id}`, 409, { method: "PATCH", body: JSON.stringify({ action: "acknowledge" }) });
  await expectStatus(care, "PATCH close → 403", `/api/complaints/${comp?.id}`, 403, { method: "PATCH", body: JSON.stringify({ action: "close" }) });
  const res1 = await expectStatus(care, "PATCH resolve → 200", `/api/complaints/${comp?.id}`, 200, { method: "PATCH", body: JSON.stringify({ action: "resolve", note: "Talked to 4B" }) });
  check("caretaker: resolved → RESOLVED, COMPLETED_NORMALLY (not bypassed), resolvedAt", res1?.caseThread?.status === "RESOLVED" && res1?.caseThread?.terminalReason === "COMPLETED_NORMALLY" && !!res1?.resolvedAt, JSON.stringify(res1?.caseThread));
  await expectStatus(care, "PATCH reopen → 403", `/api/complaints/${comp?.id}`, 403, { method: "PATCH", body: JSON.stringify({ action: "reopen", note: "still noisy" }) });
  const reopened = await expectStatus(mgr, "PATCH reopen (manager) → 200", `/api/complaints/${comp?.id}`, 200, { method: "PATCH", body: JSON.stringify({ action: "reopen", note: "still noisy" }) });
  check("manager: reopened → investigating, IN_PROGRESS, resolvedAt cleared", reopened?.caseThread?.currentStageIndex === 2 && reopened?.caseThread?.status === "IN_PROGRESS" && !reopened?.resolvedAt);
  await expectStatus(mgr, "PATCH close (manager) → 200", `/api/complaints/${comp?.id}`, 200, { method: "PATCH", body: JSON.stringify({ action: "close" }) });
  await expectStatus(care, "DELETE /api/complaints/[id] → 403", `/api/complaints/${comp?.id}`, 403, { method: "DELETE" });
  await expectStatus(care, "GET /api/cases/[id] for the complaint's case → 403", `/api/cases/${comp?.caseThread?.id}`, 403);
  await expectStatus(care, "POST /api/cases/[id]/events → 403", `/api/cases/${comp?.caseThread?.id}/events`, 403, { method: "POST", body: JSON.stringify({ body: "x" }) });
  const mgrCases = await expectStatus(mgr, "GET /api/cases?caseType=COMPLAINT → 200", `/api/cases?caseType=COMPLAINT&propertyId=${property.id}`, 200);
  check("manager: complaint case visible in /api/cases", Array.isArray(mgrCases) && mgrCases.some((c: any) => c.id === comp?.caseThread?.id));

  // STAFF_CONDUCT: manager-only end to end
  const sc = await expectStatus(mgr, "POST /api/complaints STAFF_CONDUCT (manager) → 201", "/api/complaints", 201, {
    method: "POST", body: JSON.stringify({ propertyId: property.id, category: "STAFF_CONDUCT", title: `Smoke staff conduct ${stamp}` }),
  });
  if (sc?.id) created.complaints.add(sc.id);
  const careList = await expectStatus(care, "GET /api/complaints (after STAFF_CONDUCT exists)", `/api/complaints?propertyId=${property.id}`, 200);
  check("caretaker: STAFF_CONDUCT absent from list", Array.isArray(careList) && !careList.some((c: any) => c.id === sc?.id));
  const careListCat = await expectStatus(care, "GET /api/complaints?category=STAFF_CONDUCT (caretaker)", `/api/complaints?propertyId=${property.id}&category=STAFF_CONDUCT`, 200);
  check("caretaker: category filter cannot surface it", Array.isArray(careListCat) && !careListCat.some((c: any) => c.category === "STAFF_CONDUCT"));
  await expectStatus(care, "GET STAFF_CONDUCT detail → 404", `/api/complaints/${sc?.id}`, 404);
  await expectStatus(care, "PATCH STAFF_CONDUCT → 404", `/api/complaints/${sc?.id}`, 404, { method: "PATCH", body: JSON.stringify({ action: "acknowledge" }) });
  await expectStatus(care, "POST events on STAFF_CONDUCT → 404", `/api/complaints/${sc?.id}/events`, 404, { method: "POST", body: JSON.stringify({ body: "x" }) });
  const mgrCompList = await expectStatus(mgr, "GET /api/complaints (manager sees STAFF_CONDUCT)", `/api/complaints?propertyId=${property.id}`, 200);
  check("manager: STAFF_CONDUCT present", Array.isArray(mgrCompList) && mgrCompList.some((c: any) => c.id === sc?.id));
  await expectStatus(mgr, "DELETE STAFF_CONDUCT (manager) → 200", `/api/complaints/${sc?.id}`, 200, { method: "DELETE" });
  if (sc?.id) created.complaints.delete(sc.id);

  // ── Phase 2b: tenant portal complaints ──
  const portal = new Client("portal");
  const tok = tenant.portalToken!;
  {
    // A logged-in caretaker opening a tenant's portal link must not be bounced to /maintenance.
    const res = await care.fetch(`/portal/${tok}`);
    check("caretaker: /portal/[token] renders (not redirected)", res.status === 200, `got ${res.status} → ${res.headers.get("location") ?? ""}`);
  }
  await expectStatus(portal, "GET /api/portal/[bad]/complaints → 404", `/api/portal/not-a-token/complaints`, 404);
  await expectStatus(portal, "POST portal complaint (title too short) → 400", `/api/portal/${tok}/complaints`, 400, { method: "POST", body: JSON.stringify({ category: "NOISE", title: "x" }) });
  const pc1 = await expectStatus(portal, "POST portal complaint → 201", `/api/portal/${tok}/complaints`, 201, {
    method: "POST", body: JSON.stringify({ category: "NOISE", title: `Portal noise ${stamp}`, description: "Music until 2am every weekend" }),
  });
  if (pc1?.id) created.complaints.add(pc1.id);
  check("portal: response is the tenant shape (stage Received, own description as first update, no case internals)",
    pc1?.stage === "Received" && pc1?.isResolved === false && Array.isArray(pc1?.updates) && pc1.updates.length === 1 && pc1.updates[0].byStaff === false && !("caseThread" in pc1) && !("tenant" in pc1),
    JSON.stringify(pc1)?.slice(0, 200));
  const pcRow = pc1?.id ? await prisma.tenantComplaint.findUnique({ where: { id: pc1.id }, include: { caseThread: true } }) : null;
  check("db: portal complaint is source PORTAL, tenantId = tenant, unit = tenant unit, case COMPLAINT with SLA",
    pcRow?.source === "PORTAL" && pcRow?.tenantId === tenant.id && pcRow?.unitId === unit.id && pcRow?.raisedByUserId === null && pcRow?.caseThread?.caseType === "COMPLAINT" && !!pcRow?.caseThread?.stageSlaHours);

  const careSees = await expectStatus(care, "GET /api/complaints (caretaker sees the portal complaint)", `/api/complaints?propertyId=${property.id}`, 200);
  check("caretaker: portal complaint listed with source PORTAL and tenant name", Array.isArray(careSees) && careSees.some((c: any) => c.id === pc1?.id && c.source === "PORTAL" && c.tenant?.name === "Smoke Tenant"));

  await expectStatus(care, "caretaker adds INTERNAL note", `/api/complaints/${pc1?.id}/events`, 201, { method: "POST", body: JSON.stringify({ body: "Internal: checked with guard" }) });
  await expectStatus(care, "caretaker adds tenant-visible note", `/api/complaints/${pc1?.id}/events`, 201, { method: "POST", body: JSON.stringify({ body: "We have spoken to 4B", visibleToTenant: true }) });
  let portalMine = await expectStatus(portal, "GET portal complaints → 200", `/api/portal/${tok}/complaints`, 200);
  let mineRow = Array.isArray(portalMine) ? portalMine.find((c: any) => c.id === pc1?.id) : null;
  check("portal: shows the visible note, hides the internal one (2 updates: own description + staff reply)",
    !!mineRow && mineRow.updates.length === 2 && mineRow.updates.some((u: any) => u.byStaff && /spoken to 4B/.test(u.body)) && !mineRow.updates.some((u: any) => /Internal/.test(u.body)),
    JSON.stringify(mineRow?.updates));

  await expectStatus(care, "caretaker acknowledges portal complaint", `/api/complaints/${pc1?.id}`, 200, { method: "PATCH", body: JSON.stringify({ action: "acknowledge" }) });
  await expectStatus(care, "caretaker resolves with a resolution note", `/api/complaints/${pc1?.id}`, 200, { method: "PATCH", body: JSON.stringify({ action: "resolve", note: "Neighbour agreed to stop by 10pm" }) });
  portalMine = await expectStatus(portal, "GET portal complaints after resolve → 200", `/api/portal/${tok}/complaints`, 200);
  mineRow = Array.isArray(portalMine) ? portalMine.find((c: any) => c.id === pc1?.id) : null;
  check("portal: resolved, resolvedAt set, resolution note visible as a staff update",
    !!mineRow && mineRow.isResolved === true && !!mineRow.resolvedAt && mineRow.updates.some((u: any) => u.byStaff && /10pm/.test(u.body)),
    JSON.stringify({ r: mineRow?.isResolved, u: mineRow?.updates?.length }));
  const resolvedMail = await prisma.emailLog.findFirst({ where: { toEmail: "smoke-tenant@groundworkpm.test", subject: { contains: "resolved" } }, orderBy: { sentAt: "desc" } });
  check("email: 'complaint resolved' email attempted to the tenant (EmailLog row, any status)", !!resolvedMail, "no EmailLog row");

  // A STAFF complaint that names the tenant as complainant is NOT theirs to see in the portal
  const staffAbout = await expectStatus(care, "caretaker logs STAFF complaint naming the tenant", "/api/complaints", 201, {
    method: "POST", body: JSON.stringify({ propertyId: property.id, tenantId: tenant.id, category: "PREMISES", title: `Staff-logged ${stamp}`, description: "Bins overflowing" }),
  });
  if (staffAbout?.id) created.complaints.add(staffAbout.id);
  portalMine = await expectStatus(portal, "GET portal complaints (staff-logged excluded)", `/api/portal/${tok}/complaints`, 200);
  check("portal: staff-logged complaint absent", Array.isArray(portalMine) && !portalMine.some((c: any) => c.id === staffAbout?.id));

  // Tenant may raise STAFF_CONDUCT; the caretaker never sees it
  const pcStaff = await expectStatus(portal, "POST portal STAFF_CONDUCT complaint → 201", `/api/portal/${tok}/complaints`, 201, {
    method: "POST", body: JSON.stringify({ category: "STAFF_CONDUCT", title: `Rude caretaker ${stamp}`, description: "Shouted at me" }),
  });
  if (pcStaff?.id) created.complaints.add(pcStaff.id);
  const careAfter = await expectStatus(care, "GET /api/complaints (after portal STAFF_CONDUCT)", `/api/complaints?propertyId=${property.id}`, 200);
  check("caretaker: portal STAFF_CONDUCT complaint absent", Array.isArray(careAfter) && !careAfter.some((c: any) => c.id === pcStaff?.id));
  await expectStatus(care, "GET portal STAFF_CONDUCT detail (caretaker) → 404", `/api/complaints/${pcStaff?.id}`, 404);
  const tenantTab = await expectStatus(mgr, "GET /api/complaints?tenantId= (manager tenant tab)", `/api/complaints?tenantId=${tenant.id}`, 200);
  check("manager: tenant tab lists portal + staff complaints incl. STAFF_CONDUCT", Array.isArray(tenantTab) && [pc1?.id, staffAbout?.id, pcStaff?.id].every((id) => tenantTab.some((c: any) => c.id === id)));
  await expectStatus(care, "GET /api/complaints?tenantId= (caretaker) hides STAFF_CONDUCT", `/api/complaints?tenantId=${tenant.id}`, 200).then((rows: any) => {
    check("caretaker: tenantId filter still excludes STAFF_CONDUCT", Array.isArray(rows) && !rows.some((c: any) => c.id === pcStaff?.id));
  });

  // ── Phase 2c: search ──
  {
    const res = await expectStatus(care, "GET /api/search?q= (caretaker) → 200", `/api/search?q=${stamp}`, 200);
    const resSmoke = await expectStatus(care, "GET /api/search?q=Smoke (caretaker) → 200", `/api/search?q=Smoke`, 200);
    const types = new Set<string>((res?.results ?? []).map((r: any) => r.type));
    check("caretaker: search never returns tenant / invoice / case / document groups",
      !types.has("tenant") && !types.has("invoice") && !types.has("case") && !types.has("document"), JSON.stringify(Array.from(types)));
    const compHit = (res?.results ?? []).find((r: any) => r.type === "complaint" && r.id === pc1?.id);
    check("caretaker: portal complaint is a complaint hit linking to /complaints/[id]", !!compHit && compHit.href === `/complaints/${pc1?.id}`);
    check("caretaker: STAFF_CONDUCT complaint is not a search hit", !(res?.results ?? []).some((r: any) => r.id === pcStaff?.id));
    check("caretaker: property hit links to /maintenance, not /properties",
      !(res?.results ?? []).some((r: any) => r.type === "property" && r.href !== "/maintenance"));
    check("caretaker: maintenance hits never link to /cases",
      !(res?.results ?? []).some((r: any) => r.type === "maintenance" && /\/cases\//.test(r.href)));
    const tenantHit = (resSmoke?.results ?? []).some((r: any) => /Smoke Tenant/.test(r.title));
    check("caretaker: tenant name does not appear as a result title", !tenantHit);
  }
  {
    const res = await expectStatus(mgr, "GET /api/search?q= (manager) → 200", `/api/search?q=${stamp}`, 200);
    const resSmoke = await expectStatus(mgr, "GET /api/search?q=Smoke (manager) → 200", `/api/search?q=Smoke`, 200);
    const types = new Set<string>((resSmoke?.results ?? []).map((r: any) => r.type));
    check("manager: search still returns tenants, and complaints incl. STAFF_CONDUCT",
      types.has("tenant") && (res?.results ?? []).some((r: any) => r.id === pcStaff?.id), JSON.stringify(Array.from(types)));
  }
  await expectStatus(acct, "GET /api/search (accountant) → 200", `/api/search?q=Smoke`, 200);

  // ── cleanup ──
  for (const id of Array.from(created.complaints)) {
    const row = await prisma.tenantComplaint.findUnique({ where: { id }, select: { caseThreadId: true } });
    await prisma.tenantComplaint.deleteMany({ where: { id } });
    if (row?.caseThreadId) await prisma.caseThread.deleteMany({ where: { id: row.caseThreadId } });
  }
  for (const id of Array.from(created.jobs)) await prisma.maintenanceJob.deleteMany({ where: { id } });
  for (const id of Array.from(created.expenses)) await prisma.expenseEntry.deleteMany({ where: { id } });
  for (const id of Array.from(created.vendors)) await prisma.vendor.deleteMany({ where: { id } });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log("FAILED:");
    for (const f of failed) console.log(` - ${f.name}${f.detail ? `  (${f.detail})` : ""}`);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
