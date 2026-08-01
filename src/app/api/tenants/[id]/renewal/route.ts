import { requireAuth, getAccessiblePropertyIds, requireAuthWrite } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { RenewalStage } from "@prisma/client";
import { z } from "zod";
import { clearHintsAny } from "@/lib/hints";
import { advanceCase, getWorkflow, getStageByKey } from "@/lib/case-workflows";

// Bridge: the tenant-level renewal pipeline and the LEASE_RENEWAL case workflow
// were previously two disconnected systems — advancing one never moved the
// other. Progress recorded here now mirrors forward onto any open
// LEASE_RENEWAL case for the tenant (forward-only, best-effort, never throws).
const CASE_STAGE_BRIDGE: Partial<Record<RenewalStage, string>> = {
  NOTICE_SENT:  "notice_sent",
  TERMS_AGREED: "terms_agreed",
  RENEWED:      "renewed",
};

async function mirrorOntoRenewalCase(tenantId: string, renewalStage: RenewalStage): Promise<void> {
  const targetKey = CASE_STAGE_BRIDGE[renewalStage];
  if (!targetKey) return;
  try {
    const thread = await prisma.caseThread.findFirst({
      where: {
        caseType: "LEASE_RENEWAL",
        subjectId: tenantId,
        status: { notIn: ["RESOLVED", "CLOSED"] },
      },
      select: { id: true, currentStageIndex: true },
    });
    if (!thread) return;
    const target = getStageByKey(getWorkflow("LEASE_RENEWAL"), targetKey);
    if (!target || target.index <= thread.currentStageIndex) return; // forward-only
    await advanceCase(thread.id, target.index, {
      actorName: "system",
      note: `Mirrored from the tenant renewal pipeline (${renewalStage.replace(/_/g, " ").toLowerCase()})`,
    });
  } catch (e) {
    console.error("[renewal] case bridge failed:", e);
  }
}

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
  const { error } = await requireAuthWrite();
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

  // Array-form $transaction — callback form is pgBouncer-incompatible (see CLAUDE.md).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ops: any[] = [
    prisma.tenant.update({
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
    }),
  ];
  if (unitStatusSync) {
    ops.push(prisma.unit.update({ where: { id: tenant.unitId }, data: { status: unitStatusSync } }));
  }
  if (renewalStage === "RENEWED" && newRent !== tenant.monthlyRent) {
    ops.push(prisma.rentHistory.create({
      data: {
        tenantId:      params.id,
        monthlyRent:   newRent,
        effectiveDate: proposedLeaseEnd ? new Date(proposedLeaseEnd) : new Date(),
        reason:        rentHistoryReason ?? "Annual escalation",
      },
    }));
  }
  const txResults = await prisma.$transaction(ops);
  const updated = txResults[0];

  // Clear lease-expiry hints once tenant is RENEWED
  if (renewalStage === "RENEWED") {
    await clearHintsAny(params.id, ["LEASE_EXPIRY_7D", "LEASE_EXPIRY_30D"]);
  }

  // Mirror the pipeline stage onto any open LEASE_RENEWAL case (after the
  // transaction commits — best-effort, never blocks the response).
  await mirrorOntoRenewalCase(params.id, renewalStage as RenewalStage);

  return Response.json(updated);
}
