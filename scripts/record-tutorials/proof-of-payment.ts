/**
 * Recorder script for `proof-of-payment`.
 * Subtitle lines are verbatim from docs/tutorials/proof-of-payment.md.
 * Opens the tenant portal by token first (tenant's view), then switches to
 * the manager view — the "Check Proof" badge lives on the tenant detail
 * page's Invoices tab (not the global Invoices page).
 */
import * as path from "path";
import { Harness } from "./harness";
import { prisma, FIXTURES_DIR } from "./seed-state";

export async function record() {
  // The same tenant the seed prepared: has a portal token AND an invoice
  // waiting in PENDING_VERIFICATION.
  const tenant = await prisma.tenant.findFirst({
    where: {
      portalToken: { not: null },
      isActive: true,
      invoices: { some: { status: "PENDING_VERIFICATION" } },
    },
    orderBy: { name: "asc" },
  });
  if (!tenant?.portalToken) throw new Error("Run seed-state first — no tenant with a portal token.");
  const screenshot = path.join(FIXTURES_DIR, "mpesa-confirmation.png");

  const h = new Harness("proof-of-payment");
  await h.start();

  // Tenant's view.
  await h.goto(`/portal/${tenant.portalToken}`);
  await h.say("This is what your tenant sees — their portal link, no login needed.", 5000);
  await h.click('button:has-text("Balance")');
  await h.say("They've paid by bank or M-Pesa. Instead of WhatsApping you, they tap \"I've paid this\".", 7000);
  await h.click('button:has-text("I\'ve Paid This")');
  await h.upload('input[type="file"]', screenshot);
  await h.type("textarea", "TFA9K2M1XQ Confirmed. Ksh45,000.00 sent to GROUNDWORK PM");
  await h.say("A screenshot, the confirmation text, or both. Twenty seconds of their time.", 6000);
  await h.click('button:has-text("Submit Proof")');
  await h.say("Submitted. Nothing has touched your books yet — that's the point.", 6000);

  // Manager's view — tenant detail page, Invoices tab.
  await h.goto(`/tenants/${tenant.id}`);
  await h.click('button:has-text("Invoices")');
  await h.say("On your side, the invoice now wears an amber badge: Check Proof. It's waiting on you.", 6000);
  await h.click('text=Check Proof');
  await h.say("Click it and the proof is right there — previewed inline, nothing to download.", 7000);

  await h.say("Text proof sits alongside, copy-ready if you want to check the reference in your bank app.", 7500);

  await h.hover('input[type="number"]');
  await h.say("Confirm the amount and method, then Approve.", 4000);
  await h.click('button:has-text("Mark as Paid")');
  await h.pause(1500);

  await h.say("One click did three things: invoice paid, income entry created, and the proof filed in the tenant's documents.", 8000);
  await h.say("If the proof doesn't add up, Reject sends the invoice back to overdue — and nothing was booked.", 6500);
  await h.say("Next: where cash spending belongs — petty cash vs expenses.", 4000);

  return h.finish();
}
