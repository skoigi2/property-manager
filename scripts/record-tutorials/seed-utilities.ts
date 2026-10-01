/**
 * Recording preconditions for `utilities-metering`.
 *
 * Metering is a Kenyan workflow (KPLC bulk meter, borehole + council water,
 * shillings), so it records against its OWN account and org — the shared
 * guide org stays single-property in GBP for the guide screenshots.
 *
 * Every run starts from the same state: the org's Kilimani Court demo is
 * deleted and re-seeded through the app's own API (the demo seed carries the
 * utility meters, three months of readings, bills and supplier costs), so the
 * readings typed, imported, approved and billed on camera never pile up.
 * Then it writes the filled-in Excel sheet the import scene uploads.
 *
 * Caller (seed-state.ts) has already checked DATABASE_URL is local / dev.
 */
import bcrypt from "bcryptjs";
import * as fs from "fs";
import * as path from "path";
import * as XLSX from "xlsx";
import type { PrismaClient } from "@prisma/client";
import { READING_SHEET_COLUMNS, periodCell } from "../../src/lib/utility-readings-import";
import { byUnitOrder } from "../../src/components/utilities/types";

export const UTILITIES_RECORD_EMAIL = process.env.RECORD_UTILITIES_EMAIL ?? "guide-utilities@groundworkpm.com";
export const RECORD_PASSWORD = process.env.RECORD_PASSWORD ?? "guide-shots-2026";
const BASE_URL = process.env.RECORD_BASE_URL ?? "http://localhost:3000";
const ORG_NAME = "Nairobi Homes Management";

/** How many meters the recorder types by hand before importing the rest. */
export const TYPED_ON_CAMERA = 3;

type SheetRowDto = {
  meterId: string;
  utility: "WATER" | "ELECTRICITY";
  role: "UNIT" | "COMMON" | "BULK";
  label: string;
  meterNumber: string | null;
  unitNumber: string | null;
  occupantName: string | null;
  previousReading: number;
};

/** Minimal cookie-jar client for the app's own API (NextAuth credentials login). */
export class ApiSession {
  private jar = new Map<string, string>();

  private absorb(res: Response) {
    const raw = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
    for (const c of raw) {
      const pair = c.split(";")[0];
      const eq = pair.indexOf("=");
      if (eq > 0) this.jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  async fetch(route: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.jar.size) headers.set("cookie", Array.from(this.jar, ([k, v]) => `${k}=${v}`).join("; "));
    const res = await fetch(BASE_URL + route, { ...init, headers, redirect: "manual" });
    this.absorb(res);
    return res;
  }

  async json<T = any>(route: string, method = "GET", body?: unknown): Promise<{ status: number; body: T }> {
    const res = await this.fetch(route, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json().catch(() => null)) as T };
  }

  async login(email: string, password: string) {
    const { csrfToken } = (await (await this.fetch("/api/auth/csrf")).json()) as { csrfToken: string };
    await this.fetch("/api/auth/callback/credentials", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrfToken, email, password, callbackUrl: BASE_URL + "/" }).toString(),
    });
    if (!Array.from(this.jar.keys()).some((k) => k.includes("session-token"))) {
      throw new Error(`Could not sign in as ${email} — is the dev server running?`);
    }
  }
}

async function ensureAccount(prisma: PrismaClient): Promise<string> {
  const existing = await prisma.user.findUnique({ where: { email: UTILITIES_RECORD_EMAIL } });
  if (existing?.organizationId) return existing.organizationId;

  const org = await prisma.organization.create({
    data: { name: ORG_NAME, defaultCurrency: "KES", freeAccess: true, email: UTILITIES_RECORD_EMAIL },
  });
  const password = await bcrypt.hash(RECORD_PASSWORD, 10);
  const user = existing
    ? await prisma.user.update({ where: { id: existing.id }, data: { organizationId: org.id, role: "ADMIN", password } })
    : await prisma.user.create({
        data: { email: UTILITIES_RECORD_EMAIL, name: "Amina Otieno", password, role: "ADMIN", organizationId: org.id, isActive: true },
      });
  await prisma.userOrganizationMembership.create({ data: { userId: user.id, organizationId: org.id, role: "ADMIN" } });
  console.log(`  ✓ created recording account ${UTILITIES_RECORD_EMAIL} (${ORG_NAME})`);
  return org.id;
}

