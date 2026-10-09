/**
 * Guide screenshots for reaching tenants (public/guide.html):
 *   57 — the email a tenant gets when you reply to their portal message (Tenant messages)
 *   58 — Tenants list filtered to "Can't be contacted" (Tenant Management)
 *   59 — WhatsApp "Share Portal Link" for a tenant without a link (WhatsApp reminders)
 *   60 — Draft Email rent reminder from an Inbox overdue row, quoting what's owed
 *
 *   npx tsx scripts/capture-contact-screenshots.ts        (dev server on :3000)
 *   ONLY=58,59 npx tsx scripts/capture-contact-screenshots.ts
 *
 * Same Kenyan org as the utilities / WhatsApp / tenant-message shots
 * (guide-utilities@groundworkpm.com, KES): the tutorial seed re-creates its
 * Kilimani Court demo, so the changes below never outlive a run:
 * - Faith Chebet (103) sends a portal message and the manager replies (real
 *   APIs); 57 renders the logged reply email — local dev has no Resend key,
 *   so nothing is sent;
 * - Peter Omondi (302) loses his email and phone for 58.
 * window.open is stubbed (no wa.me tab); the portal link in previews is shown
 * on the production domain (display only).
 *
 * Refuses a non-local DATABASE_URL (the seed's guard).
 */
import { chromium, type Locator, type Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { disconnect, prisma, seedForTutorial } from "./record-tutorials/seed-state";
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

  // 58: one tenant nothing can reach.
  await prisma.tenant.updateMany({
    where: { name: "Peter Omondi", isActive: true, unit: { property: { name: "Kilimani Court" } } },
    data: { email: null, phone: null },
  });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem("gw:welcome-tour-done", "1");
    } catch {}
    window.open = () => null;
  });
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[type="email"]', UTILITIES_RECORD_EMAIL);
  await page.fill('input[type="password"]', RECORD_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.href.includes("/login"), { timeout: 30000 });

  // Faith writes from her portal; the manager answers (no named helpers in
  // here: tsx's __name wrapper doesn't exist in the page).
  const ids = await page.evaluate(async () => {
    const list = await fetch("/api/tenants").then((r) => r.json());
    const all = Array.isArray(list) ? list : list.tenants;
    const faith = all.find((t: { name: string }) => t.name === "Faith Chebet");
    const mercy = all.find((t: { name: string }) => t.name === "Mercy Wanjiru");
    const created = await fetch(`/api/tenants/${faith.id}/portal-token`, { method: "POST" }).then((r) => r.json());
    const thread = await fetch(`/api/portal/${created.portalToken}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: "Water pressure in the kitchen",
        category: "GENERAL",
        body: "Hi, the kitchen tap has had very low pressure since Monday. Could someone take a look this week? I'm home after 4 pm.",
      }),
    }).then((r) => r.json());
    await fetch(`/api/tenants/${faith.id}/messages/${thread.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "Thanks Faith — our plumber will come on Thursday after 4 pm. Please leave the kitchen accessible." }),
    });
    return { faithId: faith.id as string, mercyId: mercy.id as string };
  });

  // ── 57: the reply email the tenant receives (rendered from the email log) ──
  if (wanted("57")) {
    const email = await prisma.emailLog.findFirst({
      where: { subject: { startsWith: "Reply from" } },
      orderBy: { sentAt: "desc" },
      select: { subject: true, toEmail: true, bodyHtml: true },
    });
    if (!email) {
      console.log("⚠ 57-tenant-reply-email: no logged email, skipping");
    } else {
      const mail = await browser.newPage({ viewport: { width: 640, height: 900 } });
      await mail.setContent(
        `<html><body style="margin:0;background:#f4f1ea;padding:20px">
          <div id="mail" style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;max-width:600px;margin:0 auto;font-family:sans-serif">
            <div style="padding:14px 24px;border-bottom:1px solid #eee;font-size:13px;color:#374151">
              <div><strong>From:</strong> GroundWork PM &lt;noreply@groundworkpm.com&gt;</div>
              <div><strong>To:</strong> ${email.toEmail}</div>
              <div><strong>Subject:</strong> ${email.subject}</div>
            </div>
            ${(email.bodyHtml ?? "").split(BASE_URL).join(SHOWN_ORIGIN)}
          </div>
        </body></html>`,
      );
      await mail.locator("#mail").screenshot({ path: path.join(OUT_DIR, "57-tenant-reply-email.png") });
      console.log("✓ 57-tenant-reply-email");
      await mail.close();
    }
  }

  // ── 58: Tenants list → Can't be contacted ──
  if (wanted("58")) {
    await page.goto(`${BASE_URL}/tenants?filter=no-contact`, { timeout: 90000 });
    await page.getByText("Peter Omondi").first().waitFor({ timeout: 60000 });
    await settle(page);
    const filters = page.locator("select").filter({ hasText: "All contacts" }).first();
    const panel = filters.locator("xpath=ancestor::div[contains(@class,'rounded')][1]");
    // Filter bar + the one matching card.
    const box = await panel.boundingBox();
    const card = await page.getByText("Peter Omondi").first().locator("xpath=ancestor::div[contains(@class,'rounded')][1]").boundingBox();
    if (box && card) {
      await page.screenshot({
        path: path.join(OUT_DIR, "58-tenants-no-contact.png"),
        clip: { x: box.x - 8, y: box.y - 8, width: box.width + 16, height: card.y + card.height - box.y + 16 },
      });
      console.log("✓ 58-tenants-no-contact");
    } else {
      console.log("⚠ 58-tenants-no-contact: layout not found, skipping");
    }
  }

  // ── 59: WhatsApp → Share Portal Link (Mercy has no portal link) ──
  if (wanted("59")) {
    await page.goto(`${BASE_URL}/tenants/${ids.mercyId}`, { timeout: 90000 });
    await settle(page);
    await page.locator('button:has-text("WhatsApp")').first().click();
    const dialog = page.locator("dialog[open]");
    await dialog.getByText("Hi Mercy,").first().waitFor({ timeout: 30000 });
    await dialog.locator('button:has-text("Share Portal Link")').click();
    await dialog.getByText("has set up your tenant portal").first().waitFor({ timeout: 10000 });
    await settle(page, 600);
    await showProductionOrigin(page);
    await elementShot(dialog, "59-whatsapp-portal-link");
    await page.keyboard.press("Escape");
  }

  // ── 60: Inbox overdue row → Send reminder (Draft Email, figures owed) ──
  if (wanted("60")) {
    await page.setViewportSize({ width: 1280, height: 1100 });
    await page.goto(`${BASE_URL}/inbox`, { timeout: 90000 });
    await settle(page, 1500);
    const row = page.locator('tr:has-text("Rent overdue"):has-text("Faith Chebet")').first();
    await row.locator('button:has-text("Send reminder")').click();
    const modal = page.locator("div.fixed.inset-0 > div.bg-white").last();
    await modal.getByText("outstanding balance of").first().waitFor({ timeout: 60000 });
    await settle(page, 800);
    await showProductionOrigin(page);
    await elementShot(modal, "60-email-rent-reminder");
  }

  await browser.close();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => disconnect());
