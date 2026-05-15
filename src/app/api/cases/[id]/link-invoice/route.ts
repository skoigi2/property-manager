import { requireManager, requirePropertyAccess } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { linkInvoiceSchema } from "@/lib/validations";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManager();
  if (error) return error;

  const thread = await prisma.caseThread.findUnique({ where: { id: params.id } });
  if (!thread) return Response.json({ error: "Not found" }, { status: 404 });

  const access = await requirePropertyAccess(thread.propertyId);
  if (!access.ok) return access.error!;

  const body = await req.json();
  const parsed = linkInvoiceSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  // Verify invoice's tenant unit is on the same property as the case
  const invoice = await prisma.invoice.findUnique({
    where: { id: parsed.data.invoiceId },
    include: { tenant: { select: { unit: { select: { propertyId: true } } } } },
  });
  if (!invoice) return Response.json({ error: "Invoice not found" }, { status: 404 });
  if (invoice.tenant.unit.propertyId !== thread.propertyId) {
    return Response.json({ error: "Invoice belongs to a different property" }, { status: 400 });
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.invoice.update({
      where: { id: invoice.id },
      data: { caseThreadId: thread.id },
    }),
    prisma.caseEvent.create({
      data: {
        caseThreadId: thread.id,
        kind: "EXTERNAL_UPDATE",
        actorUserId: session!.user.id,
        actorEmail: session!.user.email ?? null,
        actorName: session!.user.name ?? null,
        body: `Invoice ${invoice.invoiceNumber} linked`,
        meta: { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber },
      },
    }),
    prisma.caseThread.update({
      where: { id: thread.id },
      data: { lastActivityAt: now },
    }),
  ]);

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "UPDATE",
    resource: "Invoice",
    resourceId: invoice.id,
    organizationId: thread.organizationId,
    before: { caseThreadId: null },
    after: { caseThreadId: thread.id },
  });

  return Response.json({ ok: true });
}
