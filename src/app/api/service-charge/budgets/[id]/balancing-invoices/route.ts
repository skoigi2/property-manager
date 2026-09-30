import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { allocateInvoiceNumber } from "@/lib/invoice-numbering";
import { authorizeBudget } from "@/lib/service-charge-access";
import { buildServiceChargeView } from "@/lib/service-charge-data";

// Raise a DRAFT balancing-charge invoice for each selected tenant whose share
// of the year's actual cost exceeds what they were billed on account. Only
// once the service charge year has ended; one per tenant per budget (a second
// click skips them). Credits are never invoiced — the manager refunds or
// offsets them.
const bodySchema = z.object({ tenantIds: z.array(z.string()).min(1).max(500) });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await authorizeBudget(params.id, { write: true });
  if (auth.error) return auth.error;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Pick the tenants to invoice" }, { status: 400 });

  const view = await buildServiceChargeView(auth.budget);
  if (!view.statement.yearEnded) {
    return Response.json({ error: `The ${view.period.label} service charge year hasn't ended — balancing charges are raised after it closes.` }, { status: 409 });
  }

  const now = new Date();
  const dueDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14);
  const created: { tenantName: string; invoiceNumber: string; amount: number }[] = [];
  const skipped: { tenantName: string; reason: string }[] = [];

  for (const tenantId of parsed.data.tenantIds) {
    const row = view.statement.rows.find((r) => r.tenantId === tenantId);
    if (!row) {
      skipped.push({ tenantName: tenantId, reason: "Not in this statement" });
      continue;
    }
    if (row.balancingInvoice) {
      skipped.push({ tenantName: row.tenantName, reason: `Already invoiced (${row.balancingInvoice.invoiceNumber})` });
      continue;
    }
    if (row.balance <= 0.005) {
      skipped.push({ tenantName: row.tenantName, reason: row.balance < 0 ? "In credit — refund or offset instead" : "Nothing to charge" });
      continue;
    }
    try {
      const invoiceNumber = await allocateInvoiceNumber(tenantId, now);
      await prisma.invoice.create({
        data: {
          invoiceNumber,
          tenantId,
          periodYear: now.getFullYear(),
          periodMonth: now.getMonth() + 1,
          rentAmount: 0,
          serviceCharge: row.balance,
          otherCharges: 0,
          totalAmount: row.balance,
          dueDate,
          status: "DRAFT",
          notes: `Service charge balancing charge — ${view.period.label} (share ${row.share.toFixed(2)} − billed ${row.billed.toFixed(2)})`,
          serviceChargeBudgetId: params.id,
        },
      });
      created.push({ tenantName: row.tenantName, invoiceNumber, amount: row.balance });
    } catch (e) {
      skipped.push({ tenantName: row.tenantName, reason: e instanceof Error ? e.message : "Could not create the invoice" });
    }
  }

  if (created.length) {
    await logAudit({
      userId: auth.session.user.id,
      userEmail: auth.session.user.email,
      organizationId: auth.budget.organizationId,
      action: "CREATE",
      resource: "ServiceChargeBalancingInvoice",
      resourceId: params.id,
      after: { created },
    });
  }
  return Response.json({ created, skipped });
}
