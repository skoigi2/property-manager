-- CreateEnum
CREATE TYPE "LineItemCategory" AS ENUM ('LABOUR', 'MATERIAL', 'QUOTE');

-- CreateEnum
CREATE TYPE "LineItemPaymentStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID');

-- CreateTable
CREATE TABLE "ExpenseLineItem" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "category" "LineItemCategory" NOT NULL,
    "description" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "isVatable" BOOLEAN NOT NULL DEFAULT false,
    "paymentStatus" "LineItemPaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "amountPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paymentReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseUnitAllocation" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "shareAmount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ExpenseUnitAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseUnitAllocation_expenseId_unitId_key" ON "ExpenseUnitAllocation"("expenseId", "unitId");

-- AddForeignKey
ALTER TABLE "ExpenseLineItem" ADD CONSTRAINT "ExpenseLineItem_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "ExpenseEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseUnitAllocation" ADD CONSTRAINT "ExpenseUnitAllocation_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "ExpenseEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseUnitAllocation" ADD CONSTRAINT "ExpenseUnitAllocation_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
