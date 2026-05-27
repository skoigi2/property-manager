-- ── Portal v2: proof of payment, payment method, two-way messaging ──
--
-- IMPORTANT: when applying this manually in the Supabase SQL Editor, run the
-- ALTER TYPE statement (Step 1) on its own first, THEN run Step 2. Postgres
-- forbids "ALTER TYPE ... ADD VALUE" inside a transaction block, and the SQL
-- Editor wraps multi-statement input in one. Prisma migrate handles this
-- automatically by committing each statement separately.

-- ── Step 1 (run alone) ────────────────────────────────────────────────────
ALTER TYPE "InvoiceStatus" ADD VALUE 'PENDING_VERIFICATION';

-- ── Step 2 (everything else) — idempotent, safe to re-run ────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProofOfPaymentType') THEN
    CREATE TYPE "ProofOfPaymentType" AS ENUM ('FILE','TEXT','BOTH');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentMethod') THEN
    CREATE TYPE "PaymentMethod" AS ENUM ('BANK_TRANSFER','MPESA','CASH','CARD','CHEQUE','OTHER');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PortalMessageSender') THEN
    CREATE TYPE "PortalMessageSender" AS ENUM ('TENANT','MANAGER');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PortalThreadStatus') THEN
    CREATE TYPE "PortalThreadStatus" AS ENUM ('SENT','READ','RESOLVED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PortalMessageCategory') THEN
    CREATE TYPE "PortalMessageCategory" AS ENUM ('LEASE_QUERY','PAYMENT_NOTIFICATION','PERMISSION_REQUEST','GENERAL');
  END IF;
END $$;

ALTER TABLE "Invoice"
  ADD COLUMN IF NOT EXISTS "proofOfPaymentUrl"  TEXT,
  ADD COLUMN IF NOT EXISTS "proofOfPaymentText" TEXT,
  ADD COLUMN IF NOT EXISTS "proofOfPaymentType" "ProofOfPaymentType",
  ADD COLUMN IF NOT EXISTS "proofSubmittedAt"   TIMESTAMP(3);

ALTER TABLE "IncomeEntry"
  ADD COLUMN IF NOT EXISTS "paymentMethod" "PaymentMethod";

CREATE TABLE IF NOT EXISTS "PortalMessageThread" (
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

CREATE INDEX IF NOT EXISTS "PortalMessageThread_tenantId_lastMessageAt_idx"
  ON "PortalMessageThread"("tenantId","lastMessageAt");
CREATE INDEX IF NOT EXISTS "PortalMessageThread_status_idx"
  ON "PortalMessageThread"("status");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalMessageThread_tenantId_fkey'
  ) THEN
    ALTER TABLE "PortalMessageThread"
      ADD CONSTRAINT "PortalMessageThread_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "PortalMessage" (
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

CREATE INDEX IF NOT EXISTS "PortalMessage_threadId_createdAt_idx"
  ON "PortalMessage"("threadId","createdAt");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalMessage_threadId_fkey'
  ) THEN
    ALTER TABLE "PortalMessage"
      ADD CONSTRAINT "PortalMessage_threadId_fkey"
      FOREIGN KEY ("threadId") REFERENCES "PortalMessageThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "PortalMessageThread" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PortalMessage"       ENABLE ROW LEVEL SECURITY;
