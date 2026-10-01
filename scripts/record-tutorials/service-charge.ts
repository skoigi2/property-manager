/**
 * Recorder script for `service-charge`.
 * Subtitle lines are verbatim from docs/tutorials/service-charge.md.
 * Records in the utilities tutorial's Kenyan org (see seed-service-charge.ts):
 * Kilimani Court, last service charge year budgeted and ended, this year empty.
 */
import { Harness } from "./harness";
import { prisma } from "./seed-state";
import { RECORD_PASSWORD, UTILITIES_RECORD_EMAIL } from "./seed-utilities";

/** Let the tab's data load (dev-mode fetches are slow) before narrating over it. */
async function settle(h: Harness): Promise<void> {
  await h.pause(700);
  await h.page
    .waitForFunction(() => document.querySelectorAll(".animate-spin").length === 0, undefined, { timeout: 30000 })
    .catch(() => {});
  await h.pause(500);
}

export async function record() {
  const user = await prisma.user.findUnique({ where: { email: UTILITIES_RECORD_EMAIL } });
  const property = await prisma.property.findFirst({
    where: { organizationId: user!.organizationId!, name: "Kilimani Court" },
    select: { id: true },
  });
  if (!property) throw new Error("Kilimani Court not found in the utilities recording org — did the seed run?");

  const h = new Harness("service-charge", { email: UTILITIES_RECORD_EMAIL, password: RECORD_PASSWORD });
  await h.start();
  await h.selectProperty(property.id);
  await h.page.evaluate(() => window.sessionStorage.setItem("gw:serviceChargeTab", "budget"));

  // ── This year: no budget yet ───────────────────────────────────────────────
  await h.goto("/service-charge");
  await settle(h);
  h.markStart();
  await h.say("Service charge is budgeted one block and one year at a time. This year doesn't have a budget yet.", 5500);

  await h.offCamera("create the budget", async () => {
    await h.click('button:has-text("Start from the")');
    await h.page.locator('button:has-text("Add cost")').waitFor({ state: "visible", timeout: 60000 });
    await settle(h);
  });
  await h.hover('select[aria-label="Cost category"] >> nth=0');
  await h.say("Start from last year's: the same costs come across, and so does the month the year starts.", 6000);

  // ── Add a cost ─────────────────────────────────────────────────────────────
  await h.click('button:has-text("Add cost")');
  await h.select('select[aria-label="Cost category"] >> nth=-1', "ELEVATOR");
  await h.say("Add what's new this year — here, a lift servicing contract — and save.", 2500);
  await h.type('input[aria-label="Budget for Elevator / Lift"]', "120000");
  await h.type('input[placeholder="e.g. 2 guards, 24 h"] >> nth=-1', "Lift servicing contract");
  await h.pause(600);
  await h.offCamera("save the budget", async () => {
    await h.click('button:has-text("Save budget")');
    await h.page.getByText("Budget saved").waitFor({ timeout: 60000 }).catch(() => {});
    await settle(h);
  });

  // ── Unit shares, apply ─────────────────────────────────────────────────────
  // Bring the whole unit table on screen (it sits below the costs).
  await h.page.evaluate(() =>
    Array.from(document.querySelectorAll("h3")).find((e) => e.textContent?.startsWith("Each unit"))?.scrollIntoView({ block: "start", behavior: "smooth" }),
  );
  await h.pause(900);
  await h.hover('h3:has-text("Each unit")');
  await h.say("The total is split by floor area: each unit's share of the budget, and the monthly charge that covers it.", 6000);
  await h.hover('th:has-text("Pays now")');
  await h.say("Amber means the tenant pays less than their share today.", 4000);
  await h.click('button:has-text("Apply to tenants")');
  await h.pause(600);
  await h.click('button:text-is("Apply")');
  await h.offCamera("apply the charge", async () => {
    await h.page.getByText("Monthly service charge updated").waitFor({ timeout: 60000 }).catch(() => {});
    await settle(h);
  });
  await h.say("Apply to tenants sets everyone's monthly service charge to match, from their next invoice.", 5500);

  // ── Last year: budget vs actual ────────────────────────────────────────────
  await h.click('button[aria-label="Previous year"]');
  await settle(h);
  await h.click('button:text-is("Budget vs actual")');
  await settle(h);
  await h.hover('th:has-text("Variance")');
  await h.say("Budget vs actual tracks what's been spent against the budget, cost by cost, all year.", 5500);

  // ── Year-end statement ─────────────────────────────────────────────────────
  await h.click('button:text-is("Year-end statement")');
  await settle(h);
  await h.hover("tbody tr >> nth=0");
  await h.say("When the year ends, each tenant's share of what was actually spent is set against what they were billed.", 6500);
  await h.hover('td:has-text("Landlord (vacant)")');
  await h.say("Days a unit stood empty are the owner's share.", 3500);

  await h.click('input[aria-label="Select all tenants"]');
  await h.offCamera("raise balancing invoices", async () => {
    await h.click('button:has-text("Raise balancing invoices")');
    await h.page.locator('a[href^="/invoices?focus="]').first().waitFor({ timeout: 60000 }).catch(() => {});
    await settle(h);
  });
  await h.hover('a[href^="/invoices?focus="] >> nth=0');
  await h.say("Shortfalls become draft balancing invoices in one click. Credits are listed for you to refund.", 6000);

  await h.click('button:has-text("Publish to portal")');
  await h.offCamera("publish", async () => {
    await h.page.getByText("In the tenant portal since").waitFor({ timeout: 60000 }).catch(() => {});
    await settle(h);
  });
  await h.say("Publish, and each tenant downloads their own statement from the portal — or email it to them.", 5500);
  await h.say("That's service charge: budget, track, settle.", 3500);

  return h.finish();
}
