-- Per-tenant switch: print the issuer's VAT No. (from the payment account) on
-- this tenant's invoices. Default on so existing invoices are unchanged.
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "showVatOnInvoice" BOOLEAN NOT NULL DEFAULT true;
