import { NextRequest } from "next/server";
import { validatePortalToken } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";
import { generateInvoicePdf } from "@/lib/invoice-pdf";

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string; invoiceId: string } }
) {
  const tenant = await validatePortalToken(params.token);
  if (!tenant) {
    return Response.json({ error: "Invalid or expired link" }, { status: 404 });
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: params.invoiceId },
  });

  if (!invoice || invoice.tenantId !== tenant.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const property = tenant.unit.property;
  const orgBase = property.organization;

  // Fetch per-property payment details from ManagementAgreement
  const agreement = await prisma.managementAgreement.findUnique({
    where: { propertyId: property.id },  // ManagementAgreement has unique propertyId
    select: {
      tenantKraPin: true,
      tenantBankName: true, tenantBankAccountName: true, tenantBankAccountNumber: true, tenantBankBranch: true,
      tenantMpesaPaybill: true, tenantMpesaAccountNumber: true, tenantMpesaTill: true, tenantPaymentInstructions: true,
    },
  });

  const org = orgBase ? {
    ...orgBase,
    vatRegistrationNumber: agreement?.tenantKraPin ?? orgBase.vatRegistrationNumber ?? null,
    bankName: agreement?.tenantBankName ?? null,
    bankAccountName: agreement?.tenantBankAccountName ?? null,
    bankAccountNumber: agreement?.tenantBankAccountNumber ?? null,
    bankBranch: agreement?.tenantBankBranch ?? null,
    mpesaPaybill: agreement?.tenantMpesaPaybill ?? null,
    mpesaAccountNumber: agreement?.tenantMpesaAccountNumber ?? null,
    mpesaTill: agreement?.tenantMpesaTill ?? null,
    paymentInstructions: agreement?.tenantPaymentInstructions ?? null,
  } : null;

  // Arrears context: the tenant's OTHER invoices still awaiting payment.
  const outstandingAgg = await prisma.invoice.aggregate({
    where: {
      tenantId: tenant.id,
      id: { not: invoice.id },
      status: { in: ["SENT", "OVERDUE", "PENDING_VERIFICATION"] },
    },
    _sum: { totalAmount: true },
  });

  const buffer = await generateInvoicePdf({
    invoiceNumber: invoice.invoiceNumber,
    periodYear: invoice.periodYear,
    periodMonth: invoice.periodMonth,
    rentAmount: invoice.rentAmount,
    serviceCharge: invoice.serviceCharge,
    otherCharges: invoice.otherCharges,
    totalAmount: invoice.totalAmount,
    dueDate: invoice.dueDate,
    status: invoice.status,
    paidAt: invoice.paidAt,
    paidAmount: invoice.paidAmount,
    notes: invoice.notes,
    currency: property.currency,
    org,
    outstandingBalance: outstandingAgg._sum.totalAmount ?? 0,
    tenant: {
      name: tenant.name,
      email: tenant.email,
      phone: tenant.phone,
      poBox: tenant.poBox,
      leaseStart: tenant.leaseStart,
      leaseEnd: tenant.leaseEnd,
      paymentFrequency: tenant.paymentFrequency,
      unit: {
        unitNumber: tenant.unit.unitNumber,
        type: tenant.unit.type,
        property: {
          name: property.name,
          address: property.address,
          city: property.city,
          logoUrl: property.logoUrl,
        },
      },
    },
  });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${invoice.invoiceNumber}.pdf"`,
    },
  });
}
