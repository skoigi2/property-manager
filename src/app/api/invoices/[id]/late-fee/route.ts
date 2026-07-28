import { requireManager, requireManagerWrite, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { calcLateInterest } from "@/lib/calculations";
import { logAudit } from "@/lib/audit";

// ── /api/invoices/[id]/late-fee ──────────────────────────────────────────────
// Manager-triggered late fee on an overdue invoice. The fee uses the property
// agreement's latePaymentInterestRate (annual %) pro-rated by days overdue —
// the same calcLateInterest the Income/Arrears pages already display — and is
// POSTED onto the invoice: lateFeeAmount is set and folded into totalAmount.
// GET returns a preview; POST applies (409 if already applied); DELETE reverses.

const MS_PER_DAY = 86_400_000;

async function loadInvoice(id: string) {
  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      tenant: {
        select: {
          id: true, name: true,
          unit: {
            select: {
              propertyId: true,
              property: { select: { name: true, currency: true, agreement: { select: { latePaymentInterestRate: true } } } },
            },
          },
        },
      },
    },
  });
  if (!invoice) return { error: Response.json({ error: "Not found" }, { status: 404 }) };
  if (!propertyIds.includes(invoice.tenant.unit.propertyId)) {
    return { error: Response.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { invoice };
}

function computeFee(invoice: {
  totalAmount: number; paidAmount: number | null; lateFeeAmount: number;
  dueDate: Date; status: string;
  tenant: { unit: { property: { agreement: { latePaymentInterestRate: number } | null } } };
}) {
  const rate = invoice.tenant.unit.property.agreement?.latePaymentInterestRate ?? 0;
  const daysOverdue = Math.max(0, Math.floor((Date.now() - new Date(invoice.dueDate).getTime()) / MS_PER_DAY));
  // Base = what's still owed excluding any previously-applied fee.
  const base = invoice.totalAmount - invoice.lateFeeAmount - (invoice.paidAmount ?? 0);
  const fee = Math.round(calcLateInterest(Math.max(0, base), rate, daysOverdue) * 100) / 100;
  return { rate, daysOverdue, base, fee };
}

const CHARGEABLE_STATUSES = ["SENT", "OVERDUE", "PENDING_VERIFICATION"];

// GET — preview the fee before applying.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireManager();
  if (error) return error;

  const loaded = await loadInvoice(params.id);
  if ("error" in loaded) return loaded.error!;
  const { invoice } = loaded;

  const { rate, daysOverdue, base, fee } = computeFee(invoice);
  return Response.json({
    eligible:
      CHARGEABLE_STATUSES.includes(invoice.status) &&
      !invoice.lateFeeAppliedAt &&
      daysOverdue > 0 &&
      rate > 0 &&
      fee > 0,
    alreadyApplied: !!invoice.lateFeeAppliedAt,
    appliedAmount: invoice.lateFeeAmount,
    rate,
    daysOverdue,
    outstanding: Math.max(0, base),
    fee,
    currency: invoice.tenant.unit.property.currency,
  });
}

// POST — apply the fee onto the invoice.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  const loaded = await loadInvoice(params.id);
  if ("error" in loaded) return loaded.error!;
  const { invoice } = loaded;

  if (invoice.lateFeeAppliedAt) {
    return Response.json({ error: "A late fee has already been applied to this invoice." }, { status: 409 });
  }
  if (!CHARGEABLE_STATUSES.includes(invoice.status)) {
    return Response.json({ error: `Cannot apply a late fee to a ${invoice.status} invoice.` }, { status: 400 });
  }

  const { rate, daysOverdue, fee } = computeFee(invoice);
  if (daysOverdue <= 0) {
    return Response.json({ error: "This invoice is not past its due date yet." }, { status: 400 });
  }
  if (rate <= 0) {
    return Response.json(
      { error: "No late payment interest rate is set. Configure it under the property's Management Agreement first." },
      { status: 400 },
    );
  }
  if (fee <= 0) {
    return Response.json({ error: "Computed late fee is zero — nothing to apply." }, { status: 400 });
  }

  const updated = await prisma.invoice.update({
    where: { id: params.id },
    data: {
      lateFeeAmount: fee,
      lateFeeAppliedAt: new Date(),
      totalAmount: invoice.totalAmount + fee,
    },
  });

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "UPDATE",
    resource: "Invoice",
    resourceId: params.id,
    organizationId: session!.user.organizationId,
    before: { totalAmount: invoice.totalAmount, lateFeeAmount: invoice.lateFeeAmount },
    after: { totalAmount: updated.totalAmount, lateFeeAmount: fee, rate, daysOverdue },
  });

  return Response.json({ ok: true, fee, totalAmount: updated.totalAmount });
}

// DELETE — remove a previously applied fee.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  const loaded = await loadInvoice(params.id);
  if ("error" in loaded) return loaded.error!;
  const { invoice } = loaded;

  if (!invoice.lateFeeAppliedAt || invoice.lateFeeAmount <= 0) {
    return Response.json({ error: "No late fee has been applied to this invoice." }, { status: 400 });
  }

  const updated = await prisma.invoice.update({
    where: { id: params.id },
    data: {
      lateFeeAmount: 0,
      lateFeeAppliedAt: null,
      totalAmount: Math.max(0, invoice.totalAmount - invoice.lateFeeAmount),
    },
  });

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "UPDATE",
    resource: "Invoice",
    resourceId: params.id,
    organizationId: session!.user.organizationId,
    before: { totalAmount: invoice.totalAmount, lateFeeAmount: invoice.lateFeeAmount },
    after: { totalAmount: updated.totalAmount, lateFeeAmount: 0 },
  });

  return Response.json({ ok: true, totalAmount: updated.totalAmount });
}
