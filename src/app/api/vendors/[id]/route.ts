import { requireOpsStaff, requireManagerWrite } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { VENDOR_TRIMMED_SELECT, vendorReadIsTrimmed } from "@/lib/vendor-projection";
import { z } from "zod";
import { VendorCategory } from "@prisma/client";
import { deriveVendorCurrency } from "@/lib/vendor-statement";

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
  // Ops staff incl. CARETAKER — trimmed record only for the on-site role
  // (no spend, no recent expenses, no banking).
  const { session, error } = await requireOpsStaff();
  if (error) return error;

  if (vendorReadIsTrimmed(session!.user.orgRole)) {
    const trimmed = await prisma.vendor.findUnique({
      where: { id: params.id },
      select: { ...VENDOR_TRIMMED_SELECT, organizationId: true },
    });
    if (!trimmed || trimmed.organizationId !== (session!.user.organizationId ?? null)) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    const { organizationId: _o, ...rest } = trimmed;
    return Response.json(rest);
  }

  const vendor = await prisma.vendor.findUnique({
    where: { id: params.id },
    include: {
      ...VENDOR_DETAIL_INCLUDE,
      expenses: {
        select: {
          id: true, date: true, category: true, amount: true, description: true,
          property: { select: { name: true, currency: true } },
          unit: { select: { unitNumber: true, property: { select: { name: true, currency: true } } } },
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

  // Currency for the spend figures — same derivation as the vendor statement
  // (most frequent among the vendor's expense-linked properties; recent 500
  // rows is plenty of signal). Falls back to any property in the vendor's
  // org, then KES.
  const currencyRows = await prisma.expenseEntry.findMany({
    where: { vendorId: params.id },
    select: {
      property: { select: { currency: true } },
      unit: { select: { property: { select: { currency: true } } } },
    },
    orderBy: { date: "desc" },
    take: 500,
  });
  const derived = deriveVendorCurrency(
    currencyRows.map((r) => r.property?.currency ?? r.unit?.property?.currency)
  );
  let currency = derived.currency;
  if (!currency) {
    const fallback = await prisma.property.findFirst({
      where: vendor.organizationId ? { organizationId: vendor.organizationId } : {},
      select: { currency: true },
    });
    currency = fallback?.currency ?? "KES";
  }

  return Response.json({
    ...vendor,
    totalSpend:       agg._sum.amount ?? 0,
    currentYearSpend: yearAgg._sum.amount ?? 0,
    currency,
    mixedCurrencies:  derived.mixedCurrencies,
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { session, error } = await requireManagerWrite();
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

  const before = await prisma.vendor.findUnique({
    where: { id: params.id },
    select: { name: true, category: true, phone: true, email: true, taxId: true, bankDetails: true, isActive: true },
  });

  const updated = await prisma.vendor.update({
    where: { id: params.id },
    data: {
      ...rest,
      ...(email !== undefined ? { email: email || null } : {}),
    },
    include: VENDOR_DETAIL_INCLUDE,
  });

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "UPDATE",
    resource: "Vendor",
    resourceId: params.id,
    organizationId: session!.user.organizationId,
    before,
    after: { name: updated.name, category: updated.category, phone: updated.phone, email: updated.email, taxId: updated.taxId, bankDetails: updated.bankDetails, isActive: updated.isActive },
  });

  return Response.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { session, error } = await requireManagerWrite();
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

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "DELETE",
    resource: "Vendor",
    resourceId: params.id,
    organizationId: session!.user.organizationId,
    before: { id: params.id },
  });
  return Response.json({ success: true });
}
