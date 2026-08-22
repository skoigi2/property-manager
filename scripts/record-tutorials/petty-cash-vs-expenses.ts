/**
 * Recorder script for `petty-cash-vs-expenses`.
 * Subtitle lines are verbatim from docs/tutorials/petty-cash-vs-expenses.md.
 * The opening deliberately performs the classic mistake (manual OUT for
 * spending) so the app's nudge can catch it on camera.
 */
import { Harness } from "./harness";
import { prisma } from "./seed-state";

export async function record() {
  const h = new Harness("petty-cash-vs-expenses");
  await h.start();

  const user = await prisma.user.findUnique({
    where: { email: process.env.RECORD_EMAIL ?? "guide@groundworkpm.com" },
  });
  const access = await prisma.propertyAccess.findFirst({ where: { userId: user!.id } });
  if (access) await h.selectProperty(access.propertyId);

  await h.goto("/petty-cash");
  await h.say("Petty cash is your cash float. In goes the top-up, out go the small payments.", 6000);

  // Wrong way first — on purpose.
  await h.click('button:has-text("Add Entry")');
  await h.say("Here's the mistake everyone makes. Watch what happens when I record spending as a cash out…", 4000);
  await h.select('select[name="type"]', "OUT");
  await h.pause(800);
  await h.hover('text=Recording spending?');
  await h.say("The app stops me: a petty-cash OUT never reaches your P&L. Spending belongs on the Expenses page.", 8000);

  await h.say("So take the exit it offers: Record as expense instead.", 3000);
  await h.click('button:has-text("Record as expense instead")');

  // Lands on /expenses with the form open, petty-cash toggle pre-ticked.
  await h.hover('text=Paid from petty cash');
  await h.say("Same purchase, right place — with \"Paid from petty cash\" ticked, the OUT row is created for me, linked.", 5000);
  await h.select('select[name="category"]', "CONSUMABLES");
  await h.type('input[name="amount"]', "38");
  await h.type('input[name="description"]', "Light bulbs for stairwell");
  await h.click('button:has-text("Save Expense")');
  await h.pause(1500);

  await h.goto("/petty-cash");
  await h.hover('text=From expense');
  await h.say("Back in the ledger: there's the cash out, badged \"From expense\". Books and float both correct.", 6000);

  await h.hover('text=not recorded as an expense');
  await h.say("Old mistakes don't hide. This banner totals every cash out that never became an expense.", 5000);
  await h.click('button:has-text("Show these entries")');
  await h.pause(1000);

  await h.click('button:has-text("convert")');
  await h.say("Each one has a one-click repair: Convert to expense. It creates the paid expense and links it — no doubles.", 5000);
  await h.click('dialog button:has-text("Create expense")');
  await h.pause(2000);

  await h.say("Banner's gone. Every shilling of cash out now shows up in your P&L.", 5000);
  await h.say("Rule of thumb: money moving lives here; money spent lives on Expenses.", 5000);
  await h.say("Next: cases and approvals — how maintenance stops living in WhatsApp.", 4000);

  return h.finish();
}
