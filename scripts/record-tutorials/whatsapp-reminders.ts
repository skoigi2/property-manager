/**
 * Recorder script for `whatsapp-reminders`.
 * Subtitle lines are verbatim from docs/tutorials/whatsapp-reminders.md.
 * Records in the utilities tutorial's Kenyan org (see seed-whatsapp-reminders.ts).
 *
 * window.open is stubbed for the whole recording — no WhatsApp chat ever
 * opens (the demo's phone numbers may belong to real people); the
 * "WhatsApp opened — logged as a send attempt" toast is what shows.
 */
import { BASE_URL, Harness } from "./harness";
import { prisma } from "./seed-state";
import { RECORD_PASSWORD, UTILITIES_RECORD_EMAIL } from "./seed-utilities";
import { NO_PHONE_TENANT, PORTAL_TENANT } from "./seed-whatsapp-reminders";

/** Let the page's data load (dev-mode fetches are slow) before narrating over it. */
async function settle(h: Harness): Promise<void> {
  await h.pause(700);
  await h.page
    .waitForFunction(() => document.querySelectorAll(".animate-spin").length === 0, undefined, { timeout: 30000 })
    .catch(() => {});
  await h.pause(500);
}

/**
 * Show the portal link on the production domain rather than localhost:3000 —
 * display only, like the guide screenshots (the app uses its own origin).
 */
async function showProductionOrigin(h: Harness): Promise<void> {
  await h.page.evaluate(
    ({ from, to }) => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (n.nodeValue?.includes(from)) n.nodeValue = n.nodeValue.split(from).join(to);
      }
    },
    { from: BASE_URL, to: "https://groundworkpm.com" },
  );
}

export async function record() {
  const user = await prisma.user.findUnique({ where: { email: UTILITIES_RECORD_EMAIL } });
  const property = await prisma.property.findFirst({
    where: { organizationId: user!.organizationId!, name: "Kilimani Court" },
    select: { id: true },
  });
  if (!property) throw new Error("Kilimani Court not found in the utilities recording org — did the seed run?");
  const tenantId = async (name: string) =>
    (await prisma.tenant.findFirst({ where: { name, isActive: true, unit: { propertyId: property.id } }, select: { id: true } }))!.id;
  const faithId = await tenantId(PORTAL_TENANT);
  const brianId = await tenantId(NO_PHONE_TENANT);

  const h = new Harness("whatsapp-reminders", { email: UTILITIES_RECORD_EMAIL, password: RECORD_PASSWORD });
  await h.start();
  // Never leave the app for wa.me: every later page load gets the stub.
  await h.page.addInitScript(() => {
    window.open = () => null;
  });
  await h.selectProperty(property.id);

  // Warm the pages the video visits (cold dev loads take 8–17 s).
  await h.goto(`/tenants/${faithId}?tab=comms`);
  await settle(h);
  await h.goto(`/tenants/${brianId}`);
  await settle(h);

  // ── One overdue tenant, from the Inbox ─────────────────────────────────────
  await h.goto("/inbox");
  await settle(h);
  h.markStart();
  const faithRow = `tr:has-text("${PORTAL_TENANT}")`;
  await h.hover(`${faithRow} button:has-text("WhatsApp")`);
  await h.say("Some tenants never read email. Send them a reminder from your own WhatsApp instead.", 5500);

  await h.click(`${faithRow} button:has-text("WhatsApp")`);
  await h.offCamera("load the reminder", async () => {
    await h.page.locator("dialog[open]").getByText("Hi Faith,").first().waitFor({ timeout: 60000 });
    await settle(h);
    await showProductionOrigin(h);
  });
  await h.hover("dialog[open] p.whitespace-pre-wrap");
  await h.say("The reminder is written for you: what they owe, how many days overdue, and a link to their tenant portal.", 6500);

  await h.click('dialog[open] button:has-text("Send via WhatsApp")');
  await h.pause(800);
  await h.say("Tap send and WhatsApp opens with the chat and message ready. You press send there — from your own number, nothing to set up.", 7000);

  // ── Several at once ────────────────────────────────────────────────────────
  const overdue = h.page.locator('tr:has-text("Rent overdue")');
  const n = await overdue.count();
  for (let i = 0; i < n; i++) await h.click(`tr:has-text("Rent overdue") >> nth=${i} >> input[type="checkbox"]`);
  await h.click('button:has-text("Remind on WhatsApp")');
  await h.offCamera("load the selected tenants", async () => {
    await h.page.locator("dialog[open]").getByText("Next:").first().waitFor({ timeout: 60000 });
    await settle(h);
    await showProductionOrigin(h);
  });
  await h.hover('dialog[open] p:has-text("Next:")');
  await h.say("Several tenants at once? Remind on WhatsApp takes you through them one chat at a time.", 6000);

  // Each step: the tenant without a portal link gets "Create portal link & send".
  let narratedLink = false;
  for (let step = 0; step < n; step++) {
    const create = h.page.locator('dialog[open] button:has-text("Create portal link & send")');
    if (await create.count()) {
      await h.hover('dialog[open] button:has-text("Create portal link & send")');
      if (!narratedLink) {
        await h.say("No portal link yet? Create one as you send — it's never made without you.", 5000);
        narratedLink = true;
      }
      await h.offCamera("create the portal link", async () => {
        await h.click('dialog[open] button:has-text("Create portal link & send")');
        await h.page.waitForFunction(
          (s) => !document.querySelector("dialog[open]")?.textContent?.includes(`· ${s} of`),
          String(step + 1),
          { timeout: 60000 },
        ).catch(() => {});
      });
    } else {
      await h.click('dialog[open] button:has-text("Send via WhatsApp")');
    }
    await h.pause(300);
    await showProductionOrigin(h);
    await h.pause(600);
  }
  await h.click('dialog[open] button:has-text("Done")');

  // ── The record ─────────────────────────────────────────────────────────────
  await h.offCamera("open the tenant's Comms tab", async () => {
    await h.goto(`/tenants/${faithId}?tab=comms`);
    await h.page.getByText("Rent reminder (WhatsApp)").first().waitFor({ timeout: 60000 });
    await settle(h);
  });
  await h.hover('p:has-text("Send attempt") >> nth=0');
  await h.say("Every message is logged on the tenant's Comms tab — as a send attempt, because WhatsApp can't tell us it was delivered.", 7500);

  // ── No usable phone ────────────────────────────────────────────────────────
  await h.offCamera("open a tenant without a phone", async () => {
    await h.goto(`/tenants/${brianId}`);
    await settle(h);
  });
  await h.click('button:has-text("WhatsApp")');
  await h.offCamera("load the tenant's details", async () => {
    await h.page.locator("dialog[open]").getByText("No phone number on file").first().waitFor({ timeout: 60000 });
    await settle(h);
    await showProductionOrigin(h);
  });
  await h.hover('dialog[open] button:has-text("Send via WhatsApp")');
  await h.say("No phone number, or no country code? The button stays grey until you add one.", 5500);
  await h.say("That's WhatsApp reminders: written for you, sent from your own phone.", 4000);

  return h.finish();
}
