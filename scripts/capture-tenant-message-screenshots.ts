/**
 * Guide screenshots for "Tenant messages" (public/guide.html, Operational Inbox).
 *
 *   npx tsx scripts/capture-tenant-message-screenshots.ts        (dev server on :3000)
 *   ONLY=54,56 npx tsx scripts/capture-tenant-message-screenshots.ts
 *
 * Same Kenyan org as the utilities / WhatsApp shots (guide-utilities@groundworkpm.com,
 * KES): the tutorial seed re-creates its Kilimani Court demo. Faith Chebet
 * (unit 103) then sends a message through her tenant portal (the real portal
 * API), which puts it in the Inbox and logs the notification email — shot 55
 * renders that logged email (local dev has no Resend key, so it isn't sent).
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

const SUBJECT = "Water pressure in the kitchen";
const BODY = "Hi, the kitchen tap has had very low pressure since Monday. Could someone take a look this week? I'm home after 4 pm.";

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

  // Faith writes through her tenant portal (no named helpers in here: tsx's
  // __name wrapper doesn't exist in the page).
  const ids = await page.evaluate(
    async ({ subject, body }) => {
      const list = await fetch("/api/tenants").then((r) => r.json());
      const faith = (Array.isArray(list) ? list : list.tenants).find((t: { name: string }) => t.name === "Faith Chebet");
      const created = await fetch(`/api/tenants/${faith.id}/portal-token`, { method: "POST" }).then((r) => r.json());
      const res = await fetch(`/api/portal/${created.portalToken}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, category: "GENERAL", body }),
      }).then((r) => r.json());
      return { tenantId: faith.id as string, threadId: res.id as string };
    },
    { subject: SUBJECT, body: BODY },
  );

  // ── 54: the Inbox row ──
  await page.goto(`${BASE_URL}/inbox`, { timeout: 90000 });
  await settle(page, 1500);
  await elementShot(page.locator('tr:has-text("Tenant message")'), "54-inbox-tenant-message");

  // ── 55: the notification email (rendered from the email log) ──
  if (wanted("55")) {
    const email = await prisma.emailLog.findFirst({
      where: { subject: { startsWith: "New tenant message — Faith Chebet" } },
      orderBy: { sentAt: "desc" },
      select: { subject: true, toEmail: true, bodyHtml: true },
    });
    if (!email) {
      console.log("⚠ 55-tenant-message-email: no logged email, skipping");
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
            ${email.bodyHtml}
          </div>
        </body></html>`,
      );
      await mail.locator("#mail").screenshot({ path: path.join(OUT_DIR, "55-tenant-message-email.png") });
      console.log("✓ 55-tenant-message-email");
      await mail.close();
    }
  }

  // ── 56: Reply → the conversation on the tenant page ──
  if (wanted("56")) {
    await page.goto(`${BASE_URL}/tenants/${ids.tenantId}?tab=messages&thread=${ids.threadId}`, { timeout: 90000 });
    await page.getByText("very low pressure since Monday").last().waitFor({ timeout: 60000 });
    await settle(page);
    await page.fill('textarea[placeholder="Type your reply..."]', "Thanks Faith — our plumber will come on Thursday after 4 pm.");
    const panel = page.getByText("Portal Messages", { exact: true }).first().locator("xpath=ancestor::div[contains(@class,'rounded')][1]");
    await elementShot(panel, "56-tenant-message-thread");
  }

  await browser.close();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => disconnect());
