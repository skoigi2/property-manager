/**
 * Guide screenshots for "Inspections" (61–64) and "Guest stays" (65–67) in
 * public/guide.html.
 *
 *   npx tsx scripts/capture-caretaker-screenshots.ts        (dev server on :3000)
 *   ONLY=61,65 npx tsx scripts/capture-caretaker-screenshots.ts
 *
 * Same Kenyan org as the utilities shots, with the caretaker tutorials' seeds
 * (record-tutorials/seed-caretaker.ts): a move-out inspection for Peter Omondi
 * (302) assigned to the caretaker, then the Westlands Suites short-stay block.
 * Caretaker shots are phone-sized; the manager's review is desktop. Photos and
 * the sample ID are fixtures served by record-tutorials/fake-storage.ts.
 *
 * Refuses a non-local DATABASE_URL (the seed's guard).
 */
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { disconnect, prisma, seedForTutorial } from "./record-tutorials/seed-state";
import { RECORD_PASSWORD, UTILITIES_RECORD_EMAIL } from "./record-tutorials/seed-utilities";
import { CARETAKER_EMAIL, MOVE_OUT_TENANT, STAYS_PROPERTY } from "./record-tutorials/seed-caretaker";
import { fakeStorage, fixturePath, PHOTO_DIR } from "./record-tutorials/fake-storage";
import type { InspectionItem } from "../src/lib/inspection-rules";

const BASE_URL = process.env.RECORD_BASE_URL ?? "http://localhost:3000";
const OUT_DIR = path.join(__dirname, "..", "public", "guide-screenshots");
const ONLY = (process.env.ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const wanted = (name: string) => ONLY.length === 0 || ONLY.some((p) => name.startsWith(p));
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };

