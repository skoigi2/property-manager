/**
 * Recorder script for `invoice-income-link`.
 * Subtitle lines are verbatim from docs/tutorials/invoice-income-link.md.
 */
import { Harness } from "./harness";
import { prisma } from "./seed-state";

export async function record() {
  const h = new Harness("invoice-income-link");
  await h.start();

  const user = await prisma.user.findUnique({
    where: { email: process.env.RECORD_EMAIL ?? "guide@groundworkpm.com" },
  });
  const access = await prisma.propertyAccess.findFirst({ where: { userId: user!.id } });
  if (access) await h.selectProperty(access.propertyId);

  // A SENT invoice whose tenant we'll pay via the income form later.
  const now = new Date();
  const openInvoices = await prisma.invoice.findMany({
    where: {
      status: "SENT",
      periodYear: now.getFullYear(),
      periodMonth: now.getMonth() + 1,
      tenant: { unit: { propertyId: access!.propertyId } },
    },
    include: { tenant: { include: { unit: { include: { property: true } } } } },
    orderBy: { invoiceNumber: "asc" },
  });
  if (openInvoices.length < 2) throw new Error("Need ≥2 SENT invoices — run seed-state.");
  const incomeSide = openInvoices[1];
  const unitLabel = `${incomeSide.tenant.unit.unitNumber} (${incomeSide.tenant.unit.property.name})`;

  await h.goto("/invoices");
  await h.say("Invoices are the bill. The money itself lives on the Income page. They're linked.", 7000);

  // Mark one SENT invoice paid via the row action.
  await h.say("Rent arrived? Mark the invoice paid…", 2500);
  await h.click('tr:has-text("Sent") button[title="Mark as paid"]');
  await h.click('button:has-text("Confirm Paid")');
  await h.pause(1500);

  await h.goto("/income");
  await h.say("…and the income entry writes itself. Same amount, same tenant, same month.", 7000);

  await h.click('button:has-text("All Entries")');
  await h.click('button:has-text("Add Entry")');
  await h.say("It works the other way too. Record the payment as income first…", 4000);
  await h.selectByLabel('select[name="unitId"]', unitLabel);
  await h.type('input[name="grossAmount"]', String(Number(incomeSide.totalAmount)));
  await h.click('button:has-text("Save Entry")');
  await h.pause(1500);

  await h.goto("/invoices");
  await h.say("…and the open invoice for that month flips to paid on its own.", 6000);
  await h.say("One action, both sides. Enter it twice and you'd be double-counting — so don't.", 6000);

  // Bulk actions on the remaining open invoices.
  await h.click('tbody input[type="checkbox"]');
  await h.hover('button:has-text("Email to tenants")');
  await h.say("Month-end: select many invoices at once. Email every PDF, or mark them all paid.", 6500);
  await h.click('div.sticky button:has-text("Mark paid")');
  await h.click('div.fixed button:has-text("Mark paid")');
  await h.pause(1500);
  await h.say("Each one gets its income entry, exactly like the single click.", 5500);

  // Reversal.
  await h.click('tr:has-text("Paid") button[title="Change status"]');
  await h.say("Mistakes happen. On a paid invoice there's exactly one way back: Revert to unpaid.", 5000);
  await h.click('button:has-text("Revert to unpaid")');
  await h.click('button:has-text("Revert"):not(:has-text("unpaid"))');
  await h.pause(1500);
  await h.say("It reopens the invoice and deletes the linked income entry too — books stay clean.", 6000);

  await h.say("Bill with invoices, receive with income, and let the link do the bookkeeping.", 5500);
  await h.say("Next: what happens when the tenant says 'I've paid' — verifying proof of payment.", 4000);

  return h.finish();
}
