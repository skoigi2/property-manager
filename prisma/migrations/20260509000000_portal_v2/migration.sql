-- ── Portal v2: proof of payment, payment method, two-way messaging ──
--
-- IMPORTANT: when applying this manually in the Supabase SQL Editor, run the
-- ALTER TYPE statement (Step 1) on its own first, THEN run Step 2. Postgres
-- forbids "ALTER TYPE ... ADD VALUE" inside a transaction block, and the SQL
-- Editor wraps multi-statement input in one. Prisma migrate handles this
-- automatically by committing each statement separately.

-- ── Step 1 (run alone) ────────────────────────────────────────────────────
ALTER TYPE "InvoiceStatus" ADD VALUE 'PENDING_VERIFICATION';

-- ── Step 2 (everything else) ──────────────────────────────────────────────
CREATE TYPE "ProofOfPaymentType" AS ENUM ('FILE', 'TEXT', 'BOTH');
CREATE TYPE "PaymentMethod" AS ENUM ('BANK_TRANSFER', 'MPESA', 'CASH', 'CARD', 'CHEQUE', 'OTHER');
CREATE TYPE "PortalMessageSender" AS ENUM ('TENANT', 'MANAGER');
CREATE TYPE "PortalThreadStatus" AS ENUM ('SENT', 'READ', 'RESOLVED');
CREATE TYPE "PortalMessageCategory" AS ENUM ('LEASE_QUERY', 'PAYMENT_NOTIFICATION', 'PERMISSION_REQUEST', 'GENERAL');

-- Invoice: proof of payment fields
ALTER TABLE "Invoice"
  ADD COLUMN "proofOfPaymentUrl"  TEXT,
  ADD COLUMN "proofOfPaymentText" TEXT,
  ADD COLUMN "proofOfPaymentType" "ProofOfPaymentType",
  ADD COLUMN "proofSubmittedAt"   TIMESTAMP(3);

-- IncomeEntry: payment method
ALTER TABLE "IncomeEntry"
  ADD COLUMN "paymentMethod" "PaymentMethod";

-- PortalMessageThread
CREATE TABLE "PortalMessageThread" (
  "id"            TEXT NOT NULL,
  "tenantId"      TEXT NOT NULL,
  "subject"       TEXT NOT NULL,
  "category"      "PortalMessageCategory" NOT NULL,
  "status"        "PortalThreadStatus" NOT NULL DEFAULT 'SENT',
  "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PortalMessageThread_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PortalMessageThread_tenantId_lastMessageAt_idx"
  ON "PortalMessageThread"("tenantId", "lastMessageAt");
CREATE INDEX "PortalMessageThread_status_idx"
  ON "PortalMessageThread"("status");

ALTER TABLE "PortalMessageThread"
  ADD CONSTRAINT "PortalMessageThread_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PortalMessage
CREATE TABLE "PortalMessage" (
  "id"              TEXT NOT NULL,
  "threadId"        TEXT NOT NULL,
  "body"            TEXT NOT NULL,
  "sender"          "PortalMessageSender" NOT NULL,
  "authorUserId"    TEXT,
  "readByManagerAt" TIMESTAMP(3),
  "readByTenantAt"  TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PortalMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PortalMessage_threadId_createdAt_idx"
  ON "PortalMessage"("threadId", "createdAt");

ALTER TABLE "PortalMessage"
  ADD CONSTRAINT "PortalMessage_threadId_fkey"
  FOREIGN KEY ("threadId") REFERENCES "PortalMessageThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: app uses postgres role (bypasses RLS); deny anon/authenticated direct access.
ALTER TABLE "PortalMessageThread" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PortalMessage"       ENABLE ROW LEVEL SECURITY;
