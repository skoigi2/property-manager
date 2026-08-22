/**
 * Recorder script for `first-15-minutes`.
 * Translates docs/tutorials/first-15-minutes.md step-for-step — the subtitle
 * lines below are copied verbatim from that shot list (the source of truth).
 */
import { Harness } from "./harness";
import { prisma } from "./seed-state";

export async function record() {
  const prop = await prisma.property.findFirst({ where: { name: "Harbour View" } });
  if (!prop) throw new Error("Run seed-state first — Harbour View property missing.");

  const h = new Harness("first-15-minutes");
  await h.start();

  // 0:00 dashboard, scoped to the fresh property
  await h.selectProperty(prop.id);
  await h.goto("/dashboard");
  await h.say("This is your dashboard on day one. The checklist at the top is your to-do list.", 6000);

  await h.hover('div:has(> div h2):has-text("configured")');
  await h.say("Every amber row is something not set up yet — and each one has a shortcut link.", 6500);

  await h.say("Let's start with the big one: putting a tenant on a lease.", 4000);
  await h.click('a:has-text("Add tenant")');

  // 0:30 tenants page → open the Add Tenant modal
  await h.click('button:has-text("Add Tenant")');
  await h.say("Name, unit, rent, lease start. That's all the app needs to start tracking.", 3500);
  await h.type('input[name="name"]', "Amina Yusuf");
  // The modal lists vacant units across every property — pick ours by label.
  await h.selectByLabel('select[name="unitId"]', "A1 (Harbour View)");
  await h.type('input[name="monthlyRent"]', "850");
  await h.type('input[name="leaseStart"]', new Date().toISOString().slice(0, 10));
  await h.click('dialog button:has-text("Add Tenant")');
  // The modal switches to an "Upload Documents" onboarding step — skip it.
  await h.click('dialog button:has-text("Skip")');
  await h.page.waitForSelector("dialog[open]", { state: "detached", timeout: 10000 });
  // A "Generate Letting Fee Invoice?" prompt follows for new tenancies — skip it.
  await h.click('button:has-text("Skip")');
  await h.say("Saved. The unit is now occupied and rent is expected every month.", 5000);

  // 1:15 tenant detail → portal link (exact row link via the new tenant's id)
  const amina = await prisma.tenant.findFirst({ where: { name: "Amina Yusuf" } });
  if (!amina) throw new Error("Tenant did not save — check the form flow.");
  await h.click(`a[href="/tenants/${amina.id}"]`);
  await h.say("Every tenant gets a portal link — no password, no app to install.", 4000);
  await h.click('button:has-text("Portal Link")');
  await h.hover('button:has-text("Copy Link")');
  await h.say("Share this on WhatsApp or email. Tenants see their balance, invoices and documents here.", 6500);

  // 1:50 income
  await h.goto("/income");
  await h.click('button:has-text("All Entries")');
  await h.click('button:has-text("Add Entry")');
  await h.say("When rent lands in your account, record it here. Pick the tenant, enter the amount, done.", 4000);
  await h.selectIndex('select[name="unitId"]', 1);
  await h.type('input[name="grossAmount"]', "850");
  await h.click('button:has-text("Save Entry")');
  await h.say("The app now knows what you expected and what actually arrived.", 6000);

  // 2:35 expenses
  await h.goto("/expenses");
  await h.click('button:has-text("Add Expense")');
  await h.say("Spending works the same way. Category, amount, save — that's your P&L building itself.", 4000);
  await h.select('select[name="scope"]', "PROPERTY");
  await h.select('select[name="category"]', "CLEANER");
  await h.type('input[name="amount"]', "60");
  await h.type('input[name="description"]', "Common-area cleaning");
  await h.click('button:has-text("Save Expense")');
  await h.pause(1500);

  // 3:05 back to dashboard
  await h.goto("/dashboard");
  await h.say("Back on the dashboard, the checklist has caught up. Green rows mean the app can stop nagging.", 7000);

  await h.page.mouse.wheel(0, 500);
  await h.say("From here everything updates itself — arrears, occupancy, cash flow.", 6000);
  await h.page.mouse.wheel(0, -500);

  await h.say("Finish the remaining rows when you have five minutes. It's worth it.", 5000);
  await h.say("Next up: getting your existing records in — Bulk import without duplicates.", 4000);

  return h.finish();
}
