import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { pettyCashSchema, pettyCashApproveSchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManager();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  // Approve / reject action
  if (body.action === "approve" || body.action === "reject") {
    const role = session!.user.role;
    if (role !== "ADMIN" && role !== "MANAGER") {
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

    const updated = await prisma.pettyCash.update({ where: { id: params.id }, data: updateData });

    await logAudit({
      userId: session!.user.id,
      userEmail: session!.user.email,
      action: "UPDATE",
      resource: "PettyCash",
      resourceId: params.id,
      organizationId: session!.user.organizationId,
      before: { status: existing.status },
      after: { status: updated.status },
    });

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
    select: { type: true, amount: true, date: true, propertyId: true, status: true },
  });

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
  const { session, error } = await requireManager();
  if (error) return error;

  const before = await prisma.pettyCash.findUnique({ where: { id: params.id }, select: { type: true, amount: true, date: true } });
  await prisma.pettyCash.delete({ where: { id: params.id } });
  await logAudit({ userId: session!.user.id, userEmail: session!.user.email, action: "DELETE", resource: "PettyCash", resourceId: params.id, organizationId: session!.user.organizationId, before });
  return Response.json({ success: true });
}
