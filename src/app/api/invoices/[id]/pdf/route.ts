import "server-only";
import { requireAuth, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { generateInvoicePdf } from "@/lib/invoice-pdf";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAuth();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const invoice = await prisma.invoice.findUnique({
    where: { id: params.id },
    include: {
      tenant: {
        select: {
          id: true, name: true, email: true, phone: true,
          poBox: true, leaseStart: true, leaseEnd: true, paymentFrequency: true,
          unit: {
            select: {
              unitNumber: true, type: true,
              paymentAccount: true,
              property: {
                select: {
                  id: true, name: true, address: true, city: true, logoUrl: true, currency: true,
                  organization: {
                    select: { name: true, logoUrl: true, address: true, phone: true, email: true, vatRegistrationNumber: true },
                  },
                  agreement: {
                    select: {
                      tenantKraPin: true,
                      paymentAccount: true,
                      tenantBankName: true, tenantBankAccountName: true, tenantBankAccountNumber: true, tenantBankBranch: true,
                      tenantMpesaPaybill: true, tenantMpesaAccountNumber: true, tenantMpesaTill: true, tenantPaymentInstructions: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!invoice) return Response.json({ error: "Not found" }, { status: 404 });
  if (!propertyIds.includes(invoice.tenant.unit.property.id)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const orgBase = invoice.tenant.unit.property.organization;
  const agreement = invoice.tenant.unit.property.agreement;
  // Payment details resolve: unit override → property default account →
  // legacy inline agreement fields → organisation branding.
  const account = invoice.tenant.unit.paymentAccount ?? agreement?.paymentAccount ?? null;
  const org = orgBase ? {
    ...orgBase,
    vatRegistrationNumber: agreement?.tenantKraPin ?? orgBase.vatRegistrationNumber ?? null,
    bankName: account ? account.bankName : agreement?.tenantBankName ?? null,
    bankAccountName: account ? account.bankAccountName : agreement?.tenantBankAccountName ?? null,
    bankAccountNumber: account ? account.bankAccountNumber : agreement?.tenantBankAccountNumber ?? null,
    bankBranch: account ? account.bankBranch : agreement?.tenantBankBranch ?? null,
    mpesaPaybill: account ? account.mpesaPaybill : agreement?.tenantMpesaPaybill ?? null,
    mpesaAccountNumber: account ? account.mpesaAccountNumber : agreement?.tenantMpesaAccountNumber ?? null,
    mpesaTill: account ? account.mpesaTill : agreement?.tenantMpesaTill ?? null,
    paymentInstructions: account ? account.paymentInstructions : agreement?.tenantPaymentInstructions ?? null,
  } : null;
  // Arrears context: the tenant's OTHER invoices still awaiting payment.
  const outstandingAgg = await prisma.invoice.aggregate({
    where: {
      tenantId: invoice.tenant.id,
      id: { not: invoice.id },
      status: { in: ["SENT", "OVERDUE", "PENDING_VERIFICATION"] },
    },
    _sum: { totalAmount: true },
  });

  const pdfBuffer = await generateInvoicePdf({
    ...invoice,
    currency: invoice.tenant.unit.property.currency,
    org,
    // Invoicing identity: the paying account's company name/logo/tax IDs
    // override the header when set (invoice issued by a different company).
    issuer: account
      ? {
          name: account.companyName, logoUrl: account.logoUrl,
          kraPin: account.kraPin, vatNumber: account.vatNumber,
          address: account.address, phone: account.phone, email: account.email,
        }
      : null,
    outstandingBalance: outstandingAgg._sum.totalAmount ?? 0,
    tenant: {
      ...invoice.tenant,
      unit: {
        ...invoice.tenant.unit,
        property: {
          ...invoice.tenant.unit.property,
          logoUrl: invoice.tenant.unit.property.logoUrl ?? null,
        },
      },
    },
  });

  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoice.invoiceNumber}.pdf"`,
    },
  });
}
