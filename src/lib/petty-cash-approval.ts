import { prisma } from "@/lib/prisma";
import { propertyManagerWhere } from "@/lib/manager-recipients";
import { sendNotificationEmail } from "@/lib/email";
import { pettyCashPendingTemplate } from "@/lib/notifications/email-templates";

/**
 * Tell the property's managers that a petty-cash OUT row is waiting for
 * approval. Fire-and-forget: never throws, never fails the caller's request.
 * Shared by POST /api/petty-cash and the expense routes (a caretaker's
 * "paid from petty cash" expense creates a PENDING OUT row).
 */
export async function notifyPettyCashPending(input: {
  propertyId: string;
  amount: number;
  description: string;
  receiptRef: string | null;
  submittedBy: string;
  excludeUserId?: string;
}): Promise<void> {
  try {
    const property = await prisma.property.findUnique({
      where: { id: input.propertyId },
      select: { name: true, organizationId: true },
    });
    if (!property) return;
    if (!property.organizationId) return;
    const managers = await prisma.user.findMany({
      where: {
        ...propertyManagerWhere(input.propertyId, property.organizationId),
        ...(input.excludeUserId ? { NOT: { id: input.excludeUserId } } : {}),
      },
      select: { email: true, name: true },
    });
    const { subject, html } = pettyCashPendingTemplate({
      propertyName: property.name,
      amount: input.amount,
      description: input.description,
      receiptRef: input.receiptRef,
      submittedBy: input.submittedBy,
    });
    for (const mgr of managers) {
      if (!mgr.email) continue;
      try { await sendNotificationEmail(mgr.email, subject, html); } catch { /* one bad address must not block the rest */ }
    }
  } catch {
    // Fire-and-forget — don't fail the request if notification fails
  }
}