/** Deterministic, believable month's use per meter. */
function monthUse(row: SheetRowDto, i: number): number {
  if (row.role === "UNIT" && !row.occupantName) return row.utility === "WATER" ? 0.4 : 6; // vacant
  if (row.role === "COMMON") return 310;
  if (row.utility === "WATER") return 4 + ((i * 3) % 5);
  return 125 + ((i * 29) % 95);
}

export async function seedUtilities(prisma: PrismaClient, fixturesDir: string): Promise<void> {
  const orgId = await ensureAccount(prisma);
  const api = new ApiSession();
  await api.login(UTILITIES_RECORD_EMAIL, RECORD_PASSWORD);

  // Fresh demo every run.
  const old = await prisma.property.findMany({ where: { organizationId: orgId }, select: { id: true, name: true } });
  for (const p of old) {
    const del = await api.json(`/api/properties/${p.id}`, "DELETE");
    if (del.status >= 300) throw new Error(`Could not delete ${p.name}: ${del.status} ${JSON.stringify(del.body)}`);
  }
  console.log(`  • seeding Kilimani Court (takes a while in dev)…`);
  const seeded = await api.json<{ ok: boolean; propertyId: string }>("/api/demo/seed", "POST", {
    demoKey: "kilimani-court",
    organizationId: orgId,
  });
  if (!seeded.body?.ok) throw new Error(`Demo seed failed: ${seeded.status} ${JSON.stringify(seeded.body)}`);
  const propertyId = seeded.body.propertyId;

  // The import fixture: this month's sheet, filled in for every meter except
  // the first few in walking order — the recorder types those by hand first.
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const sheet = await api.json<{ rows: SheetRowDto[] }>(`/api/utilities/readings?propertyId=${propertyId}&year=${year}&month=${month}`);
  const rows = byUnitOrder(sheet.body?.rows ?? []);
  if (rows.length < TYPED_ON_CAMERA + 5) throw new Error(`Kilimani Court has only ${rows.length} meters — demo utilities missing?`);

  const unitPower = rows
    .map((r, i) => (r.role === "UNIT" && r.utility === "ELECTRICITY" ? monthUse(r, i) : 0))
    .reduce((a, b) => a + b, 0);
  const commonUse = 310;
  const data = rows.map((r, i) => {
    const use = r.role === "BULK" ? Math.round((unitPower + commonUse) * 1.04) : monthUse(r, i);
    return {
      Period: periodCell(year, month),
      Unit: r.unitNumber ?? "",
      Meter: r.label,
      Utility: r.utility === "WATER" ? "Water" : "Electricity",
      "Meter No.": r.meterNumber ?? "",
      Occupant: r.role === "UNIT" ? r.occupantName ?? "Vacant" : r.role === "BULK" ? "Bulk supply meter" : "Common areas",
      "Previous reading": r.previousReading,
      "Current reading": i < TYPED_ON_CAMERA ? "" : Math.round((r.previousReading + use) * 10) / 10,
      "Reading date": "",
      Notes: "",
      "Meter ID": r.meterId,
    };
  });
  const cols = [...READING_SHEET_COLUMNS];
  const ws = XLSX.utils.aoa_to_sheet([cols, ...data.map((d) => cols.map((c) => d[c]))]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Readings");
  fs.mkdirSync(fixturesDir, { recursive: true });
  const file = path.join(fixturesDir, "utilities-readings.xlsx");
  XLSX.writeFile(wb, file);
  console.log(`  ✓ Kilimani Court ready (${rows.length} meters), import sheet → ${path.basename(file)}`);
}
