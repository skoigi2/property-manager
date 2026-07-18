import "server-only";
import { prisma } from "@/lib/prisma";
import type { InvoiceData } from "@/lib/invoice-pdf";

/**
 * Load an invoice and assemble the full InvoiceData payload for the PDF —
 * payment details resolved through unit override → property default account →
 * legacy inline agreement fields → organisation branding, plus the invoicing
 * identity and the tenant's outstanding balance.
 *
 * Shared by GET /api/invoices/[id]/pdf (download) and
 * POST /api/invoices/[id]/send (email to tenant). Callers do their own auth
 * and property-access checks using the returned propertyId.
 */
export async function buildInvoicePdfPayload(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
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
                  organizationId: true,
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

  if (!invoice) return null;

  const orgBase = invoice.tenant.unit.property.organization;
  const agreement = invoice.tenant.unit.property.agreement;
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

  const data: InvoiceData = {
    ...invoice,
    currency: invoice.tenant.unit.property.currency,
    org,
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
  };

  return {
    invoice,
    data,
    propertyId: invoice.tenant.unit.property.id,
    organizationId: invoice.tenant.unit.property.organizationId,
  };
}
