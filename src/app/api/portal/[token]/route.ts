import { NextRequest } from "next/server";
import { validatePortalToken } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const tenant = await validatePortalToken(params.token);
  if (!tenant) {
    return Response.json({ error: "Invalid or expired link" }, { status: 404 });
  }

  const invoices = await prisma.invoice.findMany({
    where: { tenantId: tenant.id },
    orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
    take: 12,
    select: {
      id: true,
      invoiceNumber: true,
      periodYear: true,
      periodMonth: true,
      rentAmount: true,
      serviceCharge: true,
      otherCharges: true,
      totalAmount: true,
      dueDate: true,
      status: true,
      paidAt: true,
      paidAmount: true,
    },
  });

  const outstandingBalance = invoices
    .filter((inv) => inv.status === "SENT" || inv.status === "OVERDUE")
    .reduce((sum, inv) => sum + (inv.totalAmount - (inv.paidAmount ?? 0)), 0);

  const property = tenant.unit.property;
  const org = property.organization;

  return Response.json({
    tenant: {
      id: tenant.id,
      name: tenant.name,
      email: tenant.email,
      phone: tenant.phone,
      monthlyRent: tenant.monthlyRent,
      serviceCharge: tenant.serviceCharge,
      leaseStart: tenant.leaseStart,
      leaseEnd: tenant.leaseEnd,
      rentDueDay: tenant.rentDueDay,
      depositAmount: tenant.depositAmount,
    },
    unit: {
      unitNumber: tenant.unit.unitNumber,
      type: tenant.unit.type,
    },
    property: {
      name: property.name,
      address: property.address,
      city: property.city,
      logoUrl: property.logoUrl,
      currency: property.currency,
    },
    organization: org
      ? { name: org.name, logoUrl: org.logoUrl }
      : null,
    invoices,
    outstandingBalance,
  });
}
