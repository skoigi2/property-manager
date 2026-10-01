/**
 * Guide screenshots for "WhatsApp reminders" (public/guide.html, Tenant Management).
 *
 *   npx tsx scripts/capture-whatsapp-screenshots.ts        (dev server on :3000)
 *   ONLY=50,52 npx tsx scripts/capture-whatsapp-screenshots.ts
 *
 * Same Kenyan org as the utilities / service charge shots
 * (guide-utilities@groundworkpm.com, KES): the tutorial seed re-creates its
 * Kilimani Court demo, where Faith Chebet (unit 103) is two months behind and
 * Samuel Kiprono (201) owes utilities — the two overdue invoices in the Inbox.
 *
 * window.open is stubbed, so no WhatsApp tab ever opens. The portal link in
 * the message preview is shown on the production domain rather than
 * localhost:3000 (display only — the app uses its own origin).
 *
 * Refuses a non-local DATABASE_URL (the seed's guard).
 */
import { chromium, type Locator, type Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { disconnect, seedForTutorial } from "./record-tutorials/seed-state";
import { RECORD_PASSWORD, UTILITIES_RECORD_EMAIL } from "./record-tutorials/seed-utilities";

const BASE_URL = process.env.RECORD_BASE_URL ?? "http://localhost:3000";
const SHOWN_ORIGIN = "https://groundworkpm.com";
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

async function elementShot(loc: Locator, name: string) {
  if (!wanted(name)) return;
  if (!(await loc.count())) return console.log(`⚠ ${name}: element not found, skipping`);
  await loc.first().scrollIntoViewIfNeeded().catch(() => {});
  await settle(loc.page(), 800);
  await loc.first().screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
  console.log(`✓ ${name}`);
}

/** Show the portal link on the production domain (display only). */
async function showProductionOrigin(page: Page) {
  await page.evaluate(
    ({ from, to }) => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (n.nodeValue?.includes(from)) n.nodeValue = n.nodeValue.split(from).join(to);
      }
    },
    { from: BASE_URL, to: SHOWN_ORIGIN },
  );
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
    // Never leave the app for wa.me while capturing.
    window.open = () => null;
  });
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[type="email"]', UTILITIES_RECORD_EMAIL);
  await page.fill('input[type="password"]', RECORD_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.href.includes("/login"), { timeout: 30000 });

  // Faith Chebet: give her a portal link (so the reminder carries it) and two
  // logged WhatsApp sends for the Comms tab shot.
  const faithId = await page.evaluate(async () => {
    const list = await fetch("/api/tenants").then((r) => r.json());
    const faith = (Array.isArray(list) ? list : list.tenants).find((t: { name: string }) => t.name === "Faith Chebet");
    await fetch(`/api/tenants/${faith.id}/portal-token`, { method: "POST" });
    // (no named helper functions in here: tsx's __name wrapper doesn't exist in the page)
    for (const [subject, templateUsed, body] of [
      ["Payment receipt (WhatsApp)", "payment_receipt", "Hi Faith, Nairobi Homes Management confirms your payment. Thank you!"],
      ["Rent reminder (WhatsApp)", "rent_reminder", "Hi Faith, this is a reminder that rent on Unit 103, Kilimani Court is outstanding."],
    ]) {
      await fetch(`/api/tenants/${faith.id}/communication-log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "WHATSAPP", subject, templateUsed, body }),
      });
    }
    return faith.id as string;
  });

  // ── 50: tenant header → WhatsApp modal (rent reminder) ──
  await page.goto(`${BASE_URL}/tenants/${faithId}`, { timeout: 90000 });
  await settle(page);
  if (wanted("50")) {
    await page.locator('button:has-text("WhatsApp")').first().click();
    await page.locator("dialog[open]").getByText("Hi Faith,").first().waitFor({ timeout: 30000 });
    await settle(page, 600);
    await showProductionOrigin(page);
    await elementShot(page.locator("dialog[open]"), "50-whatsapp-tenant-modal");
    await page.keyboard.press("Escape");
  }

  // ── 53: Comms tab with the logged sends ──
  if (wanted("53")) {
    await page.goto(`${BASE_URL}/tenants/${faithId}?tab=comms`, { timeout: 90000 });
    await settle(page);
    const list = page.getByText("Rent reminder (WhatsApp)").first().locator("xpath=ancestor::div[contains(@class,'divide-y')][1]");
    const card = list.locator("xpath=ancestor::div[contains(@class,'rounded')][1]");
    await elementShot((await card.count()) ? card : list, "53-whatsapp-comms-log");
  }

  // ── 51 / 52: Inbox overdue-invoice rows and the bulk stepper ──
  await page.goto(`${BASE_URL}/inbox`, { timeout: 90000 });
  await settle(page, 1500);
  const overdueRows = page.locator('tr:has-text("Rent overdue")');
  await elementShot(overdueRows.first(), "51-whatsapp-inbox-row");

  if (wanted("52")) {
    const n = await overdueRows.count();
    for (let i = 0; i < n; i++) await overdueRows.nth(i).locator('input[type="checkbox"]').check();
    await page.locator('button:has-text("Remind on WhatsApp")').first().click();
    await page.locator("dialog[open]").getByText(/Next:/).first().waitFor({ timeout: 60000 });
    await settle(page, 600);
    await showProductionOrigin(page);
    await elementShot(page.locator("dialog[open]"), "52-whatsapp-bulk-step");
  }

  await browser.close();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => disconnect());
