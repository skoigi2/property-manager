import { requireAuth, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { RenewalStage } from "@prisma/client";
import { z } from "zod";

const renewalSchema = z.object({
  renewalStage:     z.enum(["NONE", "NOTICE_SENT", "TERMS_AGREED", "RENEWED"]),
  proposedRent:     z.number().positive().optional().nullable(),
  proposedLeaseEnd: z.string().optional().nullable(),   // ISO date string
  renewalNotes:     z.string().max(1000).optional().nullable(),
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

  const { renewalStage, proposedRent, proposedLeaseEnd, renewalNotes } = parsed.data;

  // When marking RENEWED: apply proposed values to actual lease fields
  const extraUpdates =
    renewalStage === "RENEWED"
      ? {
          leaseEnd:    proposedLeaseEnd ? new Date(proposedLeaseEnd) : tenant.leaseEnd,
          monthlyRent: proposedRent     ?? tenant.monthlyRent,
        }
      : {};

  // Determine unit status sync
  const unitStatusSync =
    renewalStage === "NOTICE_SENT" ? "UNDER_NOTICE" :
    renewalStage === "RENEWED"     ? "ACTIVE"       : null;

  const [updated] = await prisma.$transaction([
    prisma.tenant.update({
      where: { id: params.id },
      data: {
        renewalStage:     renewalStage as RenewalStage,
        proposedRent:     proposedRent     ?? null,
        proposedLeaseEnd: proposedLeaseEnd ? new Date(proposedLeaseEnd) : null,
        renewalNotes:     renewalNotes     ?? null,
        ...extraUpdates,
      },
      include: { unit: { include: { property: true } } },
    }),
    ...(unitStatusSync
      ? [prisma.unit.update({ where: { id: tenant.unitId }, data: { status: unitStatusSync } })]
      : []),
  ]);

  return Response.json(updated);
}
