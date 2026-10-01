/**
 * Recorder script for `tenant-messages`.
 * Subtitle lines are verbatim from docs/tutorials/tenant-messages.md.
 * Records in the utilities tutorial's Kenyan org (see seed-tenant-messages.ts).
 */
import { Harness } from "./harness";
import { prisma } from "./seed-state";
import { RECORD_PASSWORD, UTILITIES_RECORD_EMAIL } from "./seed-utilities";
import { QUESTION_TENANT, THANKS_TENANT } from "./seed-tenant-messages";

/** Let the page's data load (dev-mode fetches are slow) before narrating over it. */
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
  const faith = await prisma.tenant.findFirst({
    where: { name: QUESTION_TENANT, isActive: true, unit: { propertyId: property.id } },
    select: { id: true },
  });

  const h = new Harness("tenant-messages", { email: UTILITIES_RECORD_EMAIL, password: RECORD_PASSWORD });
  await h.start();
  await h.selectProperty(property.id);

  // Warm the tenant page (cold dev loads take 8–17 s).
  await h.goto(`/tenants/${faith!.id}?tab=messages`);
  await settle(h);

  // ── The Inbox ──────────────────────────────────────────────────────────────
  await h.goto("/inbox");
  await settle(h);
  h.markStart();
  const faithRow = `tr:has-text("Tenant message"):has-text("${QUESTION_TENANT}")`;
  const thanksRow = `tr:has-text("Tenant message"):has-text("Kamau")`;
  await h.hover(`${faithRow} >> nth=0`);
  await h.say("When a tenant writes from their portal, it lands in your Inbox — no need to check each tenant's page.", 6500);
  await h.hover(`${thanksRow} >> text=Waiting 3d`);
  await h.say("It shows how long they've been waiting, and turns urgent after two days without a reply.", 5500);
  await h.hover(`${faithRow} >> text=Water pressure in the kitchen`);
  await h.say("The property's managers also get an email with a link straight to the conversation.", 5500);

  // ── Reply ──────────────────────────────────────────────────────────────────
  await h.click(`${faithRow} button:has-text("Reply")`);
  await h.offCamera("open the conversation", async () => {
    await h.page.getByText("very low pressure since Monday").last().waitFor({ timeout: 60000 });
    await settle(h);
    // Bring the whole conversation and the reply box on screen.
    await h.page.evaluate(() =>
      Array.from(document.querySelectorAll("h2, h3")).find((e) => e.textContent?.trim().startsWith("Portal Messages"))?.scrollIntoView({ block: "start" }),
    );
    await h.pause(400);
  });
  await h.hover("p.text-body.whitespace-pre-wrap >> nth=0");
  await h.say("Reply opens the conversation on the tenant's page.", 3500);

  await h.type('textarea[placeholder="Type your reply..."]', "Thanks Faith — our plumber will come on Thursday after 4 pm.");
  await h.click('button:has-text("Send Reply")');
  await h.offCamera("send the reply", async () => {
    await h.page.getByText("our plumber will come on Thursday").first().waitFor({ timeout: 60000 }).catch(() => {});
    await settle(h);
  });
  await h.say("Answer it here. The tenant sees your reply in their portal, and the message leaves your Inbox.", 6000);

  // ── Mark resolved ──────────────────────────────────────────────────────────
  await h.offCamera("back to the Inbox", async () => {
    await h.goto("/inbox");
    await settle(h);
  });
  await h.hover(`${thanksRow} button:has-text("Mark resolved")`);
  await h.say("No reply needed? Mark resolved closes it. If the tenant writes again, it comes back.", 5000);
  await h.click(`${thanksRow} button:has-text("Mark resolved")`);
  await h.page
    .waitForFunction((name) => !document.body.innerText.includes(`Tenant message — Unit 102, ${name}`), THANKS_TENANT, { timeout: 30000 })
    .catch(() => {});
  await h.pause(800);
  await h.say("Prefer no emails? Switch them off on the Automations page — the Inbox still shows every message.", 5500);
  await h.say("That's tenant messages: in your Inbox, answered in one place.", 3500);

  return h.finish();
}
