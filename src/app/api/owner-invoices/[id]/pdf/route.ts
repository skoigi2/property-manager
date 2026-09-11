import { requireAuth, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { generateOwnerInvoicePdf, type OwnerInvoiceData } from "@/lib/owner-invoice-pdf";
import type { OwnerInvoiceLineItem } from "@/lib/validations";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAuth();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const invoice = await prisma.ownerInvoice.findUnique({
    where: { id: params.id },
    include: {
      property: {
        select: {
          id: true, name: true, address: true, city: true, logoUrl: true, currency: true,
          organization: { select: { name: true, logoUrl: true, address: true, phone: true, email: true, vatRegistrationNumber: true } },
          agreement: {
            select: {
              mgmtKraPin: true,
              mgmtPaymentAccount: true,
              mgmtBankName: true, mgmtBankAccountName: true, mgmtBankAccountNumber: true, mgmtBankBranch: true,
              mgmtMpesaPaybill: true, mgmtMpesaAccountNumber: true, mgmtMpesaTill: true, mgmtPaymentInstructions: true,
            },
          },
        },
      },
      owner: { select: { name: true, email: true, phone: true } },
    },
  });

  if (!invoice) return Response.json({ error: "Not found" }, { status: 404 });
  if (!propertyIds.includes(invoice.propertyId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const orgBase = invoice.property.organization;
  const agreement = invoice.property.agreement;
  // Manager billing details: the agreement's payment account wins; the inline
  // mgmt* fields are the legacy fallback for agreements set up before accounts.
  const account = agreement?.mgmtPaymentAccount ?? null;
  const org = orgBase ? {
    ...orgBase,
    vatRegistrationNumber: agreement?.mgmtKraPin ?? account?.kraPin ?? orgBase.vatRegistrationNumber ?? null,
    bankName: account ? account.bankName : agreement?.mgmtBankName ?? null,
    bankAccountName: account ? account.bankAccountName : agreement?.mgmtBankAccountName ?? null,
    bankAccountNumber: account ? account.bankAccountNumber : agreement?.mgmtBankAccountNumber ?? null,
    bankBranch: account ? account.bankBranch : agreement?.mgmtBankBranch ?? null,
    mpesaPaybill: account ? account.mpesaPaybill : agreement?.mgmtMpesaPaybill ?? null,
    mpesaAccountNumber: account ? account.mpesaAccountNumber : agreement?.mgmtMpesaAccountNumber ?? null,
    mpesaTill: account ? account.mpesaTill : agreement?.mgmtMpesaTill ?? null,
    paymentInstructions: agreement?.mgmtPaymentInstructions ?? account?.paymentInstructions ?? null,
  } : null;
  const data: OwnerInvoiceData = {
    ...invoice,
    lineItems: invoice.lineItems as OwnerInvoiceLineItem[],
    currency: invoice.property.currency,
    org,
    property: {
      ...invoice.property,
      logoUrl: invoice.property.logoUrl ?? null,
    },
  };

  const buffer = await generateOwnerInvoicePdf(data);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoice.invoiceNumber}.pdf"`,
    },
  });
}
