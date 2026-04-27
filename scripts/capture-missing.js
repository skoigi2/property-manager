const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const OUT_DIR = path.join(__dirname, '..', 'public', 'guide-screenshots');
const EMAIL = 'manager@alba.co.ke';
const PASSWORD = 'manager123';

async function shot(page, name, delay = 1200) {
  await page.waitForTimeout(delay);
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
  console.log(`✓ ${name}`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  // Log in
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForNavigation({ timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1000);

  // Get a tenant ID via API
  const data = await page.evaluate(async () => {
    const r = await fetch('/api/tenants');
    return r.json();
  });
  const tenants = data.tenants || data || [];
  console.log('Tenants found:', tenants.length);

  if (tenants.length > 0) {
    const t = tenants[0];
    console.log('First tenant id:', t.id, 'portalToken:', t.portalToken);

    // Tenant detail
    await page.goto(`${BASE_URL}/tenants/${t.id}`);
    await shot(page, '07-tenant-detail', 1800);

    // Portal - generate a token if needed
    if (!t.portalToken) {
      const tokenResp = await page.evaluate(async (tid) => {
        const r = await fetch(`/api/tenants/${tid}/portal-token`, { method: 'POST' });
        return r.json();
      }, t.id);
      console.log('Generated portal token:', tokenResp.portalToken);
      if (tokenResp.portalToken) {
        await page.goto(`${BASE_URL}/portal/${tokenResp.portalToken}`);
        await shot(page, '24-tenant-portal', 2000);
      }
    } else {
      await page.goto(`${BASE_URL}/portal/${t.portalToken}`);
      await shot(page, '24-tenant-portal', 2000);
    }
  }

  // Also capture onboarding page (before login for new users)
  // Create a fresh context
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg2 = await ctx2.newPage();
  await pg2.goto(`${BASE_URL}/signup`);
  await pg2.waitForTimeout(800);
  // Simulate a new user state by navigating to onboarding with an existing session?
  // Actually just re-use login page for onboarding context

  await browser.close();
  console.log('Done');
})().catch(err => { console.error(err); process.exit(1); });
