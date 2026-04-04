import { requireManager } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { VendorCategory } from "@prisma/client";

const patchSchema = z.object({
  name:        z.string().min(1).optional(),
  category:    z.nativeEnum(VendorCategory).optional(),
  phone:       z.string().optional().nullable(),
  email:       z.string().email("Invalid email").optional().nullable().or(z.literal("")),
  taxId:       z.string().optional().nullable(),
  bankDetails: z.string().optional().nullable(),
  notes:       z.string().optional().nullable(),
  isActive:    z.boolean().optional(),
});

const VENDOR_DETAIL_INCLUDE = {
  _count: {
    select: {
      expenses: true,
      maintenanceJobs: true,
      assetLogs: true,
      recurringExpenses: true,
      assets: true,
    },
  },
};

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { session, error } = await requireManager();
  if (error) return error;

  const vendor = await prisma.vendor.findUnique({
    where: { id: params.id },
    include: {
      ...VENDOR_DETAIL_INCLUDE,
      expenses: {
        select: {
          id: true, date: true, category: true, amount: true, description: true,
          property: { select: { name: true } },
          unit: { select: { unitNumber: true } },
        },
        orderBy: { date: "desc" },
        take: 10,
      },
      maintenanceJobs: {
        select: {
          id: true, title: true, status: true, createdAt: true,
          property: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });

  if (!vendor) return Response.json({ error: "Not found" }, { status: 404 });
  if (vendor.organizationId !== (session!.user.organizationId ?? null)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Total spend
  const agg = await prisma.expenseEntry.aggregate({
    where: { vendorId: params.id },
    _sum: { amount: true },
  });

  const currentYear = new Date().getFullYear();
  const yearAgg = await prisma.expenseEntry.aggregate({
    where: {
      vendorId: params.id,
      date: { gte: new Date(`${currentYear}-01-01`) },
    },
    _sum: { amount: true },
  });

  return Response.json({
    ...vendor,
    totalSpend:       agg._sum.amount ?? 0,
    currentYearSpend: yearAgg._sum.amount ?? 0,
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { session, error } = await requireManager();
  if (error) return error;

  const vendor = await prisma.vendor.findUnique({
    where: { id: params.id },
    select: { organizationId: true },
  });
  if (!vendor) return Response.json({ error: "Not found" }, { status: 404 });
  if (vendor.organizationId !== (session!.user.organizationId ?? null)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { email, ...rest } = parsed.data;

  const updated = await prisma.vendor.update({
    where: { id: params.id },
    data: {
      ...rest,
      ...(email !== undefined ? { email: email || null } : {}),
    },
    include: VENDOR_DETAIL_INCLUDE,
  });

  return Response.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { session, error } = await requireManager();
  if (error) return error;

  const vendor = await prisma.vendor.findUnique({
    where: { id: params.id },
    select: {
      organizationId: true,
      _count: {
        select: {
          expenses: true,
          maintenanceJobs: true,
          assetLogs: true,
          recurringExpenses: true,
          assets: true,
        },
      },
    },
  });
  if (!vendor) return Response.json({ error: "Not found" }, { status: 404 });
  if (vendor.organizationId !== (session!.user.organizationId ?? null)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const linkedCount =
    vendor._count.expenses +
    vendor._count.maintenanceJobs +
    vendor._count.assetLogs +
    vendor._count.recurringExpenses +
    vendor._count.assets;

  if (linkedCount > 0) {
    return Response.json(
      { error: "Vendor has linked records. Deactivate instead of deleting.", linkedCount },
      { status: 409 }
    );
  }

  await prisma.vendor.delete({ where: { id: params.id } });
  return Response.json({ success: true });
}
