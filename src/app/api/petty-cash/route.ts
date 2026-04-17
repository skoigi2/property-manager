import { requireAuth, requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { pettyCashSchema } from "@/lib/validations";
import { calcPettyCashBalance } from "@/lib/calculations";
import { logAudit } from "@/lib/audit";
import { sendNotificationEmail } from "@/lib/email";
import { pettyCashPendingTemplate } from "@/lib/notifications/email-templates";

export async function GET(req: Request) {
  const { error } = await requireAuth();
  if (error) return error;

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
        { propertyId: null },
      ],
    },
    orderBy: { date: "asc" },
  });
  const withBalance = calcPettyCashBalance(entries);

  return Response.json({ entries: withBalance.reverse(), limitsByProperty });
}

export async function POST(req: Request) {
  const { session, error } = await requireManager();
  if (error) return error;

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
  let status: "APPROVED" | "PENDING" = "APPROVED";
  if (rest.type === "OUT" && propertyId) {
    const agreement = await prisma.managementAgreement.findUnique({
      where: { propertyId },
      select: { repairAuthorityLimit: true },
    });
    if (agreement && rest.amount > agreement.repairAuthorityLimit) {
      if (!receiptRef || receiptRef.trim() === "") {
        return Response.json(
          { error: "A receipt or reference number is required for OUT entries above the approval threshold." },
          { status: 400 }
        );
      }
      status = "PENDING";
    }
  }

  const entry = await prisma.pettyCash.create({
    data: {
      ...rest,
      date: new Date(date),
      propertyId: propertyId ?? null,
      receiptRef: receiptRef?.trim() || null,
      status,
    },
  });

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "CREATE",
    resource: "PettyCash",
    resourceId: entry.id,
    after: { type: entry.type, amount: entry.amount, date: entry.date, status: entry.status },
  });

  // Notify managers when entry requires approval
  if (status === "PENDING" && propertyId) {
    try {
      const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { name: true, organizationId: true } });
      if (property) {
        const managers = await prisma.user.findMany({
          where: {
            role: { in: ["ADMIN", "MANAGER"] },
            organizationId: property.organizationId,
            NOT: { id: session!.user.id },
          },
          select: { email: true, name: true },
        });
        const { subject, html } = pettyCashPendingTemplate({
          propertyName: property.name,
          amount: rest.amount,
          description: rest.description,
          receiptRef: receiptRef?.trim() || null,
          submittedBy: session!.user.email ?? "—",
        });
        for (const mgr of managers) {
          if (mgr.email) {
            sendNotificationEmail(mgr.email, subject, html).catch(() => {});
          }
        }
      }
    } catch {
      // Fire-and-forget — don't fail the request if notification fails
    }
  }

  return Response.json(entry, { status: 201 });
}
