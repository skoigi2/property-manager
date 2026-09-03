import { requireAuth, requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { requireActiveSubscription } from "@/lib/subscription";
import { prisma } from "@/lib/prisma";
import { pettyCashSchema } from "@/lib/validations";
import { calcPettyCashBalance } from "@/lib/calculations";
import { logAudit } from "@/lib/audit";
import { resolvePettyCashOutStatus } from "@/lib/petty-cash-status";
import { notifyPettyCashPending } from "@/lib/petty-cash-approval";

export async function GET(req: Request) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const sessionOrgId = session!.user.organizationId ?? null;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const propertyIdParam = searchParams.get("propertyId");
  const effectiveIds =
    propertyIdParam && propertyIds.includes(propertyIdParam)
      ? [propertyIdParam]
      : propertyIds;

  // Also fetch the repair authority limit for accessible properties
  const agreements = await prisma.managementAgreement.findMany({
    where: { propertyId: { in: effectiveIds } },
    select: { propertyId: true, repairAuthorityLimit: true },
  });
  const limitsByProperty: Record<string, number> = {};
  for (const a of agreements) {
    limitsByProperty[a.propertyId] = a.repairAuthorityLimit;
  }

  const entries = await prisma.pettyCash.findMany({
    where: {
      OR: [
        { propertyId: { in: effectiveIds } },
        // Property-less rows are org-scoped via organizationId (stamped on
        // create; legacy null-org rows grandfathered as visible; super-admin —
        // session org null — sees all).
        {
          AND: [
            { propertyId: null },
            ...(sessionOrgId ? [{ OR: [{ organizationId: sessionOrgId }, { organizationId: null }] }] : []),
          ],
        },
      ],
    },
    // Linked expense (when this OUT row mirrors a paid-from-petty-cash
    // expense) — drives the "From expense" badge on the ledger, and tells the
    // float holder who submitted a PENDING row (createdBy).
    include: {
      expenseEntry: {
        select: { id: true, description: true, category: true, createdBy: { select: { id: true, name: true, email: true } } },
      },
    },
    orderBy: { date: "asc" },
  });
  const withBalance = calcPettyCashBalance(entries);

  return Response.json({ entries: withBalance.reverse(), limitsByProperty });
}

export async function POST(req: Request) {
  const { session, error } = await requireManager();
  if (error) return error;
  const locked = await requireActiveSubscription(session!.user.organizationId);
  if (locked) return locked;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = pettyCashSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { date, propertyId, receiptRef, ...rest } = parsed.data;

  if (propertyId && !propertyIds.includes(propertyId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Determine approval status based on ManagementAgreement threshold
  // (shared rule in src/lib/petty-cash-status.ts).
  let status: "APPROVED" | "PENDING" = "APPROVED";
  if (rest.type === "OUT" && propertyId) {
    const agreement = await prisma.managementAgreement.findUnique({
      where: { propertyId },
      select: { repairAuthorityLimit: true },
    });
    status = resolvePettyCashOutStatus({
      orgRole: session!.user.orgRole,
      amount: rest.amount,
      repairAuthorityLimit: agreement?.repairAuthorityLimit ?? null,
    });
    if (status === "PENDING" && agreement && rest.amount > agreement.repairAuthorityLimit && (!receiptRef || receiptRef.trim() === "")) {
      return Response.json(
        { error: "A receipt or reference number is required for OUT entries above the approval threshold." },
        { status: 400 }
      );
    }
  }

  const entry = await prisma.pettyCash.create({
    data: {
      ...rest,
      date: new Date(date),
      propertyId: propertyId ?? null,
      receiptRef: receiptRef?.trim() || null,
      status,
      organizationId: session!.user.organizationId ?? null,
    },
  });

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "CREATE",
    resource: "PettyCash",
    resourceId: entry.id,
    organizationId: session!.user.organizationId,
    after: { type: entry.type, amount: entry.amount, date: entry.date, status: entry.status },
  });

  // Notify managers when entry requires approval
  if (status === "PENDING" && propertyId) {
    void notifyPettyCashPending({
      propertyId,
      amount: rest.amount,
      description: rest.description,
      receiptRef: receiptRef?.trim() || null,
      submittedBy: session!.user.email ?? "—",
      excludeUserId: session!.user.id,
    });
  }

  return Response.json(entry, { status: 201 });
}
