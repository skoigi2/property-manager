import { requireManagerWrite, requirePropertyAccess } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { voidReadingSchema } from "@/lib/validations";
import { voidReading } from "@/lib/utility-readings";

/**
 * POST /api/utilities/readings/[id]/void { reason } — manager tier. Withdraws
 * a reading; when it is already on an invoice the invoice's utility line and
 * total are reduced in the same transaction (a utilities-only invoice left
 * empty is cancelled). Refused (409) once a payment is recorded against that
 * invoice, and for any reading that is not the meter's latest.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  const reading = await prisma.meterReading.findUnique({
    where: { id: params.id },
    select: {
      id: true, currentReading: true, consumption: true, amount: true, invoiceId: true,
      meter: { select: { propertyId: true, label: true, property: { select: { organizationId: true } } } },
    },
  });
  if (!reading) return Response.json({ error: "Reading not found" }, { status: 404 });
  const access = await requirePropertyAccess(reading.meter.propertyId);
  if (!access.ok) return access.error!;

  const parsed = voidReadingSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "A reason is required" }, { status: 400 });
  }

  const result = await voidReading(params.id, parsed.data.reason, session!);
  if (!result.ok) return Response.json({ error: result.error, code: result.code }, { status: result.status });

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "DELETE",
    resource: "MeterReading",
    resourceId: params.id,
    organizationId: reading.meter.property.organizationId ?? session!.user.organizationId,
    before: { meter: reading.meter.label, currentReading: reading.currentReading, consumption: reading.consumption, amount: reading.amount },
    after: { voided: true, reason: parsed.data.reason, invoice: result.invoice },
  });

  return Response.json({ ok: true, invoice: result.invoice });
}
