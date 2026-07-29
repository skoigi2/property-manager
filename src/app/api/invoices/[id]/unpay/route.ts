import { requirePermissionWrite, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

// ── POST /api/invoices/[id]/unpay ────────────────────────────────────────────
// Properly reverses an accidental "mark paid": status returns to SENT (or
// OVERDUE when past due), paidAt/paidAmount clear, and the linked IncomeEntry
// rows (invoiceId back-reference — created by the PAID flip or by the income
// page's auto-link) are DELETED so the books don't double-count when the real
// payment is recorded later. Deleting income is why this needs the
// FINANCIAL_DELETE permission (ACCOUNTANT is blocked, like other deletes).
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requirePermissionWrite("FINANCIAL_DELETE");
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const invoice = await prisma.invoice.findUnique({
    where: { id: params.id },
    select: {
      id: true, invoiceNumber: true, status: true, paidAt: true, paidAmount: true, dueDate: true,
      tenant: { select: { unit: { select: { propertyId: true } } } },
      incomeEntries: { select: { id: true, grossAmount: true } },
    },
  });
  if (!invoice) return Response.json({ error: "Not found" }, { status: 404 });
  if (!propertyIds.includes(invoice.tenant.unit.propertyId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (invoice.status !== "PAID") {
    return Response.json({ error: "Only a PAID invoice can be reverted." }, { status: 400 });
  }

  const newStatus = new Date(invoice.dueDate) < new Date() ? "OVERDUE" : "SENT";

  // Array-form $transaction — callback form is pgBouncer-incompatible (see CLAUDE.md).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ops: any[] = [
    prisma.invoice.update({
      where: { id: params.id },
      data: { status: newStatus, paidAt: null, paidAmount: null },
    }),
  ];
  if (invoice.incomeEntries.length > 0) {
    ops.push(prisma.incomeEntry.deleteMany({
      where: { id: { in: invoice.incomeEntries.map((e) => e.id) } },
    }));
  }
  await prisma.$transaction(ops);

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "UPDATE",
    resource: "Invoice",
    resourceId: params.id,
    organizationId: session!.user.organizationId,
    before: {
      status: "PAID",
      paidAt: invoice.paidAt,
      paidAmount: invoice.paidAmount,
      linkedIncomeEntries: invoice.incomeEntries.length,
    },
    after: { status: newStatus, revertedBy: "unpay", incomeEntriesDeleted: invoice.incomeEntries.length },
  });

  return Response.json({
    ok: true,
    status: newStatus,
    incomeEntriesDeleted: invoice.incomeEntries.length,
  });
}
