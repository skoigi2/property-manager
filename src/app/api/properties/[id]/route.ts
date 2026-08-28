// Property deletion runs many deleteMany passes over potentially years of
// data — the platform default timeout can 500 a large property.
export const maxDuration = 60;

import { requirePropertyAccess, requireSuperAdmin } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  category: z.enum(["RESIDENTIAL", "OFFICE", "INDUSTRIAL", "RETAIL", "MIXED_USE", "LAND", "GROUND_LEASE", "COMMERCIAL_SPECIAL_USE", "OTHER"]).nullable().optional(),
  categoryOther: z.string().nullable().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  description: z.string().optional(),
  landlordEntity: z.string().nullable().optional(),
  bankName: z.string().nullable().optional(),
  bankAccountName: z.string().nullable().optional(),
  bankAccountNumber: z.string().nullable().optional(),
  ownerId:   z.string().nullable().optional(),
  managerId: z.string().nullable().optional(),
  managementFeeRate: z.number().nullable().optional(),
  managementFeeFlat: z.number().nullable().optional(),
  serviceChargeDefault: z.number().nullable().optional(),
  currency: z.string().optional(),
  organizationId: z.string().nullable().optional(),
});

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const access = await requirePropertyAccess(params.id);
  if (!access.ok) return access.error!;

  const property = await prisma.property.findUnique({
    where: { id: params.id },
    include: {
      units: { orderBy: { unitNumber: "asc" } },
      owner:   { select: { id: true, name: true, email: true } },
      manager: { select: { id: true, name: true, email: true } },
      propertyAccess: {
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
      },
    },
  });

  if (!property) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(property);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const access = await requirePropertyAccess(params.id);
  if (!access.ok) return access.error!;

  // Membership role for the active org — never the global User.role.
  const isSuperAdmin = session.user.role === "ADMIN" && session.user.organizationId === null;
  const orgRole = session.user.orgRole;
  const isAdminCaller = isSuperAdmin || orgRole === "ADMIN";
  if (!isAdminCaller && orgRole !== "MANAGER") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  // Management-fee configuration is org revenue, not day-to-day ops — admin-only.
  if (!isAdminCaller && ("managementFeeRate" in parsed.data || "managementFeeFlat" in parsed.data)) {
    return Response.json(
      { error: "Management-fee configuration can only be changed by an admin." },
      { status: 403 },
    );
  }

  // Org reassignment: super-admin only, with user cascade
  if (parsed.data.organizationId !== undefined) {
    const { error: saError } = await requireSuperAdmin();
    if (saError) return saError;

    const targetOrgId = parsed.data.organizationId;

    // Load current property org and all users with access
    const existing = await prisma.property.findUnique({
      where: { id: params.id },
      select: {
        organizationId: true,
        propertyAccess: { select: { user: { select: { id: true } } } },
      },
    });
    const sourceOrgId = existing?.organizationId ?? null;
    const accessUserIds = existing?.propertyAccess.map((a) => a.user.id) ?? [];

    // Determine cascade for each PropertyAccess user
    type EligibleUser = { uid: string; removeSourceMembership: boolean; updateActiveOrg: boolean };
    const eligible: EligibleUser[] = [];

    if (targetOrgId && accessUserIds.length > 0) {
      for (const uid of accessUserIds) {
        if (sourceOrgId) {
          const isMember = await prisma.userOrganizationMembership.findUnique({
            where: { userId_organizationId: { userId: uid, organizationId: sourceOrgId } },
          });
          const otherProps = await prisma.propertyAccess.count({
            where: { userId: uid, propertyId: { not: params.id }, property: { organizationId: sourceOrgId } },
          });
          const isOnlySourceProp = otherProps === 0;
          eligible.push({
            uid,
            removeSourceMembership: !!isMember && isOnlySourceProp,
            updateActiveOrg: isOnlySourceProp,
          });
        } else {
          // Property had no org — add user to target org and always update their active org
          eligible.push({
            uid,
            removeSourceMembership: false,
            updateActiveOrg: true,
          });
        }
      }
    }

    // Build array-form transaction (required for pgBouncer compatibility)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txOps: any[] = [
      prisma.property.update({ where: { id: params.id }, data: parsed.data }),
    ];

    if (targetOrgId) {
      for (const { uid, removeSourceMembership, updateActiveOrg } of eligible) {
        txOps.push(
          prisma.userOrganizationMembership.upsert({
            where: { userId_organizationId: { userId: uid, organizationId: targetOrgId } },
            create: { userId: uid, organizationId: targetOrgId },
            update: {},
          })
        );
        if (removeSourceMembership && sourceOrgId) {
          txOps.push(
            prisma.userOrganizationMembership.deleteMany({
              where: { userId: uid, organizationId: sourceOrgId },
            })
          );
        }
        if (updateActiveOrg) {
          txOps.push(
            prisma.user.update({ where: { id: uid }, data: { organizationId: targetOrgId } })
          );
        }
      }
    }

    await prisma.$transaction(txOps);

    const property = await prisma.property.findUnique({ where: { id: params.id } });
    return Response.json(property);
  }

  try {
    const property = await prisma.property.update({
      where: { id: params.id },
      data: parsed.data,
    });
    return Response.json(property);
  } catch (err) {
    console.error("[PATCH /api/properties/[id]] update failed:", err);
    return Response.json(
      { error: "Property update failed", detail: (err as Error).message },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const access = await requirePropertyAccess(params.id);
  if (!access.ok) return access.error!;

  // Fetch property name + demo flag for the gate and audit log
  const property = await prisma.property.findUnique({
    where: { id: params.id },
    select: { name: true, isDemo: true },
  });
  if (!property) return Response.json({ error: "Not found" }, { status: 404 });

  // Deleting a property destroys its whole data tree and changes the billable
  // portfolio — admin-only, judged by the MEMBERSHIP role for the active org.
  // Exception: managers may delete demo-seeded SAMPLE properties (sandbox data).
  const isSuperAdmin = session.user.role === "ADMIN" && session.user.organizationId === null;
  const orgRole = session.user.orgRole;
  const isAdminCaller = isSuperAdmin || orgRole === "ADMIN";
  if (!isAdminCaller && !(orgRole === "MANAGER" && property.isDemo)) {
    return Response.json(
      { error: "Only admins can delete properties. Managers may remove sample/demo properties only." },
      { status: 403 },
    );
  }

  // Transaction: delete orphaned chains in FK-safe order, then the property itself.
  // Note: TenantDocument/Invoice/DepositSettlement/CheckoutProcess/CommunicationLog/
  //       PortalMessageThread cascade when Tenant is deleted.
  //       ExpenseLineItem/ExpenseUnitAllocation/ExpenseDocument/PettyCash(linked) cascade
  //       when ExpenseEntry is deleted; ConditionReportPhoto cascades with ConditionReport.
  //       MaintenanceJob/OwnerInvoice/ArrearsCase/InsurancePolicy/Asset/ManagementAgreement/
  //       BuildingConditionReport/PropertyAccess/CaseThread/TaxConfiguration/
  //       ComplianceCertificate/OwnerPayout all have onDelete:Cascade on the Property relation.
  // FK-Restrict blockers that MUST be cleared before units/property go:
  //   - ConditionReport (required unit + property FKs, nothing cascades it)
  //   - ExpenseUnitAllocation (required unit FK — cleared via deleting the
  //     property-linked expenses BEFORE units, plus an explicit pass for
  //     allocations that belong to portfolio/other-scope expenses)
  try {
    await prisma.$transaction([
      prisma.conditionReport.deleteMany({ where: { propertyId: params.id } }),
      prisma.expenseUnitAllocation.deleteMany({ where: { unit: { propertyId: params.id } } }),
      prisma.incomeEntry.deleteMany({ where: { unit: { propertyId: params.id } } }),
      prisma.managementFeeConfig.deleteMany({ where: { unit: { propertyId: params.id } } }),
      prisma.tenant.deleteMany({ where: { unit: { propertyId: params.id } } }),
      // Before units: also removes unit-scoped rows (propertyId null, unitId set),
      // which previously survived as orphaned property-less expenses.
      prisma.expenseEntry.deleteMany({
        where: { OR: [{ propertyId: params.id }, { unit: { propertyId: params.id } }] },
      }),
      // Unit-linked rows must go BEFORE units — the optional unit FKs SetNull on
      // unit deletion, so a later `unit: { propertyId }` filter matches nothing.
      prisma.recurringExpense.deleteMany({
        where: { OR: [{ propertyId: params.id }, { unit: { propertyId: params.id } }] },
      }),
      prisma.unit.deleteMany({ where: { propertyId: params.id } }),
      prisma.pettyCash.deleteMany({ where: { propertyId: params.id } }),
      prisma.property.delete({ where: { id: params.id } }),
    ]);
  } catch (err) {
    // Surface the real blocker (usually an unhandled FK) instead of an opaque 500.
    console.error("[DELETE /api/properties/[id]] failed:", err);
    return Response.json(
      { error: "Property deletion failed", detail: (err as Error).message },
      { status: 500 },
    );
  }

  await logAudit({
    userId:     session.user.id,
    userEmail:  session.user.email,
    action:     "DELETE",
    resource:   "Property",
    resourceId: params.id,
    organizationId: session.user.organizationId,
    before:     { name: property?.name ?? params.id },
  });

  return new Response(null, { status: 204 });
}
