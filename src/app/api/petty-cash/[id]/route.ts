import { requireManager, getAccessiblePropertyIds, requireManagerWrite, requirePermissionWrite} from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { pettyCashSchema, pettyCashApproveSchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit";
import { sendNotificationEmail } from "@/lib/email";

/** Property-less rows are org-scoped: another org's row must be untouchable
 *  (legacy null-org rows grandfathered; super-admin — session org null — passes). */
function orgMismatch(rowOrgId: string | null, sessionOrgId: string | null | undefined): boolean {
  return !!rowOrgId && !!sessionOrgId && rowOrgId !== sessionOrgId;
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  // Approve / reject action — gated on the MEMBERSHIP role for the active
  // org, never the global User.role (which stays ADMIN for anyone who
  // founded their own org; an org-ACCOUNTANT must not approve here).
  if (body.action === "approve" || body.action === "reject") {
    const isSuperAdmin = session!.user.role === "ADMIN" && session!.user.organizationId === null;
    const orgRole = session!.user.orgRole;
    if (!isSuperAdmin && orgRole !== "ADMIN" && orgRole !== "MANAGER") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const parsed = pettyCashApproveSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

    if (parsed.data.action === "reject" && !parsed.data.rejectionReason?.trim()) {
      return Response.json({ error: "Rejection reason is required." }, { status: 400 });
    }

    const existing = await prisma.pettyCash.findUnique({ where: { id: params.id } });
    if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

    if (existing.propertyId && !propertyIds.includes(existing.propertyId)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!existing.propertyId && orgMismatch(existing.organizationId, session!.user.organizationId)) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const updateData =
      parsed.data.action === "approve"
        ? {
            status: "APPROVED" as const,
            approvedBy: session!.user.id,
            approvedAt: new Date(),
            approvalNotes: parsed.data.approvalNotes?.trim() || null,
            rejectedAt: null,
            rejectionReason: null,
          }
        : {
            status: "REJECTED" as const,
            rejectedAt: new Date(),
            rejectionReason: parsed.data.rejectionReason!.trim(),
            approvedBy: null,
            approvedAt: null,
            approvalNotes: null,
          };

    // Rejecting a row that mirrors a paid-from-petty-cash expense means the
    // float never paid that bill: revert the expense to UNPAID (line items
    // too) and keep the REJECTED row linked as the trail. Array-form
    // $transaction — callback form is pgBouncer-incompatible.
    const revertExpense = parsed.data.action === "reject" && !!existing.expenseEntryId;
    const [updated] = await prisma.$transaction([
      prisma.pettyCash.update({ where: { id: params.id }, data: updateData }),
      ...(revertExpense
        ? [
            prisma.expenseEntry.update({
              where: { id: existing.expenseEntryId! },
              data: { paidFromPettyCash: false, amountPaid: 0, paymentMethod: null, paymentDate: null },
            }),
            prisma.expenseLineItem.updateMany({
              where: { expenseId: existing.expenseEntryId! },
              data: { amountPaid: 0, paymentStatus: "UNPAID", paymentDate: null },
            }),
          ]
        : []),
    ]);

    await logAudit({
      userId: session!.user.id,
      userEmail: session!.user.email,
      action: "UPDATE",
      resource: "PettyCash",
      resourceId: params.id,
      organizationId: session!.user.organizationId,
      before: { status: existing.status },
      after: { status: updated.status, ...(revertExpense ? { revertedExpenseId: existing.expenseEntryId } : {}) },
    });

    // Tell whoever recorded the expense (typically the caretaker) it was
    // rejected — they cannot see the petty-cash ledger themselves.
    if (revertExpense) {
      void (async () => {
        try {
          const exp = await prisma.expenseEntry.findUnique({
            where: { id: existing.expenseEntryId! },
            select: { description: true, amount: true, createdBy: { select: { email: true, id: true } } },
          });
          const to = exp?.createdBy?.email;
          if (!to || exp?.createdBy?.id === session!.user.id) return;
          await sendNotificationEmail(
            to,
            "Petty cash withdrawal rejected",
            `<p>Your petty-cash withdrawal for <strong>${(exp?.description ?? "an expense").replace(/</g, "&lt;")}</strong> (${exp?.amount}) was rejected: ${parsed.data.rejectionReason!.trim().replace(/</g, "&lt;")}</p><p>The expense is now recorded as unpaid. Edit it to resubmit or record another payment method.</p>`,
          );
        } catch { /* fire-and-forget */ }
      })();
    }

    return Response.json(updated);
  }

  // Regular edit
  const parsed = pettyCashSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { date, propertyId, receiptRef, ...rest } = parsed.data;

  if (propertyId && !propertyIds.includes(propertyId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const before = await prisma.pettyCash.findUnique({
    where: { id: params.id },
    select: { type: true, amount: true, date: true, propertyId: true, status: true, organizationId: true },
  });
  if (!before) return Response.json({ error: "Not found" }, { status: 404 });
  if (before.propertyId && !propertyIds.includes(before.propertyId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!before.propertyId && orgMismatch(before.organizationId, session!.user.organizationId)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  // Re-evaluate approval status if amount or type changed
  let status: "APPROVED" | "PENDING" | undefined = undefined;
  if (rest.type === "OUT" && propertyId && before) {
    const agreement = await prisma.managementAgreement.findUnique({
      where: { propertyId },
      select: { repairAuthorityLimit: true },
    });
    if (agreement) {
      status = rest.amount > agreement.repairAuthorityLimit ? "PENDING" : "APPROVED";
    }
  } else if (rest.type === "IN") {
    status = "APPROVED";
  }

  const updated = await prisma.pettyCash.update({
    where: { id: params.id },
    data: {
      ...rest,
      date: new Date(date),
      propertyId: propertyId ?? null,
      receiptRef: receiptRef?.trim() || null,
      ...(status !== undefined ? { status, approvedBy: null, approvedAt: null, approvalNotes: null, rejectedAt: null, rejectionReason: null } : {}),
    },
  });

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "UPDATE",
    resource: "PettyCash",
    resourceId: params.id,
    organizationId: session!.user.organizationId,
    before,
    after: { type: updated.type, amount: updated.amount, date: updated.date, status: updated.status },
  });

  return Response.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requirePermissionWrite("FINANCIAL_DELETE");
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const before = await prisma.pettyCash.findUnique({
    where: { id: params.id },
    select: { type: true, amount: true, date: true, propertyId: true, organizationId: true },
  });
  if (!before) return Response.json({ error: "Not found" }, { status: 404 });
  if (before.propertyId && !propertyIds.includes(before.propertyId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!before.propertyId && orgMismatch(before.organizationId, session!.user.organizationId)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.pettyCash.delete({ where: { id: params.id } });
  await logAudit({ userId: session!.user.id, userEmail: session!.user.email, action: "DELETE", resource: "PettyCash", resourceId: params.id, organizationId: session!.user.organizationId, before: { type: before.type, amount: before.amount, date: before.date } });
  return Response.json({ success: true });
}
