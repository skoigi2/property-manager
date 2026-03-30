import { requirePropertyAccess, requireSuperAdmin } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  category: z.enum(["RESIDENTIAL", "OFFICE", "INDUSTRIAL", "RETAIL", "MIXED_USE", "OTHER"]).nullable().optional(),
  categoryOther: z.string().nullable().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  description: z.string().optional(),
  ownerId:   z.string().nullable().optional(),
  managerId: z.string().nullable().optional(),
  managementFeeRate: z.number().nullable().optional(),
  managementFeeFlat: z.number().nullable().optional(),
  serviceChargeDefault: z.number().nullable().optional(),
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

  if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

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

    // Determine cascade: for each user with PropertyAccess, check other source-org properties
    const usersToProcess = sourceOrgId && targetOrgId
      ? await Promise.all(
          accessUserIds.map(async (uid) => {
            const isMember = await prisma.userOrganizationMembership.findUnique({
              where: { userId_organizationId: { userId: uid, organizationId: sourceOrgId } },
            });
            if (!isMember) return null;
            const otherProps = await prisma.propertyAccess.count({
              where: { userId: uid, propertyId: { not: params.id }, property: { organizationId: sourceOrgId } },
            });
            return { uid, leavesSource: otherProps === 0 };
          })
        )
      : [];

    const eligible = usersToProcess.filter(Boolean) as { uid: string; leavesSource: boolean }[];

    // Run everything in a transaction
    await prisma.$transaction(async (tx) => {
      // Move property
      await tx.property.update({ where: { id: params.id }, data: parsed.data });

      if (targetOrgId) {
        for (const { uid, leavesSource } of eligible) {
          // Add membership in target org
          await tx.userOrganizationMembership.upsert({
            where: { userId_organizationId: { userId: uid, organizationId: targetOrgId } },
            create: { userId: uid, organizationId: targetOrgId },
            update: {},
          });
          if (leavesSource && sourceOrgId) {
            // Remove membership from source org and update active org
            await tx.userOrganizationMembership.deleteMany({
              where: { userId: uid, organizationId: sourceOrgId },
            });
            await tx.user.update({
              where: { id: uid },
              data: { organizationId: targetOrgId },
            });
          }
        }
      }
    });

    const property = await prisma.property.findUnique({ where: { id: params.id } });
    return Response.json(property);
  }

  const property = await prisma.property.update({
    where: { id: params.id },
    data: parsed.data,
  });

  return Response.json(property);
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const access = await requirePropertyAccess(params.id);
  if (!access.ok) return access.error!;

  // Fetch property name for audit log before deletion
  const property = await prisma.property.findUnique({
    where: { id: params.id },
    select: { name: true },
  });

  // Transaction: delete orphaned chains in FK-safe order, then the property itself.
  // Note: TenantDocument/Invoice/DepositSettlement cascade when Tenant is deleted.
  //       ExpenseLineItem/ExpenseUnitAllocation/ExpenseDocument cascade when ExpenseEntry is deleted.
  //       MaintenanceJob/OwnerInvoice/ArrearsCase/InsurancePolicy/Asset/ManagementAgreement/
  //       BuildingConditionReport/PropertyAccess all have onDelete:Cascade on the Property relation.
  await prisma.$transaction([
    prisma.incomeEntry.deleteMany({ where: { unit: { propertyId: params.id } } }),
    prisma.managementFeeConfig.deleteMany({ where: { unit: { propertyId: params.id } } }),
    prisma.tenant.deleteMany({ where: { unit: { propertyId: params.id } } }),
    prisma.unit.deleteMany({ where: { propertyId: params.id } }),
    prisma.expenseEntry.deleteMany({ where: { propertyId: params.id } }),
    prisma.pettyCash.deleteMany({ where: { propertyId: params.id } }),
    prisma.recurringExpense.deleteMany({ where: { propertyId: params.id } }),
    prisma.property.delete({ where: { id: params.id } }),
  ]);

  await logAudit({
    userId:     session.user.id,
    userEmail:  session.user.email,
    action:     "DELETE",
    resource:   "Property",
    resourceId: params.id,
    before:     { name: property?.name ?? params.id },
  });

  return new Response(null, { status: 204 });
}
