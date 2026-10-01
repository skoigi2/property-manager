/**
 * Recorder script for `rent-increases`.
 * Subtitle lines are verbatim from docs/tutorials/rent-increases.md.
 * Records in the utilities tutorial's Kenyan org (see seed-rent-increases.ts):
 * unit 102's lease is 5% a year with its review a few months out and the
 * Inbox reminder already raised. The notice is never emailed on camera (the
 * demo tenant's address may be real) — the buttons are only pointed at.
 */
import { Harness } from "./harness";
import { prisma } from "./seed-state";
import { RECORD_PASSWORD, UTILITIES_RECORD_EMAIL } from "./seed-utilities";
import { REVIEW_UNIT } from "./seed-rent-increases";

async function settle(h: Harness): Promise<void> {
  await h.pause(700);
  await h.page
    .waitForFunction(() => document.querySelectorAll(".animate-spin").length === 0, undefined, { timeout: 30000 })
    .catch(() => {});
  await h.pause(500);
}

export async function record() {
  const user = await prisma.user.findUnique({ where: { email: UTILITIES_RECORD_EMAIL } });
  const tenant = await prisma.tenant.findFirst({
    where: { isActive: true, unit: { unitNumber: REVIEW_UNIT, property: { organizationId: user!.organizationId!, name: "Kilimani Court" } } },
    select: { id: true },
  });
  if (!tenant) throw new Error("No reviewed tenant — did the seed run?");

  const h = new Harness("rent-increases", { email: UTILITIES_RECORD_EMAIL, password: RECORD_PASSWORD });
  await h.start();
  // Off camera: compile the tenant page so the click lands on a loaded card.
  await h.goto(`/tenants/${tenant.id}?tab=history`);

  // ── Inbox: the reminder ────────────────────────────────────────────────────
  await h.goto("/inbox");
  await settle(h);
  h.markStart();
  await h.hover('text="Rent increase due — Grace & Daniel Kamau"');
  await h.say("A lease with a rent review clause reminds you in the Inbox a month before the notice deadline.", 6000);
  await h.say("It shows the review date, today's rent and the new one, and when the notice must go out.", 5500);

  // ── The rent review card ───────────────────────────────────────────────────
  await h.offCamera("open the tenant", async () => {
    await h.click('button:has-text("Review increase")');
    await h.page.locator('input[aria-label="New monthly rent"]').waitFor({ timeout: 60000 });
    await settle(h);
  });
  await h.hover('p:text-is("Rent review")');
  await h.say("Review increase opens the tenant's rent review: the lease's terms, the next review, and the deadline for notice.", 6500);
  await h.hover('input[aria-label="New monthly rent"]');
  await h.say("The new rent is worked out from the lease — 5% a year here — and you can adjust it.", 5500);
  await h.hover('input[aria-label="Increase effective from"]');
  await h.say("It starts on the review date. If the deadline has already passed, it moves to the first month with full notice — never backdated.", 7000);

  // ── Schedule ───────────────────────────────────────────────────────────────
  await h.click('button:has-text("Schedule increase")');
  await h.offCamera("schedule", async () => {
    await h.page.locator('a:has-text("Notice")').first().waitFor({ timeout: 60000 });
    await settle(h);
  });
  await h.hover("span:text-is(\"Scheduled\")");
  await h.say("Scheduled. Invoices from that month bill the new rent, and the tenant's rent switches by itself on the day.", 6500);
  await h.hover('a:has-text("Notice")');
  await h.say("Download the notice letter to print, or email it — the PDF goes with it and the email is logged on the tenant's Comms tab.", 7000);

  // ── Where the terms live ───────────────────────────────────────────────────
  await h.click('button:text-is("Edit")');
  await h.page.locator('select[name="escalationType"]').waitFor({ timeout: 30000 });
  await h.pause(600);
  await h.hover('select[name="escalationType"]');
  await h.say("The terms are set on the tenant: a percentage or a fixed amount, how often, the first review and the notice period.", 7000);
  await h.press("Escape");
  await h.pause(600);
  if (await h.page.locator('select[name="escalationType"]').isVisible().catch(() => false)) {
    await h.click('button:text-is("Cancel")');
    await h.pause(600);
  }

  await h.say("Skipping a review? Record no increase, and the next reminder is for the following year.", 5000);
  await h.say("That's rent increases: reminded, scheduled, notified — and never missed.", 4000);

  return h.finish();
}
