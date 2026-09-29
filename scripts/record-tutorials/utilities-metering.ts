/**
 * Recorder script for `utilities-metering`.
 * Subtitle lines are verbatim from docs/tutorials/utilities-metering.md.
 * Records in its own Kenyan org (see seed-utilities.ts), which the seed resets
 * to a fresh Kilimani Court demo before every run.
 */
import * as path from "path";
import { Harness } from "./harness";
import { FIXTURES_DIR, prisma } from "./seed-state";
import { RECORD_PASSWORD, TYPED_ON_CAMERA, UTILITIES_RECORD_EMAIL } from "./seed-utilities";

/** Let the tab's data load (dev-mode fetches are slow) before narrating over it. */
async function settle(h: Harness): Promise<void> {
  await h.pause(700);
  await h.page
    .waitForFunction(() => document.querySelectorAll(".animate-spin").length === 0, undefined, { timeout: 20000 })
    .catch(() => {});
  await h.pause(500);
}

/** Hover only if the element is there — demo data decides whether e.g. a spike is flagged. */
async function hoverIfPresent(h: Harness, sel: string): Promise<void> {
  if ((await h.page.locator(sel).filter({ visible: true }).count()) > 0) await h.hover(sel);
}

export async function record() {
  const user = await prisma.user.findUnique({ where: { email: UTILITIES_RECORD_EMAIL } });
  const property = await prisma.property.findFirst({
    where: { organizationId: user!.organizationId!, name: "Kilimani Court" },
    select: { id: true },
  });
  if (!property) throw new Error("Kilimani Court not found in the utilities recording org — did the seed run?");
  // The move-out scene: unit 101's tenant — paid up, so the settlement shows a
  // refund with the final water & electricity taken off it.
  const leaver = await prisma.tenant.findFirst({
    where: { isActive: true, unit: { unitNumber: "101", propertyId: property.id } },
    select: { id: true },
  });
  if (!leaver) throw new Error("No active tenant in unit 101 for the move-out scene.");

  const h = new Harness("utilities-metering", { email: UTILITIES_RECORD_EMAIL, password: RECORD_PASSWORD });
  await h.start();
  await h.selectProperty(property.id);
  // Off camera (before markStart): let the dev server compile the checkout
  // page and its API so the move-out scene doesn't open on a spinner.
  await h.goto(`/tenants/${leaver.id}/checkout`);

  // ── Readings: type a few ────────────────────────────────────────────────────
  await h.goto("/utilities?tab=readings");
  await h.pause(800);
  h.markStart();
  await h.say("At month end every water and electricity meter gets read. Here's this month — nothing read yet.", 5500);

  await h.click('button:has-text("By unit")');
  await h.say("Group by unit to follow the caretaker's walk: each door's water and power together, the KPLC bulk meter last.", 6000);

  for (let i = 0; i < TYPED_ON_CAMERA; i++) {
    const input = `input[data-reading-input] >> nth=${i}`;
    const row = h.page.locator(input).locator("xpath=ancestor::tr[1]");
    const previous = Number((await row.locator("td").nth(2).innerText()).replace(/,/g, ""));
    const isWater = (await row.locator("td").nth(1).innerText()).includes("Water");
    await h.type(input, String(Math.round((previous + (isWater ? 5 + i : 142)) * 10) / 10));
    await h.press("Enter");
    if (i === 0) {
      await h.say("At a desk it's a table: type the reading, press Enter, and you're on the next meter. Usage appears as you type.", 6000);
    }
  }
  await h.pause(600);

  await h.click(`button:has-text("Save ${TYPED_ON_CAMERA} readings")`);
  await h.say("Save them in one go. On a phone, the caretaker snaps each dial — the app reads the photo and flags a number that doesn't match.", 6500);
  await h.say("No signal in the meter room? Readings wait on the phone and send themselves once it's back.", 5000);

  // ── Readings: import the rest ───────────────────────────────────────────────
  await h.hover('button:has-text("Download sheet")');
  await h.say("Readings on paper? Download sheet gives this month's meters in walking order, with last month's numbers.", 5500);

  await h.click('button:has-text("Import readings")');
  await h.pause(600);
  await h.upload("dialog input[type=file]", path.join(FIXTURES_DIR, "utilities-readings.xlsx"));
  await h.pause(1000);
  await hoverIfPresent(h, "dialog tbody tr >> nth=2");
  await h.say("Fill in the Current reading column and import it. Every row is matched to its meter and previewed first.", 6500);

  await h.click('dialog button:has-text("Import")');
  await h.say("Imported readings arrive as Submitted, waiting for a manager's approval.", 4500);
  // The dev server saves 19 readings slowly (a cold one compiles the route too).
  await h.offCamera("import finishing", () =>
    h.page.locator('dialog button:has-text("Done")').waitFor({ state: "visible", timeout: 120000 }),
  );
  await h.click('dialog button:has-text("Done")');
  await h.pause(1200);

  // ── Review & bill (last month) ──────────────────────────────────────────────
  await h.click('button:has-text("Review & bill")');
  await h.click('button[aria-label="Previous month"]');
  await settle(h);
  // The two units still awaiting approval sit below the billed rows — go to them.
  await hoverIfPresent(h, 'td >> text="Awaiting approval"');
  await h.say("On Review & bill the manager checks last month's readings, and any photos, before approving them.", 6000);
  await hoverIfPresent(h, "text=/More than 2\\.5×/");
  await h.say("Unusual jumps are flagged — worth a second look before you approve.", 4000);

  await h.click('button:has-text("Select all")');
  await h.click('button:has-text("Approve")');
  await settle(h);
  await h.say("Approving fixes the rate and the charge for each reading.", 4000);

  await h.click('button:has-text("Bill onto")');
  await settle(h);
  // The rows now carry their invoice number; the unit whose rent was already
  // paid got a separate utilities invoice.
  await hoverIfPresent(h, "td >> text=/^On INV-/");
  await h.say("Then bill: readings go onto next month's rent invoice — or a separate utilities invoice if that one's already paid.", 6500);

  // ── Paid & unpaid ───────────────────────────────────────────────────────────
  await h.click('button:has-text("Paid & unpaid")');
  await settle(h);
  await h.say("Paid & unpaid is the chase list: per tenant, water and electricity billed, paid and still owing.", 5500);
  await hoverIfPresent(h, 'button:has-text("Select everyone owing")');
  await h.say("Tick who owes and email reminders — or export to Excel or PDF.", 4500);

  // ── Reconciliation ──────────────────────────────────────────────────────────
  await h.click('button:has-text("Reconciliation")');
  await settle(h);
  await hoverIfPresent(h, 'text=/Borehole surplus to owner/');
  await hoverIfPresent(h, 'th:has-text("Surplus to owner")');
  await h.say("Reconciliation shows where the money goes. Water: what tenants paid against the council bill — the borehole surplus goes to the owner.", 7500);
  await hoverIfPresent(h, 'th:has-text("KPLC bulk meter")');
  await h.say("Power: the KPLC bulk meter against units billed, vacant units and common areas, so losses show up.", 6500);

  // ── Move-out ────────────────────────────────────────────────────────────────
  await h.offCamera("checkout page load", async () => {
    await h.goto(`/tenants/${leaver.id}/checkout`);
    await h.page.locator('h3:has-text("Final Meter Readings")').scrollIntoViewIfNeeded();
  });
  await h.hover('h3:has-text("Final Meter Readings")');
  await h.say("When a tenant moves out, the checkout takes a final reading for each of their meters.", 5000);
  for (const label of ["Electricity", "Water"]) {
    const input = `input[aria-label="Final reading, ${label}"]`;
    const previous = Number((await h.page.locator(input).locator("xpath=ancestor::tr[1]").locator("td").nth(1).innerText()).replace(/,/g, ""));
    await h.type(input, String(previous + (label === "Water" ? 3 : 55)));
  }
  await h.pause(600);
  await hoverIfPresent(h, 'span:has-text("Total KSh")');
  await h.say("The final bill — plus any reading not invoiced yet — is worked out on the spot.", 5000);
  await hoverIfPresent(h, 'aside >> text=Water & Electricity');
  await h.say("It comes straight off the deposit: finalise, and the last invoice is raised and paid from it.", 6000);

  await h.say("Tenants see their readings and what they owe in their portal, so nobody has to call to ask.", 5000);
  await h.say("That's metering: read, approve, bill, chase.", 3500);

  return h.finish();
}
