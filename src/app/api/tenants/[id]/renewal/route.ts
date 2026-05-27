import { requireAuth, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { RenewalStage } from "@prisma/client";
import { z } from "zod";
import { clearHintsAny } from "@/lib/hints";

const renewalSchema = z.object({
  renewalStage:     z.enum(["NONE", "NOTICE_SENT", "TERMS_AGREED", "RENEWED"]),
  proposedRent:     z.number().positive().optional().nullable(),
  proposedLeaseEnd: z.string().optional().nullable(),   // ISO date string
  renewalNotes:     z.string().max(1000).optional().nullable(),
  escalationRate:   z.number().min(0).max(100).optional().nullable(),
  rentHistoryReason: z.string().max(200).optional().nullable(),
});

// ── PATCH /api/tenants/[id]/renewal ──────────────────────────────────────────

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { error } = await requireAuth();
  if (error) return error;

  const accessibleIds = await getAccessiblePropertyIds();
  if (!accessibleIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await prisma.tenant.findUnique({
    where: { id: params.id },
    include: { unit: true },
  });
  if (!tenant || !accessibleIds.includes(tenant.unit.propertyId)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = renewalSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { renewalStage, proposedRent, proposedLeaseEnd, renewalNotes, escalationRate, rentHistoryReason } = parsed.data;

  const newRent = proposedRent ?? tenant.monthlyRent;

  // When marking RENEWED: apply proposed values to actual lease fields
  const extraUpdates =
    renewalStage === "RENEWED"
      ? {
          leaseEnd:    proposedLeaseEnd ? new Date(proposedLeaseEnd) : tenant.leaseEnd,
          monthlyRent: newRent,
        }
      : {};

  // Determine unit status sync
  const unitStatusSync =
    renewalStage === "NOTICE_SENT" ? "UNDER_NOTICE" :
    renewalStage === "RENEWED"     ? "ACTIVE"       : null;

  const updated = await prisma.$transaction(async (tx) => {
    const tenant_updated = await tx.tenant.update({
      where: { id: params.id },
      data: {
        renewalStage:     renewalStage as RenewalStage,
        proposedRent:     proposedRent     ?? null,
        proposedLeaseEnd: proposedLeaseEnd ? new Date(proposedLeaseEnd) : null,
        renewalNotes:     renewalNotes     ?? null,
        ...(escalationRate !== undefined && escalationRate !== null ? { escalationRate } : {}),
        ...extraUpdates,
      },
      include: { unit: { include: { property: true } } },
    });

    if (unitStatusSync) {
      await tx.unit.update({ where: { id: tenant.unitId }, data: { status: unitStatusSync } });
    }

    if (renewalStage === "RENEWED" && newRent !== tenant.monthlyRent) {
      await tx.rentHistory.create({
        data: {
          tenantId:      params.id,
          monthlyRent:   newRent,
          effectiveDate: proposedLeaseEnd ? new Date(proposedLeaseEnd) : new Date(),
          reason:        rentHistoryReason ?? "Annual escalation",
        },
      });
    }

    return tenant_updated;
  });

  // Clear lease-expiry hints once tenant is RENEWED
  if (renewalStage === "RENEWED") {
    await clearHintsAny(params.id, ["LEASE_EXPIRY_7D", "LEASE_EXPIRY_30D"]);
  }

  return Response.json(updated);
}
