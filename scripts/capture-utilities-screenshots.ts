/**
 * Guide screenshots for "12a — Water & Electricity" (public/guide.html).
 *
 *   npx tsx scripts/capture-utilities-screenshots.ts        (dev server on :3000)
 *   ONLY=37,39 npx tsx scripts/capture-utilities-screenshots.ts
 *
 * Metering is a Kenyan workflow, so these shots come from the utilities
 * tutorial's own org (guide-utilities@groundworkpm.com, KES) rather than the
 * GBP guide org used by capture-screenshots.js. The tutorial seed resets that
 * org's Kilimani Court demo first — this month unread, last month's readings
 * for two units awaiting approval (one a flagged spike), the paid / unpaid mix —
 * and writes the filled-in import sheet used for the import preview shot.
 *
 * Refuses a non-local DATABASE_URL (the seed's guard).
 */
import { chromium, type Locator, type Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { FIXTURES_DIR, disconnect, seedForTutorial } from "./record-tutorials/seed-state";
import { RECORD_PASSWORD, UTILITIES_RECORD_EMAIL } from "./record-tutorials/seed-utilities";

const BASE_URL = process.env.RECORD_BASE_URL ?? "http://localhost:3000";
const OUT_DIR = path.join(__dirname, "..", "public", "guide-screenshots");
const ONLY = (process.env.ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const wanted = (name: string) => ONLY.length === 0 || ONLY.some((p) => name.startsWith(p));

async function settle(page: Page, ms = 1200) {
  await page.waitForTimeout(600);
  await page
    .waitForFunction(() => document.querySelectorAll(".animate-spin").length === 0, undefined, { timeout: 30000 })
    .catch(() => {});
  await page.waitForTimeout(ms);
}

async function shot(page: Page, name: string) {
  if (!wanted(name)) return;
  await settle(page);
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
  console.log(`✓ ${name}`);
}

async function elementShot(loc: Locator, name: string) {
  if (!wanted(name)) return;
  if (!(await loc.count())) return console.log(`⚠ ${name}: element not found, skipping`);
  await loc.first().scrollIntoViewIfNeeded().catch(() => {});
  await settle(loc.page(), 800);
  await loc.first().screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
  console.log(`✓ ${name}`);
}

async function tab(page: Page, label: string) {
  await page.locator(`button:has-text("${label}")`).first().click();
  await settle(page, 400);
}

async function main() {
  console.log("• resetting the Kilimani Court demo");
  await seedForTutorial("utilities-metering");
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem("gw:welcome-tour-done", "1");
    } catch {}
  });
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[type="email"]', UTILITIES_RECORD_EMAIL);
  await page.fill('input[type="password"]', RECORD_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.href.includes("/login"), { timeout: 30000 });

  // ── Readings: By unit, two readings typed (live usage + Save 2 readings) ──
  await page.goto(`${BASE_URL}/utilities?tab=readings`, { timeout: 90000 });
  await settle(page);
  await page.locator('button:has-text("By unit")').click();
  for (let i = 0; i < 2; i++) {
    const input = page.locator("input[data-reading-input]").nth(i);
    const row = input.locator("xpath=ancestor::tr[1]");
    const previous = Number((await row.locator("td").nth(2).innerText()).replace(/,/g, ""));
    const isWater = (await row.locator("td").nth(1).innerText()).includes("Water");
    await input.fill(String(previous + (isWater ? 5 : 142)));
  }
  await page.locator("input[data-reading-input]").nth(2).focus();
  await shot(page, "37-utilities-readings");

  // ── Import preview (closed again without importing) ──
  if (wanted("38")) {
    await page.locator('button:has-text("Import readings")').click();
    await page.locator("dialog input[type=file]").setInputFiles(path.join(FIXTURES_DIR, "utilities-readings.xlsx"));
    await page.locator("dialog tbody tr").first().waitFor({ timeout: 15000 });
    await shot(page, "38-utilities-import");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  }

  // ── Meters & tariffs ──
  await tab(page, "Meters & tariffs");
  await shot(page, "36-utilities-meters");

  // ── Review & bill, last month: the two readings awaiting approval ──
  await tab(page, "Review & bill");
  await page.locator('button[aria-label="Previous month"]').click();
  // The two readings awaiting approval (one a flagged spike) sit a dozen rows
  // down: a taller window keeps the summary, the headers and them in one shot.
  await page.setViewportSize({ width: 1280, height: 1330 });
  await settle(page, 400);
  await shot(page, "39-utilities-review");
  await page.setViewportSize({ width: 1280, height: 800 });

  // ── Paid & unpaid ──
  await tab(page, "Paid & unpaid");
  await shot(page, "40-utilities-paid-unpaid");

  // ── Reconciliation ──
  await tab(page, "Reconciliation");
  await shot(page, "41-utilities-reconciliation");

  // ── Tenant portal (phone): a tenant who owes for utilities ──
  if (wanted("42")) {
    const token = await page.evaluate(async () => {
      const props = await fetch("/api/properties?minimal=true").then((r) => r.json());
      const propertyId = props[0]?.id;
      const st = await fetch(`/api/utilities/statement?propertyId=${propertyId}`).then((r) => r.json());
      const owing = (st.rows ?? []).find((r: { totalUnpaid?: number; isActive?: boolean }) => (r.totalUnpaid ?? 0) > 0 && r.isActive !== false);
      if (!owing) return null;
      const res = await fetch(`/api/tenants/${owing.tenantId}/portal-token`, { method: "POST" });
      const body = await res.json().catch(() => null);
      return body?.portalToken ?? body?.token ?? null;
    });
    if (!token) {
      console.log("⚠ 42-portal-utilities: no owing tenant / portal token, skipping");
    } else {
      const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
      const p = await phone.newPage();
      await p.goto(`${BASE_URL}/portal/${token}`, { timeout: 90000 });
      await settle(p, 1500);
      const card = p
        .getByText("Water & electricity", { exact: true })
        .first()
        .locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
      await elementShot(card, "42-portal-utilities");
      await phone.close();
    }
  }

  await browser.close();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => disconnect());
