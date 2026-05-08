import "server-only";
import { requireAuth, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { generateCheckoutPdf } from "@/lib/checkout-pdf";

export const maxDuration = 30;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAuth();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const process = await prisma.checkoutProcess.findUnique({
    where: { id: params.id },
    include: {
      deductions: true,
      tenant: true,
      unit: true,
      property: { include: { organization: true } },
    },
  });

  if (!process) return Response.json({ error: "Not found" }, { status: 404 });
  if (!propertyIds.includes(process.propertyId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const orgRecord = process.property.organization;

  const utilityTransfers = (process.utilityTransfers as Record<string, { done?: boolean; date?: string | null }> | null) ?? null;
  const keysReturned = (process.keysReturned as Record<string, number> | null) ?? null;
  const refundDetails = (process.refundDetails as Record<string, string> | null) ?? null;

  const pdfBuffer = await generateCheckoutPdf({
    org: {
      name: orgRecord?.name ?? process.property.name,
      logoUrl: orgRecord?.logoUrl ?? process.property.logoUrl ?? null,
      address: orgRecord?.address ?? process.property.address ?? null,
    },
    property: {
      name: process.property.name,
      address: process.property.address,
      currency: process.property.currency,
    },
    tenant: {
      name: process.tenant.name,
      phone: process.tenant.phone,
      leaseStart: process.tenant.leaseStart,
      leaseEnd: process.tenant.leaseEnd,
      monthlyRent: process.tenant.monthlyRent,
      depositAmount: process.tenant.depositAmount,
    },
    unit: { unitNumber: process.unit.unitNumber },
    checkout: {
      checkOutDate: process.checkOutDate,
      damageFound: process.damageFound,
      inventoryDamageAmount: process.inventoryDamageAmount,
      inventoryDamageNotes: process.inventoryDamageNotes,
      rentBalanceOwing: process.rentBalanceOwing,
      deductions: process.deductions.map((d) => ({ description: d.description, amount: d.amount })),
      totalDeductions: process.totalDeductions,
      balanceToRefund: process.balanceToRefund,
      keysReturned,
      utilityTransfers,
      refundMethod: process.refundMethod,
      refundDetails,
      notes: process.notes,
    },
  });

  // Mark generated (best-effort)
  if (!process.pdfGeneratedAt) {
    await prisma.checkoutProcess.update({
      where: { id: process.id },
      data: { pdfGeneratedAt: new Date() },
    }).catch(() => {});
  }

  const filename = `checkout-${process.tenant.name.replace(/\s+/g, "_")}-${process.unit.unitNumber}.pdf`;

  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
