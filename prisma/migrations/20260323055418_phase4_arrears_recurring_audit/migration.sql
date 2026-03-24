-- CreateEnum
CREATE TYPE "ArrearsStage" AS ENUM ('INFORMAL_REMINDER', 'DEMAND_LETTER', 'LEGAL_NOTICE', 'EVICTION', 'RESOLVED');

-- CreateEnum
CREATE TYPE "RecurringFrequency" AS ENUM ('MONTHLY', 'QUARTERLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE');

-- CreateTable
CREATE TABLE "ArrearsCase" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "stage" "ArrearsStage" NOT NULL DEFAULT 'INFORMAL_REMINDER',
    "amountOwed" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArrearsCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArrearsEscalation" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "stage" "ArrearsStage" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArrearsEscalation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringExpense" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "scope" "ExpenseScope" NOT NULL,
    "propertyId" TEXT,
    "unitId" TEXT,
    "frequency" "RecurringFrequency" NOT NULL DEFAULT 'MONTHLY',
    "nextDueDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userEmail" TEXT,
    "action" "AuditAction" NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ArrearsCase_tenantId_idx" ON "ArrearsCase"("tenantId");

-- CreateIndex
CREATE INDEX "ArrearsCase_stage_idx" ON "ArrearsCase"("stage");

-- CreateIndex
CREATE INDEX "RecurringExpense_nextDueDate_idx" ON "RecurringExpense"("nextDueDate");

-- CreateIndex
CREATE INDEX "AuditLog_resource_resourceId_idx" ON "AuditLog"("resource", "resourceId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "ArrearsCase" ADD CONSTRAINT "ArrearsCase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArrearsCase" ADD CONSTRAINT "ArrearsCase_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArrearsEscalation" ADD CONSTRAINT "ArrearsEscalation_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ArrearsCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringExpense" ADD CONSTRAINT "RecurringExpense_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringExpense" ADD CONSTRAINT "RecurringExpense_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
