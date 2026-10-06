/**
 * Recorder script for `guest-stays`.
 * Subtitle lines are verbatim from docs/tutorials/guest-stays.md.
 * Records as the caretaker of the utilities tutorial's Kenyan org, on the
 * Westlands Suites short-stay block (see seed-caretaker.ts); the ID and room
 * photos come from fixtures/photos via fake-storage.ts.
 */
import * as path from "path";
import { Harness, BASE_URL } from "./harness";
import { prisma } from "./seed-state";
import { RECORD_PASSWORD } from "./seed-utilities";
import { CARETAKER_EMAIL, STAYS_PROPERTY, ARRIVING_GUEST } from "./seed-caretaker";
import { fakeStorage, PHOTO_DIR } from "./fake-storage";

async function settle(h: Harness): Promise<void> {
  await h.pause(600);
  await h.page.waitForFunction(() => document.querySelectorAll(".animate-spin").length === 0, undefined, { timeout: 30000 }).catch(() => {});
  await h.pause(400);
}

const photo = (f: string) => path.join(PHOTO_DIR, f);

export async function record() {
  const property = await prisma.property.findFirst({ where: { name: STAYS_PROPERTY }, orderBy: { createdAt: "desc" }, select: { id: true } });
  if (!property) throw new Error(`${STAYS_PROPERTY} not found — did the seed run?`);
  const now = new Date();
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const stayOn = (unitNumber: string, where: object) =>
    prisma.incomeEntry.findFirst({ where: { type: "AIRBNB", unit: { propertyId: property.id, unitNumber }, ...where }, select: { id: true } });
  const arriving = await stayOn("A1", { checkIn: today });
  const leaving = await stayOn("A2", { checkOut: today });

  const h = new Harness("guest-stays", { email: CARETAKER_EMAIL, password: RECORD_PASSWORD });
  await h.start();
  await fakeStorage(h.page, prisma, { baseUrl: BASE_URL, uploaderEmail: CARETAKER_EMAIL });
  await h.selectProperty(property.id);

  // Warm-up before markStart() — everything up to it is trimmed (never wrap it in offCamera).
  await h.goto(`/stays/${leaving!.id}`);
  await settle(h);
  await h.goto("/stays");
  await settle(h);
  h.markStart();

  // ── Today ──────────────────────────────────────────────────────────────────
  await h.hover('h2:has-text("Arriving")');
  await h.say("Guest stays shows today's short-stay guests — who arrives, who leaves, who is in. No prices, ever.", 6000);
  await h.hover('a:has-text("Unit A2")');
  await h.say("Each card shows the ID, the keys, and after check-out the check and the cleaning.", 5000);

  // ── Arriving: guest, ID, keys ──────────────────────────────────────────────
  await h.click('a:has-text("Unit A1")');
  await h.offCamera("open the stay", async () => {
    await h.page.getByText("Guests and ID").waitFor({ timeout: 60000 });
    await settle(h);
  });
  await h.type('internal:label="Name"s', ARRIVING_GUEST);
  await h.type('internal:label="Phone"s', "+254 722 410 118");
  await h.type('internal:label="ID / passport number"s', "31458207");
  await h.click('button:text-is("Add guest")');
  await h.offCamera("save the guest", async () => {
    await h.page.getByText("No ID").first().waitFor({ timeout: 60000 });
    await settle(h);
  });
  await h.hover('button:has-text("Hand over keys")');
  await h.say("Add the guest. The keys stay locked until the main guest's ID is on file.", 5000);

  await h.hover('button:has-text("Photo of ID")');
  await h.upload("input[type=file][capture]", photo("id-card.jpg"));
  await h.offCamera("upload the ID", async () => {
    await h.page.getByText("ID on file").first().waitFor({ timeout: 60000 });
    await settle(h);
  });
  await h.say("Take a photo of their passport or ID. A manager can waive it, with a reason.", 5000);

  await h.click('button[aria-label="More Gate"]');
  await h.click('button:has-text("Hand over keys")');
  await h.offCamera("hand over the keys", async () => {
    await h.page.getByText("Handed over").first().waitFor({ timeout: 60000 });
    await settle(h);
  });
  await h.hover("text=Handed over");
  await h.say("Pick the keys they get and hand them over — the time and your name are recorded.", 5000);

  // ── Leaving: keys back, post-stay check ────────────────────────────────────
  await h.offCamera("open the departing stay", async () => {
    await h.goto(`/stays/${leaving!.id}`);
    await settle(h);
  });
  await h.click('button:text-is("Keys returned")');
  await h.offCamera("keys back", async () => {
    await h.page.getByText(/^Back /).first().waitFor({ timeout: 60000 });
    await settle(h);
  });
  await h.say("When the guest leaves, mark the keys back, then start the post-stay check.", 4500);
  await h.click('button:has-text("Start the check")');
  await h.offCamera("open the check", async () => {
    await h.page.waitForURL(/\/inspections\//, { timeout: 60000 });
    await h.page.getByText("Post-stay inspection").first().waitFor({ timeout: 60000 });
    await settle(h);
  });
  await h.hover("text=Last stay");
  await h.say("A quick check: each room is fine or damaged, with one photo. 'Last stay' shows how it was left before.", 6500);

  const rooms: { name: string; file: string; damaged?: string }[] = [
    { name: "Living Room", file: "living-room.jpg" },
    { name: "Kitchen", file: "kitchen.jpg" },
    { name: "Bedroom", file: "bedroom.jpg" },
    { name: "Bathroom", file: "damage.jpg", damaged: "Mirror cracked" },
  ];
  for (const r of rooms) {
    await h.click(`button:has-text("${r.name} ·")`);
    await h.pause(300);
    await h.click(`button:text-is("${r.damaged ? "Damaged" : "Fine"}")`);
    if (r.damaged) await h.type('input[placeholder="What is damaged? (required)"]', r.damaged);
    await h.upload("input[type=file]", photo(r.file));
    await h.pause(900);
    if (r.damaged) await h.say("Something broken? Mark it damaged, say what, and photograph it.", 4500);
  }
  await h.click('button:text-is("Finish")');
  await h.pause(500);
  await h.hover('button:has-text("Hand in for review")');
  await h.say("Hand it in. A clean check is simply filed; damage goes straight to the manager.", 5000);
  await h.click('button:has-text("Hand in for review")');
  await h.offCamera("hand in", async () => {
    await h.page.getByText("Awaiting review").first().waitFor({ timeout: 60000 }).catch(() => {});
    await settle(h);
    await h.page.evaluate(() => window.scrollTo(0, 0));
  });

  // ── Cleaner ────────────────────────────────────────────────────────────────
  await h.click('a:has-text("Open the stay")');
  await h.offCamera("back to the stay", async () => {
    await h.page.getByText("Cleaning").first().waitFor({ timeout: 60000 });
    await settle(h);
    await h.page.locator('input[placeholder="Name"]').scrollIntoViewIfNeeded();
  });
  await h.type('input[placeholder="Name"]', "Mary Achieng");
  await h.click('button:has-text("Keys to the cleaner")');
  await h.offCamera("cleaner keys", async () => {
    await h.page.getByText("With Mary Achieng").first().waitFor({ timeout: 60000 });
    await settle(h);
  });
  await h.hover('button:has-text("Keys back from the cleaner")');
  await h.say("Give the keys to the cleaning supervisor, and mark them back when the unit is ready.", 5500);

  // ── Calendar ───────────────────────────────────────────────────────────────
  await h.offCamera("calendar", async () => {
    await h.goto("/stays?view=calendar");
    await settle(h);
  });
  await h.hover('a[href^="/stays/"] >> nth=0');
  await h.say("The calendar shows every short-stay unit's bookings for the month.", 4000);
  await h.say("That's guest stays: ID, keys, check, cleaner — all on your phone.", 3500);

  return h.finish();
}
