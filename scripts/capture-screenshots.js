// Playwright screenshot capture for the GroundWorkPM user guide (public/guide.html).
//
// Prerequisites:
//   1. A dev server on http://localhost:3000 (npm run dev)
//   2. A screenshot org with demo data and freeAccess=true (no trial banner).
//      The account below was created for this purpose and holds the
//      Kilimani Court demo property (seeded via POST /api/demo/seed).
//
// Data covers the previous ~3 months, so the script steps the shared month
// picker back one month after login — every month-scoped page then shows a
// fully populated month instead of the current partial one.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const OUT_DIR = path.join(__dirname, '..', 'public', 'guide-screenshots');
const EMAIL = 'guide@groundworkpm.com';
const PASSWORD = 'guide-shots-2026';

fs.mkdirSync(OUT_DIR, { recursive: true });

// ONLY=32,33 (comma-separated name prefixes) re-captures just those shots; the
// script still walks every page so per-page state (login, month step) holds.
const ONLY = (process.env.ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const wanted = (name) => ONLY.length === 0 || ONLY.some((p) => name.startsWith(p));

async function shot(page, name, { waitFor = 'main', fullPage = false, delay = 1500 } = {}) {
  if (!wanted(name)) return;
  if (waitFor) await page.waitForSelector(waitFor, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(delay);
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage });
  console.log(`✓ ${name}`);
}

