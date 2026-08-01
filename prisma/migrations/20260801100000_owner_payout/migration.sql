-- OwnerPayout: records that a statement period's net-payable was actually
-- remitted to the property owner. Makes the calendar's RENT_REMITTANCE event
-- verifiable and lets owner statements show remitted vs outstanding.

-- CreateTable
CREATE TABLE IF NOT EXISTS "OwnerPayout" (
  "id" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "periodYear" INTEGER NOT NULL,
  "periodMonth" INTEGER NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "paidAt" TIMESTAMP(3) NOT NULL,
  "method" "PaymentMethod",
  "reference" TEXT,
  "notes" TEXT,
  "createdByEmail" TEXT NOT NULL,
  "createdByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OwnerPayout_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX IF NOT EXISTS "OwnerPayout_propertyId_periodYear_periodMonth_idx"
  ON "OwnerPayout"("propertyId", "periodYear", "periodMonth");

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "OwnerPayout" ADD CONSTRAINT "OwnerPayout_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Enable RLS (no policies — matches every other table: anon/authenticated
-- Supabase keys get no access; Prisma connects as table owner).
ALTER TABLE "OwnerPayout" ENABLE ROW LEVEL SECURITY;
