/**
 * Recorder script for `tenant-checkout`.
 * Subtitle lines are verbatim from docs/tutorials/tenant-checkout.md.
 * NOTE: this run does NOT click Finalize (finalising would vacate the demo
 * tenant and make re-recording non-idempotent); the finalize + PDF beats are
 * narrated over the hover state instead. Re-seed and record a throwaway
 * tenant if a true finalize shot is ever needed.
 */
import { Harness } from "./harness";
import { prisma } from "./seed-state";

export async function record() {
  const tenant = await prisma.tenant.findFirst({
    where: { isActive: true, checkoutProcess: null, incomeEntries: { some: { type: "DEPOSIT" } } },
    orderBy: { name: "desc" },
  });
  if (!tenant) throw new Error("Run seed-state first — no checkout candidate tenant.");

  const h = new Harness("tenant-checkout");
  await h.start();

  await h.goto(`/tenants/${tenant.id}`);
  await h.hover('button:has-text("Checkout")');
  await h.say("When a tenant gives notice, start here: the Checkout button on their page.", 4000);
  await h.click('button:has-text("Checkout")');

  await h.say("One page replaces the paper form — and the box on the right is the live refund maths.", 7000);

  await h.hover('text=Deposit');
  await h.say("The deposit held and any unpaid rent are pulled in automatically. No hunting through ledgers.", 7000);

  await h.say("Walk the unit, record what you find. Damage here will become a deduction in a moment.", 7000);

  await h.click('button:has-text("Add custom deduction")');
  await h.type('input[placeholder="Description"]', "Repaint scuffed wall");
  await h.type('input[placeholder="Amount"]', "3000");
  await h.say("Add each deduction with its own line and amount — and watch the refund update live.", 7000);

  await h.say("Itemised beats a lump sum: the tenant can see exactly how the number was reached.", 7000);

  await h.say("Keys, utility handover, and how the refund goes out — all on the record.", 6500);

  await h.click('button:has-text("Save Draft")');
  await h.pause(1500);
  await h.say("Save as you go. Nothing is final yet — the checkout stays in progress.", 5500);

  await h.hover('button:has-text("Finalize Checkout")');
  await h.say("Finalising does the close-out in one stroke: tenant vacated, unit vacant, deposit settled.", 7000);
  await h.say("Out comes the statement PDF, ready for both signatures.", 5000);
  await h.say("The record locks read-only. The goodbye is clean, documented, and defensible.", 6000);
  await h.say("That's the full loop — from first tenant to final refund. Browse the rest any time under Settings → Tutorials.", 6500);

  return h.finish();
}
