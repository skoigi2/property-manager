/**
 * Recorder script for `caretaker-inspections`.
 * Subtitle lines are verbatim from docs/tutorials/caretaker-inspections.md.
 * Records as the caretaker of the utilities tutorial's Kenyan org (see
 * seed-caretaker.ts); photos come from fixtures/photos via fake-storage.ts.
 */
import * as path from "path";
import { Harness, BASE_URL } from "./harness";
import { prisma } from "./seed-state";
import { RECORD_PASSWORD } from "./seed-utilities";
import { CARETAKER_EMAIL, MOVE_OUT_TENANT } from "./seed-caretaker";
import { fakeStorage, PHOTO_DIR } from "./fake-storage";

async function settle(h: Harness): Promise<void> {
  await h.pause(600);
  await h.page.waitForFunction(() => document.querySelectorAll(".animate-spin").length === 0, undefined, { timeout: 30000 }).catch(() => {});
  await h.pause(400);
}

const feature = (name: string) => `div.border-b:has(p.font-medium:text-is("${name}"))`;

export async function record() {
  const tenant = await prisma.tenant.findFirst({ where: { name: MOVE_OUT_TENANT, isActive: true }, orderBy: { createdAt: "desc" }, select: { unitId: true } });
  const meters = await prisma.utilityMeter.findMany({
    where: { unitId: tenant!.unitId, role: "UNIT", isActive: true },
    orderBy: [{ utility: "desc" }, { label: "asc" }],
    select: { openingReading: true, readings: { where: { status: { not: "VOID" } }, orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }], take: 1, select: { currentReading: true } } },
  });
  const finals = meters.map((m, i) => {
    const last = Number(m.readings[0]?.currentReading ?? m.openingReading ?? 0);
    return (Math.round((last + (i === 0 ? 3.4 : 61)) * 10) / 10).toString();
  });

  const h = new Harness("caretaker-inspections", { email: CARETAKER_EMAIL, password: RECORD_PASSWORD });
  await h.start();
  await fakeStorage(h.page, prisma, { baseUrl: BASE_URL, uploaderEmail: CARETAKER_EMAIL });

  // Warm-up before markStart() — everything up to it is trimmed (never wrap it in offCamera).
  await h.goto("/inspections");
  await settle(h);
  h.markStart();

  // ── To do ──────────────────────────────────────────────────────────────────
  const row = 'a:has-text("Move-out inspection · Unit 302")';
  await h.hover(row);
  await h.say("Inspections assigned to you are under To do — you also get an email when one is booked.", 5500);
  await h.click(row);
  await h.offCamera("open the inspection", async () => {
    await h.page.getByText("Emergency:").waitFor({ timeout: 60000 });
    await settle(h);
  });
  await h.hover("text=Emergency:");
  await h.say("At the top: the tenant's phone, ID number and emergency contact — what you need on site.", 5500);

  // ── A room ─────────────────────────────────────────────────────────────────
  await h.hover('button:has-text("Kitchen ·")');
  await h.say("Go room by room. A tick means the room is rated and has its three photos.", 5000);
  await h.click('button:has-text("Bathroom ·")');
  await h.pause(500);
  await h.hover(`${feature("Walls")} >> text=At move-in`);
  await h.say("On a move-out, every feature shows how it was at move-in.", 4000);

  for (const f of ["Walls", "Flooring", "Tiles", "Toilet"]) await h.click(`${feature(f)} button:text-is("GOOD")`);
  await h.click(`${feature("Sink/Taps")} button:text-is("POOR")`);
  await h.type(`${feature("Sink/Taps")} input[placeholder="Notes (optional)"]`, "Basin cracked, tap drips");
  await h.upload(`${feature("Sink/Taps")} input[type=file]`, path.join(PHOTO_DIR, "damage.jpg"));
  await h.say("Rate each feature. Something wrong? Mark it, say what, and photograph it.", 5000);
  for (const f of ["Shower/Bath", "Lighting"]) await h.click(`${feature(f)} button:text-is("GOOD")`);
  await h.upload(`${feature("Walls")} input[type=file]`, path.join(PHOTO_DIR, "bathroom.jpg"));
  await h.upload(`${feature("Shower/Bath")} input[type=file]`, path.join(PHOTO_DIR, "bathroom.jpg"));
  await h.pause(1200);
  await h.hover('button:has-text("Bathroom ·")');
  await h.say("At least three photos per room — they protect you and the tenant if there's a dispute.", 5500);

  // ── Sign-off ───────────────────────────────────────────────────────────────
  await h.click('button:text-is("Sign-off")');
  await h.pause(600);
  const readings = h.page.locator('input[placeholder="Reading"]');
  for (let i = 0; i < finals.length; i++) await h.type(`input[placeholder="Reading"] >> nth=${i}`, finals[i]);
  if (await readings.count()) await h.say("Take the final meter readings — the manager's checkout uses them.", 4500);
  await h.click('button[aria-label="One more Main door"]');
  await h.click('button[aria-label="One more Main door"]');
  await h.click('button[aria-label="One more Gate"]');
  await h.say("Count the keys the tenant hands back.", 3000);

  await h.click('button:text-is("Signed")');
  const pad = h.page.locator("canvas").first();
  await pad.scrollIntoViewIfNeeded();
  const box = await pad.boundingBox();
  if (box) {
    const m = h.page.mouse;
    await m.move(box.x + box.width * 0.15, box.y + box.height * 0.6);
    await m.down();
    for (let i = 1; i <= 24; i++) {
      const x = box.x + box.width * (0.15 + (0.7 * i) / 24);
      const y = box.y + box.height * (0.55 + 0.18 * Math.sin(i / 2.2));
      await m.move(x, y, { steps: 2 });
    }
    await m.up();
  }
  await h.click('button:has-text("Save signature")');
  await h.offCamera("save the signature", async () => {
    await h.page.getByText("Sign again").waitFor({ timeout: 30000 }).catch(() => {});
  });
  await h.say("The tenant signs on your phone. Not there, or won't sign? Record that instead and carry on.", 6000);

  await h.hover('button:has-text("Hand in for review")');
  await h.say("Hand it in. Your findings lock — the manager reviews them but can't change what you saw.", 5500);
  await h.click('button:has-text("Hand in for review")');
  await h.offCamera("hand in", async () => {
    await h.page.getByText("Awaiting review").first().waitFor({ timeout: 60000 }).catch(() => {});
    await settle(h);
    await h.page.evaluate(() => window.scrollTo(0, 0));
    await h.pause(300);
  });
  await h.hover("text=Awaiting review");
  await h.say("The manager is emailed, prices any damage and raises the repair jobs.", 4500);
  await h.say("That's an inspection: room by room, photos, sign-off, hand in.", 3500);

  return h.finish();
}
