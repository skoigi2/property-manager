/**
 * Guide screenshots for unit owners (public/guide.html, section #unit-owners):
 *   68 — Add Tenant with "Unit owner" chosen: no rent, deposit or lease end
 *   69 — an owner's page: "Unit owner" badge, service charge, ledger
 *   70 — the owner's service charge invoice (Invoices tab: no rent line)
 *   71 — the Tenants list: the "Unit owner" badge in place of a lease date
 *
 *   npx tsx scripts/capture-owner-screenshots.ts        (dev server on :3000)
 *   ONLY=69,70 npx tsx scripts/capture-owner-screenshots.ts
 *
 * Same Kenyan org as the utilities / service charge shots
 * (guide-utilities@groundworkpm.com, KES): the tutorial seed re-creates its
 * Kilimani Court demo, so nothing below outlives a run. Through the real APIs:
 * Grace Achieng becomes the owner of a vacant unit (billing from three months
 * back, with Wi-Fi), pays two months' service charge, and this month's invoice
 * (service charge + Wi-Fi, no rent) is raised.
 *
 * Refuses a non-local DATABASE_URL (the seed's guard).
 */
import { chromium, type Locator, type Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { disconnect, prisma, seedForTutorial } from "./record-tutorials/seed-state";
import { RECORD_PASSWORD, UTILITIES_RECORD_EMAIL } from "./record-tutorials/seed-utilities";

const BASE_URL = process.env.RECORD_BASE_URL ?? "http://localhost:3000";
const OUT_DIR = path.join(__dirname, "..", "public", "guide-screenshots");
const ONLY = (process.env.ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const wanted = (name: string) => ONLY.length === 0 || ONLY.some((p) => name.startsWith(p));
const OWNER = "Grace Achieng";
const SERVICE_CHARGE = 6500;

async function settle(page: Page, ms = 1200) {
  await page.waitForTimeout(600);
  await page
    .waitForFunction(() => document.querySelectorAll(".animate-spin").length === 0, undefined, { timeout: 30000 })
    .catch(() => {});
  await page.waitForTimeout(ms);
}

async function elementShot(loc: Locator, name: string) {
  if (!wanted(name)) return;
  if (!(await loc.count())) return console.log(`⚠ ${name}: element not found, skipping`);
  await loc.first().scrollIntoViewIfNeeded().catch(() => {});
  await settle(loc.page(), 800);
  await loc.first().screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
  console.log(`✓ ${name}`);
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

async function main() {
  console.log("• resetting the Kilimani Court demo");
  await seedForTutorial("utilities-metering");
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const unit = await prisma.unit.findFirst({
    where: { property: { name: "Kilimani Court", organization: { users: { some: { email: UTILITIES_RECORD_EMAIL } } } }, tenants: { none: { isActive: true } } },
    orderBy: { unitNumber: "asc" },
    select: { id: true, unitNumber: true, propertyId: true },
  });
  if (!unit) throw new Error("No vacant Kilimani Court unit for the owner");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  context.setDefaultTimeout(60000);
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

  // ── 68: Add Tenant → Unit owner (filled in, not saved) ──
  if (wanted("68")) {
    await page.goto(`${BASE_URL}/tenants?add=1`, { timeout: 90000 });
    const dialog = page.locator("dialog[open]");
    await dialog.getByText("Account type").first().waitFor({ timeout: 60000 });
    await dialog.locator('button[role="radio"]:has-text("Unit owner")').click();
    await dialog.locator('input[name="name"]').fill(OWNER);
    await dialog.locator('input[name="email"]').fill("grace.achieng@example.com");
    await dialog.locator('input[name="phone"]').fill("+254 712 345 678");
    await dialog.locator('select[name="unitId"]').selectOption(unit.id).catch(() => {});
    await dialog.locator('input[name="serviceCharge"]').fill(String(SERVICE_CHARGE));
    await settle(page, 600);
    await elementShot(dialog, "68-owner-form");
    await page.keyboard.press("Escape");
  }

  // The owner, billed from three months back; two months paid; this month invoiced.
  const now = new Date();
  const month = (back: number, day: number) => new Date(now.getFullYear(), now.getMonth() - back, day);
  const ownerId = await page.evaluate(
    async ({ unitId, name, sc, start }) => {
      const res = await fetch("/api/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, isUnitOwner: true, unitId, email: "grace.achieng@example.com", phone: "+254712345678", depositAmount: 0, monthlyRent: 0, serviceCharge: sc, wifiCharge: 1500, leaseStart: start, paymentFrequency: "MONTHLY" }),
      });
      return (await res.json()).id as string;
    },
    { unitId: unit.id, name: OWNER, sc: SERVICE_CHARGE, start: ymd(month(3, 1)) },
  );
  for (const back of [3, 2]) {
    const paid = await page.evaluate(
      async ({ unitId, tenantId, date, sc }) =>
        (await fetch("/api/income", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date, unitId, tenantId, type: "SERVICE_CHARGE", grossAmount: sc, agentCommission: 0, paymentMethod: "MPESA" }),
        })).status,
      { unitId: unit.id, tenantId: ownerId, date: ymd(month(back, 4)), sc: SERVICE_CHARGE },
    );
    if (paid !== 201) throw new Error(`income POST ${paid}`);
  }
  const invoiced = await page.evaluate(
    async ({ tenantId, year, mon, sc, due }) =>
      (await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, periodYear: year, periodMonth: mon, rentAmount: 0, serviceCharge: sc, wifiAmount: 1500, dueDate: due }),
      })).status,
    { tenantId: ownerId, year: now.getFullYear(), mon: now.getMonth() + 1, sc: SERVICE_CHARGE, due: ymd(month(0, 5)) },
  );
  if (invoiced !== 201) throw new Error(`invoice POST ${invoiced}`);

  // ── 69: the owner's page ──
  if (wanted("69") || wanted("70")) {
    await page.goto(`${BASE_URL}/tenants/${ownerId}`, { timeout: 90000 });
    await page.getByText("Unit owner · service charge only").first().waitFor({ timeout: 60000 });
    await settle(page, 1500);
    if (wanted("69")) {
      // (boundingBox() waits forever for a missing element — bound every lookup.)
      const header = page.getByText("Unit owner · service charge only").first().locator("xpath=ancestor::div[contains(@class,'rounded-2xl') or contains(@class,'rounded-xl')][1]");
      const ledger = page.getByText("Payment Ledger").first().locator("xpath=ancestor::div[contains(@class,'rounded-2xl') or contains(@class,'rounded-xl')][1]");
      const a = await header.boundingBox({ timeout: 15000 }).catch(() => null);
      const b = await ledger.boundingBox({ timeout: 15000 }).catch(() => null);
      if (a && b) {
        await page.setViewportSize({ width: 1280, height: Math.ceil(b.y + b.height + 40) });
        await settle(page, 600);
        const a2 = (await header.boundingBox({ timeout: 15000 }))!;
        const b2 = (await ledger.boundingBox({ timeout: 15000 }))!;
        await page.screenshot({ path: path.join(OUT_DIR, "69-owner-page.png"), clip: { x: a2.x - 8, y: a2.y - 8, width: a2.width + 16, height: b2.y + b2.height - a2.y + 16 } });
        console.log("✓ 69-owner-page");
      } else console.log("⚠ 69-owner-page: layout not found, skipping");
    }
  }

  // ── 70: Invoices page — the owner's row lists only the service charge (no rent line) ──
  if (wanted("70")) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${BASE_URL}/invoices`, { timeout: 90000 });
    const row = page.locator(`tr:has-text("${OWNER}")`).first();
    await row.waitFor({ timeout: 60000 });
    await settle(page);
    const head = row.locator("xpath=ancestor::table[1]/thead");
    if (await head.count()) {
      // Header strip + the owner's row, stacked into one image (element shots scroll as needed).
      const headPng = await head.screenshot();
      const rowPng = await row.screenshot();
      const hb = (await head.boundingBox({ timeout: 15000 }))!;
      const rb = (await row.boundingBox({ timeout: 15000 }))!;
      const out = await browser.newPage({ viewport: { width: Math.ceil(rb.width), height: Math.ceil(hb.height + rb.height) } });
      await out.setContent(`<body style="margin:0;background:#fff"><img src="data:image/png;base64,${headPng.toString("base64")}" style="display:block"><img src="data:image/png;base64,${rowPng.toString("base64")}" style="display:block"></body>`);
      await out.screenshot({ path: path.join(OUT_DIR, "70-owner-invoice.png") });
      await out.close();
      console.log("✓ 70-owner-invoice");
    } else console.log("⚠ 70-owner-invoice: table not found, skipping");
  }

  // ── 71: Tenants list — the owner's card ──
  if (wanted("71")) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${BASE_URL}/tenants`, { timeout: 90000 });
    await page.getByText(OWNER).first().waitFor({ timeout: 60000 });
    await settle(page);
    const card = page.getByText(OWNER).first().locator("xpath=ancestor::div[contains(@class,'rounded')][1]");
    await elementShot(card, "71-owner-card");
  }

  await browser.close();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => disconnect());