async function settle(page: Page, ms = 1000) {
  await page.waitForTimeout(500);
  await page.waitForFunction(() => document.querySelectorAll(".animate-spin").length === 0, undefined, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

async function shot(page: Page, name: string, opts: { fullPage?: boolean } = {}) {
  if (!wanted(name)) return;
  await settle(page, 600);
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`), fullPage: opts.fullPage ?? false });
  console.log(`✓ ${name}`);
}

async function signIn(browser: Browser, email: string, viewport: { width: number; height: number }): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport, deviceScaleFactor: viewport.width < 500 ? 2 : 1 });
  await context.addInitScript(() => { try { window.localStorage.setItem("gw:welcome-tour-done", "1"); } catch {} });
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', RECORD_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.href.includes("/login"), { timeout: 60000 });
  await fakeStorage(page, prisma, { baseUrl: BASE_URL, uploaderEmail: email });
  return { context, page };
}

async function inspectionShots(browser: Browser) {
  console.log("• seeding the move-out inspection");
  await seedForTutorial("caretaker-inspections");
  const report = await prisma.conditionReport.findFirst({
    where: { reportType: "MOVE_OUT", tenant: { name: MOVE_OUT_TENANT } },
    orderBy: { createdAt: "desc" },
    select: { id: true, unitId: true, items: true },
  });
  if (!report) throw new Error("move-out inspection not seeded");

  // ── Caretaker, phone: a room, then the sign-off step ──
  const care = await signIn(browser, CARETAKER_EMAIL, PHONE);
  await care.page.goto(`${BASE_URL}/inspections/${report.id}`, { timeout: 180000 });
  await care.page.getByText("Emergency:").waitFor({ timeout: 120000 });
  await shot(care.page, "61-inspection-room");

  // Finish the Bathroom in the database, then readings, keys and signature.
  const items = (report.items as unknown as InspectionItem[]).map((i) => ({ ...i }));
  for (const it of items.filter((i) => i.room === "Bathroom")) {
    it.status = it.feature === "Sink/Taps" ? "POOR" : "GOOD";
    it.notes = it.feature === "Sink/Taps" ? "Basin cracked, tap drips" : "";
  }
  for (const [n, it] of items.filter((i) => i.room === "Bathroom").slice(0, 3).entries()) {
    const file = n === 0 ? "damage.jpg" : "bathroom.jpg";
    const ph = await prisma.conditionReportPhoto.create({ data: { reportId: report.id, storagePath: fixturePath(file), fileName: file, mimeType: "image/jpeg", fileSize: 60_000 } });
    it.photoIds = [...it.photoIds, ph.id];
  }
  const meters = await prisma.utilityMeter.findMany({
    where: { unitId: report.unitId, role: "UNIT", isActive: true },
    select: { id: true, openingReading: true, readings: { where: { status: { not: "VOID" } }, orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }], take: 1, select: { currentReading: true } } },
  });
  const res = await care.page.request.patch(`${BASE_URL}/api/condition-reports/${report.id}`, {
    data: {
      items,
      keys: [{ label: "Main door", count: 2 }, { label: "Gate", count: 1 }],
      tenantSignOff: "SIGNED",
      tenantSignedName: MOVE_OUT_TENANT,
      meterReadings: meters.map((m) => ({ meterId: m.id, reading: Number(m.readings[0]?.currentReading ?? m.openingReading ?? 0) + 12 })),
    },
  });
  if (!res.ok()) throw new Error(`PATCH failed ${res.status()} ${await res.text()}`);
  await prisma.conditionReport.update({ where: { id: report.id }, data: { tenantSignaturePath: fixturePath("signature.png"), tenantSignedAt: new Date() } });
  await care.page.reload();
  await care.page.getByText("Emergency:").waitFor({ timeout: 120000 });
  await care.page.getByRole("button", { name: "Sign-off" }).click();
  await care.page.getByText("Tenant sign-off").first().scrollIntoViewIfNeeded();
  await care.page.evaluate(() => window.scrollBy(0, -260));
  await shot(care.page, "62-inspection-signoff");

  const submitted = await care.page.request.post(`${BASE_URL}/api/condition-reports/${report.id}/submit`);
  if (!submitted.ok()) throw new Error(`submit failed ${submitted.status()} ${await submitted.text()}`);
  await care.context.close();

  // ── Manager, desktop: review with repair jobs, then the re-let checklist ──
  const mgr = await signIn(browser, UTILITIES_RECORD_EMAIL, DESKTOP);
  await mgr.page.goto(`${BASE_URL}/inspections/${report.id}`, { timeout: 180000 });
  await mgr.page.getByText("Repairs").first().waitFor({ timeout: 120000 });
  await mgr.page.getByRole("button", { name: /Create \d+ repair job/ }).click();
  await mgr.page.getByText(/Job: Open/).first().waitFor({ timeout: 60000 });
  await settle(mgr.page, 5000); // let the "repair job created" toast go
  if (wanted("63-inspection-review")) {
    await mgr.page.screenshot({ path: path.join(OUT_DIR, "63-inspection-review.png"), clip: { x: 0, y: 0, width: DESKTOP.width, height: 1100 }, fullPage: true });
    console.log("✓ 63-inspection-review");
  }
  const started = await mgr.page.request.post(`${BASE_URL}/api/turnovers`, { data: { unitId: report.unitId, conditionReportId: report.id } });
  if (!started.ok()) throw new Error(`turnover start failed ${started.status()}`);
  await mgr.page.goto(`${BASE_URL}/inspections?view=relet`, { timeout: 180000 });
  await mgr.page.getByText("Unit cleaned").first().waitFor({ timeout: 120000 });
  await shot(mgr.page, "64-relet-checklist");
  await mgr.context.close();
}

async function stayShots(browser: Browser) {
  console.log("• seeding Westlands Suites");
  await seedForTutorial("guest-stays");
  const property = await prisma.property.findFirst({ where: { name: STAYS_PROPERTY }, orderBy: { createdAt: "desc" }, select: { id: true } });
  const now = new Date();
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const leaving = await prisma.incomeEntry.findFirst({ where: { type: "AIRBNB", checkOut: today, unit: { propertyId: property!.id, unitNumber: "A2" } }, select: { id: true, unitId: true } });

  const care = await signIn(browser, CARETAKER_EMAIL, PHONE);
  await care.page.evaluate((id) => window.sessionStorage.setItem("selectedPropertyId", id), property!.id);
  await care.page.goto(`${BASE_URL}/stays`, { timeout: 180000 });
  await care.page.getByText("Leaving today").first().waitFor({ timeout: 120000 });
  await shot(care.page, "65-stays-today");

  await care.page.goto(`${BASE_URL}/stays/${leaving!.id}`, { timeout: 180000 });
  await care.page.getByText("Guests and ID").waitFor({ timeout: 120000 });
  await shot(care.page, "66-stay-detail");

  // Keys back, then the post-stay check with a damaged bathroom.
  await care.page.request.post(`${BASE_URL}/api/stays/${leaving!.id}/actions`, { data: { action: "return_keys" } });
  const created = await care.page.request.post(`${BASE_URL}/api/inspections`, { data: { unitId: leaving!.unitId, reportType: "POST_STAY", incomeEntryId: leaving!.id } });
  const check = await created.json();
  await care.page.goto(`${BASE_URL}/inspections/${check.id}`, { timeout: 180000 });
  await care.page.getByText("Post-stay inspection").first().waitFor({ timeout: 120000 });
  await care.page.getByRole("button", { name: /^Bathroom ·/ }).click();
  await care.page.getByRole("button", { name: "Damaged" }).click();
  await care.page.locator('input[placeholder="What is damaged? (required)"]').fill("Mirror cracked");
  await care.page.locator("input[type=file]").first().setInputFiles(path.join(PHOTO_DIR, "damage.jpg"));
  await care.page.waitForTimeout(1500);
  await shot(care.page, "67-post-stay-check");
  await care.context.close();
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    if (["61", "62", "63", "64"].some((p) => wanted(p))) await inspectionShots(browser);
    if (["65", "66", "67"].some((p) => wanted(p))) await stayShots(browser);
  } finally {
    await browser.close();
    await disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
