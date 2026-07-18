-- Payment accounts become full invoicing identities: invoices paid into an
-- account can be issued by a different company, so the account carries its
-- own company name, logo, PIN No. and VAT No. which override the invoice
-- header when set.

ALTER TABLE "PaymentAccount" ADD COLUMN "companyName" TEXT;
ALTER TABLE "PaymentAccount" ADD COLUMN "logoUrl" TEXT;
ALTER TABLE "PaymentAccount" ADD COLUMN "kraPin" TEXT;
ALTER TABLE "PaymentAccount" ADD COLUMN "vatNumber" TEXT;
