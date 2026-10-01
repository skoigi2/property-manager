/**
 * Guide screenshots for "12b — Service Charge Budgets" (public/guide.html).
 *
 *   npx tsx scripts/capture-service-charge-screenshots.ts        (dev server on :3000)
 *   ONLY=47,48 npx tsx scripts/capture-service-charge-screenshots.ts
 *
 * Same Kenyan org as the utilities shots (guide-utilities@groundworkpm.com,
 * KES): the tutorial seed re-creates its Kilimani Court demo, which seeds this
 * year's service charge budget. The script then adds a budget for the service
 * charge year that has just ended (the 12 months to the end of last month,
 * the categories the demo spends on) so the year-end statement shows
 * balancing charges, and publishes it for the portal shot.
 *
 * Refuses a non-local DATABASE_URL (the seed's guard).
 */
import { chromium, type Locator, type Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { disconnect, seedForTutorial } from "./record-tutorials/seed-state";
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

/** The Card (rounded white box) that contains `text`. */
function cardWith(page: Page, text: string): Locator {
  return page.getByText(text, { exact: true }).first().locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
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

  // The year that has just ended: this month last year → end of last month.
  // It lines up with the demo's leases (they start a year back), so every
  // tenant is in for the whole year and only the vacant unit is the landlord's.
  const now = new Date();
  const endedYear = { year: now.getFullYear() - 1, startMonth: now.getMonth() + 1 };
  const ended = await page.evaluate(async ({ year, startMonth }) => {
    const props = await fetch("/api/properties?minimal=true").then((r) => r.json());
    const kc = (Array.isArray(props) ? props : props.properties).find((p: { name: string }) => p.name === "Kilimani Court");
    const res = await fetch("/api/service-charge/budgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        propertyId: kc.id,
        year,
        startMonth,
        lines: [
          { category: "SECURITY", amount: 540000, notes: "3 guards, 24/7" },
          { category: "CLEANER", amount: 264000, notes: "2 cleaners, common areas" },
          { category: "GARBAGE_COLLECTION", amount: 96000, notes: "Weekly collection" },
          { category: "WIFI", amount: 144000, notes: "Building fibre" },
        ],
      }),
    });
    const body = await res.json();
    return { propertyId: kc.id as string, budgetId: (body.id ?? null) as string | null };
  }, endedYear);
  if (!ended.budgetId) throw new Error("Could not create the ended-year budget");

  // ── This year's budget: costs, then each unit's share ──
  await page.goto(`${BASE_URL}/service-charge`, { timeout: 90000 });
  await settle(page);
  await tab(page, "Budget");
  await elementShot(cardWith(page, "Split between units by"), "45-service-charge-budget");
  await elementShot(cardWith(page, "Each unit's share"), "46-service-charge-unit-shares");

  // ── Budget vs actual ──
  await tab(page, "Budget vs actual");
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "47-service-charge-actuals");

  // ── Year-end statement for the year that has ended, every tenant ticked ──
  await page.locator('button[aria-label="Previous year"]').click();
  await settle(page);
  await tab(page, "Year-end statement");
  await page.locator('input[aria-label="Select all tenants"]').check();
  await page.setViewportSize({ width: 1280, height: 830 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "48-service-charge-statement");
  await page.setViewportSize({ width: 1280, height: 800 });

  // ── Tenant portal (phone): the published statement ──
  if (wanted("49")) {
    const token = await page.evaluate(async (budgetId) => {
      await fetch(`/api/service-charge/budgets/${budgetId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: true }),
      });
      const view = await fetch(`/api/service-charge/budgets/${budgetId}`).then((r) => r.json());
      const row = (view.statement?.rows ?? []).find((r: { balance: number }) => r.balance > 0) ?? view.statement?.rows?.[0];
      if (!row) return null;
      const res = await fetch(`/api/tenants/${row.tenantId}/portal-token`, { method: "POST" });
      const body = await res.json().catch(() => null);
      return body?.portalToken ?? body?.token ?? null;
    }, ended.budgetId);
    if (!token) {
      console.log("⚠ 49-portal-service-charge: no tenant / portal token, skipping");
    } else {
      const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
      const p = await phone.newPage();
      await p.goto(`${BASE_URL}/portal/${token}`, { timeout: 90000 });
      await settle(p, 1500);
      await p.locator('button:has-text("Balance")').first().click();
      await settle(p, 1500);
      const heading = p.getByText("Service charge", { exact: true }).last();
      const section = heading.locator("xpath=following-sibling::div[1]");
      if (wanted("49")) {
        await heading.scrollIntoViewIfNeeded();
        await settle(p, 600);
        const hb = await heading.boundingBox();
        const sb = await section.boundingBox();
        if (hb && sb) {
          const pad = 12;
          await p.screenshot({
            path: path.join(OUT_DIR, "49-portal-service-charge.png"),
            clip: { x: 0, y: hb.y - pad, width: 390, height: sb.y + sb.height - hb.y + pad * 2 },
          });
          console.log("✓ 49-portal-service-charge");
        } else console.log("⚠ 49-portal-service-charge: section not found, skipping");
      }
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
