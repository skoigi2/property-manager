-- Checkout e-sign: tenant acknowledges the settlement via a typed-name magic
-- link (mirrors the /approve token pattern). Signature renders on the PDF.
ALTER TABLE "CheckoutProcess" ADD COLUMN IF NOT EXISTS "signatureToken" TEXT;
ALTER TABLE "CheckoutProcess" ADD COLUMN IF NOT EXISTS "signatureTokenExpiresAt" TIMESTAMP(3);
ALTER TABLE "CheckoutProcess" ADD COLUMN IF NOT EXISTS "signatureRequestedAt" TIMESTAMP(3);
ALTER TABLE "CheckoutProcess" ADD COLUMN IF NOT EXISTS "tenantSignedName" TEXT;
ALTER TABLE "CheckoutProcess" ADD COLUMN IF NOT EXISTS "tenantSignedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "CheckoutProcess_signatureToken_key" ON "CheckoutProcess"("signatureToken");
