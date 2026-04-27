// Playwright screenshot capture for GroundWorkPM guide
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const OUT_DIR = path.join(__dirname, '..', 'public', 'guide-screenshots');
const EMAIL = 'manager@alba.co.ke';
const PASSWORD = 'manager123';

fs.mkdirSync(OUT_DIR, { recursive: true });

async function shot(page, name, { waitFor, fullPage = false, delay = 800 } = {}) {
  if (waitFor) await page.waitForSelector(waitFor, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(delay);
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage });
  console.log(`✓ ${name}`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  // 1. Landing page
  await page.goto(`${BASE_URL}/`);
  await shot(page, '01-landing', { waitFor: 'h1', delay: 1200 });

  // 2. Login page
  await page.goto(`${BASE_URL}/login`);
  await shot(page, '02-login', { waitFor: 'form', delay: 600 });

  // 3. Signup page
  await page.goto(`${BASE_URL}/signup`);
  await shot(page, '03-signup', { waitFor: 'form', delay: 600 });

  // --- Log in ---
  await page.goto(`${BASE_URL}/login`);
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  // Wait for navigation to complete (could be /dashboard, /onboarding, or /select-org)
  await page.waitForNavigation({ timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1000);
  const postLoginUrl = page.url();
  console.log('Post-login URL:', postLoginUrl);
  if (postLoginUrl.includes('/onboarding') || postLoginUrl.includes('/select-org')) {
    // Navigate directly to dashboard
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForTimeout(2000);
  }
  console.log('✓ logged in, current page:', page.url());

  // 4. Dashboard
  await page.goto(`${BASE_URL}/dashboard`);
  await shot(page, '04-dashboard', { waitFor: 'main', delay: 1500 });

  // 5. Properties
  await page.goto(`${BASE_URL}/properties`);
  await shot(page, '05-properties', { waitFor: 'main', delay: 1200 });

  // 6. Tenants list
  await page.goto(`${BASE_URL}/tenants`);
  await shot(page, '06-tenants', { waitFor: 'main', delay: 1200 });

  // 7. Tenant detail — navigate to first tenant
  await page.goto(`${BASE_URL}/tenants`);
  await page.waitForSelector('a[href*="/tenants/"]', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1000);
  const tenantLink = page.locator('a[href*="/tenants/"]:not([href="/tenants"])').first();
  const tenantHref = await tenantLink.getAttribute('href').catch(() => null);
  if (tenantHref) {
    await page.goto(`${BASE_URL}${tenantHref}`);
    await shot(page, '07-tenant-detail', { waitFor: 'main', delay: 1500 });
  }

  // 8. Income
  await page.goto(`${BASE_URL}/income`);
  await shot(page, '08-income', { waitFor: 'main', delay: 1500 });

  // 9. Expenses
  await page.goto(`${BASE_URL}/expenses`);
  await shot(page, '09-expenses', { waitFor: 'main', delay: 1500 });

  // 10. Invoices
  await page.goto(`${BASE_URL}/invoices`);
  await shot(page, '10-invoices', { waitFor: 'main', delay: 1200 });

  // 11. Arrears
  await page.goto(`${BASE_URL}/arrears`);
  await shot(page, '11-arrears', { waitFor: 'main', delay: 1200 });

  // 12. Maintenance
  await page.goto(`${BASE_URL}/maintenance`);
  await shot(page, '12-maintenance', { waitFor: 'main', delay: 1500 });

  // 13. Report
  await page.goto(`${BASE_URL}/report`);
  await shot(page, '13-report', { waitFor: 'main', delay: 2000 });

  // 14. Petty cash
  await page.goto(`${BASE_URL}/petty-cash`);
  await shot(page, '14-petty-cash', { waitFor: 'main', delay: 1200 });

  // 15. Forecast
  await page.goto(`${BASE_URL}/forecast`);
  await shot(page, '15-forecast', { waitFor: 'main', delay: 1500 });

  // 16. Vendors
  await page.goto(`${BASE_URL}/vendors`);
  await shot(page, '16-vendors', { waitFor: 'main', delay: 1200 });

  // 17. Insurance
  await page.goto(`${BASE_URL}/insurance`);
  await shot(page, '17-insurance', { waitFor: 'main', delay: 1200 });

  // 18. Compliance
  await page.goto(`${BASE_URL}/compliance`);
  await shot(page, '18-compliance', { waitFor: 'main', delay: 1200 });

  // 19. Maintenance (assets)
  await page.goto(`${BASE_URL}/assets`);
  await shot(page, '19-assets', { waitFor: 'main', delay: 1200 });

  // 20. Calendar
  await page.goto(`${BASE_URL}/calendar`);
  await shot(page, '20-calendar', { waitFor: 'main', delay: 1200 });

  // 21. Settings
  await page.goto(`${BASE_URL}/settings`);
  await shot(page, '21-settings', { waitFor: 'main', delay: 1200 });

  // 22. Settings users
  await page.goto(`${BASE_URL}/settings/users`);
  await shot(page, '22-settings-users', { waitFor: 'main', delay: 1200 });

  // 23. Billing
  await page.goto(`${BASE_URL}/billing`);
  await shot(page, '23-billing', { waitFor: 'main', delay: 1500 });

  // 24. Tenant portal — find a valid portal token
  // Try to grab it from the DB via API or check tenant detail for portal link
  // Fallback: use the portal page directly if we have a token
  // Get tenant portal token via a fetch to the API
  const tenantsResp = await page.evaluate(async () => {
    const r = await fetch('/api/tenants?limit=1');
    return r.json();
  });
  const firstTenant = tenantsResp?.tenants?.[0] || tenantsResp?.[0];
  if (firstTenant?.portalToken) {
    await page.goto(`${BASE_URL}/portal/${firstTenant.portalToken}`);
    await shot(page, '24-tenant-portal', { waitFor: 'main', delay: 1500 });
  } else {
    console.log('⚠ No portal token found, skipping portal screenshot');
  }

  await browser.close();
  console.log('\nAll screenshots saved to:', OUT_DIR);
})().catch(err => { console.error(err); process.exit(1); });