// Element crop (cards / modals) — same ONLY filter.
async function elementShot(locator, name, { delay = 1500 } = {}) {
  if (!wanted(name)) return;
  if (!(await locator.count())) { console.log(`⚠ ${name}: element not found, skipping`); return; }
  await locator.first().scrollIntoViewIfNeeded().catch(() => {});
  await locator.page().waitForTimeout(delay);
  await locator.first().screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
  console.log(`✓ ${name}`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  // ── Public pages ──
  await page.goto(`${BASE_URL}/`);
  await shot(page, '01-landing', { waitFor: 'h1', delay: 1800 });

  await page.goto(`${BASE_URL}/login`);
  await shot(page, '02-login', { waitFor: 'form', delay: 800 });

  await page.goto(`${BASE_URL}/signup`);
  await shot(page, '03-signup', { waitFor: 'form', delay: 800 });

  // ── Log in ──
  await page.goto(`${BASE_URL}/login`);
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.href.includes('/login'), { timeout: 30000 });
  console.log('✓ logged in →', page.url());

  // ── Dashboard: step back one month so every month-scoped page shows full data ──
  await page.goto(`${BASE_URL}/dashboard`);
  await page.waitForSelector('main', { timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.click('button[aria-label="Previous month"]').catch(() => console.log('⚠ month picker not found'));
  await shot(page, '04-dashboard', { delay: 2500 });

  // ── Inbox / Cases ──
  await page.goto(`${BASE_URL}/inbox`);
  await shot(page, '25-inbox', { delay: 2000 });

  await page.goto(`${BASE_URL}/cases`);
  await shot(page, '26-cases', { delay: 2000 });

  const caseLink = page.locator('a[href^="/cases/"]').first();
  const caseHref = await caseLink.getAttribute('href').catch(() => null);
  if (caseHref) {
    await page.goto(`${BASE_URL}${caseHref}`);
    await shot(page, '27-case-detail', { delay: 2200 });
  } else {
    console.log('⚠ no case link found, skipping 27-case-detail');
  }

  // Complaints (guide org holds two seeded complaints; the NOISE one is at Investigating with tenant-visible notes)
  await page.goto(`${BASE_URL}/complaints`);
  await shot(page, '30-complaints', { delay: 2500 });

  const complaintLink = page.locator('a[href^="/complaints/"]').first();
  const complaintHref = await complaintLink.getAttribute('href').catch(() => null);
  if (complaintHref) {
    await page.goto(`${BASE_URL}${complaintHref}`);
    await shot(page, '31-complaint-detail', { delay: 2800 });
  } else {
    console.log('⚠ no complaint link found, skipping 31-complaint-detail');
  }

  // ── Core pages ──
  await page.goto(`${BASE_URL}/properties`);
  await shot(page, '05-properties');

  await page.goto(`${BASE_URL}/tenants`);
  await shot(page, '06-tenants');

  const tenantLink = page.locator('a[href*="/tenants/"]:not([href="/tenants"])').first();
  const tenantHref = await tenantLink.getAttribute('href').catch(() => null);
  if (tenantHref) {
    await page.goto(`${BASE_URL}${tenantHref.split('?')[0]}`);
    await shot(page, '07-tenant-detail', { delay: 2200 });

    // ── Tenant edit form: the "show VAT number" checkbox, cropped with the
    // lease-date fields above it for context.
    if (wanted('35-tenant-vat-checkbox')) {
      await page.click('button:has-text("Edit")').catch(() => {});
      const vatBox = page.locator('input[name="showVatOnInvoice"]');
      await vatBox.waitFor({ timeout: 15000 }).catch(() => {});
      if (await vatBox.count()) {
        const label = vatBox.locator('xpath=ancestor::label[1]');
        await label.scrollIntoViewIfNeeded();
        await page.waitForTimeout(800);
        const box = await label.boundingBox();
        if (box) {
          await page.screenshot({
            path: path.join(OUT_DIR, '35-tenant-vat-checkbox.png'),
            clip: { x: Math.max(box.x - 28, 0), y: Math.max(box.y - 122, 0), width: box.width + 56, height: box.height + 134 },
          });
          console.log('✓ 35-tenant-vat-checkbox');
        }
      } else {
        console.log('⚠ VAT checkbox not found, skipping 35-tenant-vat-checkbox');
      }
      await page.keyboard.press('Escape').catch(() => {});
    }
  }

  await page.goto(`${BASE_URL}/income`);
  await shot(page, '08-income', { delay: 2000 });

  await page.goto(`${BASE_URL}/expenses`);
  await shot(page, '09-expenses', { delay: 2000 });

  await page.goto(`${BASE_URL}/invoices`);
  await shot(page, '10-invoices');

  // ── Invoice form on the Move-in preset (Charlotte Davies, Belsize Court) ──
  // Seeded 2026-09: Belsize Court has leaseFeeDefault 250 so the lease agreement
  // fee line prefills. The preset opens on the lease-start month (which already
  // has a rent invoice; October holds the seeded move-in invoice) so the shot
  // switches to November 2026 first.
  const moveInTenant = await page.evaluate(async () => {
    const r = await fetch('/api/tenants?activeOnly=true');
    const list = await r.json();
    const t = (Array.isArray(list) ? list : []).find((x) => x.name === 'Charlotte Davies') || list[0];
    return t?.id || null;
  });
  if (moveInTenant) {
    await page.goto(`${BASE_URL}/invoices?new=move-in&tenantId=${moveInTenant}`);
    await page.waitForSelector('.fixed.inset-0 input[inputmode="decimal"]', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const selects = page.locator('.fixed.inset-0 select');
    await selects.nth(1).selectOption('11').catch(() => {});
    await selects.nth(2).selectOption('2026').catch(() => {});
    await page.fill('.fixed.inset-0 input[type="date"]', '2026-11-01').catch(() => {});
    // The property's lease-fee default prefills a moment after the tenant loads.
    await page.waitForFunction(() => {
      const inputs = document.querySelectorAll('.fixed.inset-0 input[inputmode="decimal"]');
      return inputs.length >= 4 && inputs[inputs.length - 1].value !== '';
    }, { timeout: 20000 }).catch(() => console.log('⚠ lease fee default did not prefill'));
    await page.click('.fixed.inset-0 h2').catch(() => {});
    await elementShot(page.locator('.fixed.inset-0 > div'), '32-invoice-move-in', { delay: 1000 });
    await page.keyboard.press('Escape').catch(() => {});
  } else {
    console.log('⚠ no tenant for the move-in form shot');
  }

  // ── Owner Invoices tab: lease preparation fee recovery panel (expanded) ──
  // Seeded 2026-09: Charlotte's move-in lease fee recovered on the September
  // management-fee invoice (PAID → Settled) and Daniel Walsh's lease fee paid
  // after that invoice was generated (→ Not yet invoiced).
  await page.goto(`${BASE_URL}/invoices?tab=owner`);
  await page.waitForSelector('button:has-text("Lease preparation fees")', { timeout: 30000 }).catch(() => {});
  const recoveryBtn = page.locator('button:has-text("Lease preparation fees")');
  if (await recoveryBtn.count()) {
    await recoveryBtn.first().click();
    await elementShot(recoveryBtn.first().locator('..'), '33-owner-invoices-recovery', { delay: 1500 });
  } else {
    console.log('⚠ recovery panel not found, skipping 33-owner-invoices-recovery');
  }

  await page.goto(`${BASE_URL}/arrears`);
  await shot(page, '11-arrears');

  await page.goto(`${BASE_URL}/maintenance`);
  await shot(page, '12-maintenance', { delay: 2000 });

  await page.goto(`${BASE_URL}/report`);
  await shot(page, '13-report', { delay: 2500 });

  await page.goto(`${BASE_URL}/petty-cash`);
  await shot(page, '14-petty-cash');

  await page.goto(`${BASE_URL}/forecast`);
  await shot(page, '15-forecast', { delay: 2000 });

  await page.goto(`${BASE_URL}/vendors`);
  await shot(page, '16-vendors');

  await page.goto(`${BASE_URL}/insurance`);
  await shot(page, '17-insurance');
  // The renewed Contents policy (ZUR-BC-004, seeded 2026-09) carries the
  // contents-cover-vs-asset-register line; capture that card on its own.
  const contentsCard = page.locator('a[href^="/insurance"], [id^="item-"]').filter({ hasText: 'ZUR-BC-004' }).first();
  if (await contentsCard.count()) {
    await contentsCard.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await contentsCard.screenshot({ path: path.join(OUT_DIR, '17b-insurance-contents.png') });
    console.log('✓ 17b-insurance-contents');
  } else {
    console.log('⚠ ZUR-BC-004 not found, skipping 17b-insurance-contents');
  }

  await page.goto(`${BASE_URL}/compliance`);
  await shot(page, '18-compliance');

  await page.goto(`${BASE_URL}/assets`);
  await shot(page, '19-assets');

  await page.goto(`${BASE_URL}/calendar`);
  await shot(page, '20-calendar', { delay: 2200 });

  await page.goto(`${BASE_URL}/automations`);
  await shot(page, '28-automations', { delay: 2000 });

  await page.goto(`${BASE_URL}/import`);
  await shot(page, '29-import');

  await page.goto(`${BASE_URL}/settings`);
  await shot(page, '21-settings');

  await page.goto(`${BASE_URL}/settings/users`);
  await shot(page, '22-settings-users');

  await page.goto(`${BASE_URL}/billing`);
  await shot(page, '23-billing', { delay: 2000 });

  // ── Tenant portal: use (or mint) a portal token ──
  const portal = await page.evaluate(async () => {
    const r = await fetch('/api/tenants');
    const data = await r.json();
    const tenants = data?.tenants || data || [];
    let t = tenants.find((x) => x.portalToken);
    if (!t && tenants[0]) {
      const gen = await fetch(`/api/tenants/${tenants[0].id}/portal-token`, { method: 'POST' });
      const g = await gen.json().catch(() => null);
      if (g?.portalToken || g?.token) return g.portalToken || g.token;
    }
    return t?.portalToken || null;
  });
  if (portal) {
    await page.goto(`${BASE_URL}/portal/${portal}`);
    await shot(page, '24-tenant-portal', { delay: 2200 });
  } else {
    console.log('⚠ No portal token found, skipping portal screenshot');
  }

  // ── Portal Balance tab: receipts on the activity timeline (Charlotte Davies) ──
  const receiptPortal = await page.evaluate(async () => {
    const r = await fetch('/api/tenants');
    const data = await r.json();
    const tenants = data?.tenants || data || [];
    const t = tenants.find((x) => x.name === 'Charlotte Davies' && x.portalToken) || tenants.find((x) => x.portalToken);
    return t?.portalToken || null;
  });
  if (receiptPortal) {
    await page.goto(`${BASE_URL}/portal/${receiptPortal}`);
    await page.waitForSelector('button:has-text("Balance")', { timeout: 30000 }).catch(() => {});
    await page.click('button:has-text("Balance")').catch(() => {});
    await page.waitForSelector('h2:has-text("Activity Timeline")', { timeout: 30000 }).catch(() => {});
    await page.locator('h2:has-text("Activity Timeline")').scrollIntoViewIfNeeded().catch(() => {});
    await page.mouse.wheel(0, -80).catch(() => {});
    await shot(page, '34-portal-receipts', { waitFor: null, delay: 1500 });
  }

  await browser.close();
  console.log('\nAll screenshots saved to:', OUT_DIR);
})().catch((err) => { console.error(err); process.exit(1); });
