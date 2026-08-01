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

async function shot(page, name, { waitFor = 'main', fullPage = false, delay = 1500 } = {}) {
  if (waitFor) await page.waitForSelector(waitFor, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(delay);
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage });
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
  }

  await page.goto(`${BASE_URL}/income`);
  await shot(page, '08-income', { delay: 2000 });

  await page.goto(`${BASE_URL}/expenses`);
  await shot(page, '09-expenses', { delay: 2000 });

  await page.goto(`${BASE_URL}/invoices`);
  await shot(page, '10-invoices');

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

  await browser.close();
  console.log('\nAll screenshots saved to:', OUT_DIR);
})().catch((err) => { console.error(err); process.exit(1); });
