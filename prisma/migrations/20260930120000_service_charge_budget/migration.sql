-- Service charge budgets: yearly budget per expense category, apportioned to
-- units for the year-end statement; balancing invoices link back to it.
CREATE TYPE "ServiceChargeBasis" AS ENUM ('FLOOR_AREA', 'EQUAL', 'CURRENT_CHARGE');

CREATE TABLE "ServiceChargeBudget" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT,
  "propertyId"     TEXT NOT NULL,
  "year"           INTEGER NOT NULL,
  "startMonth"     INTEGER NOT NULL DEFAULT 1,
  "basis"          "ServiceChargeBasis" NOT NULL DEFAULT 'FLOOR_AREA',
  "notes"          TEXT,
  "publishedAt"    TIMESTAMP(3),
  "createdByName"  TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceChargeBudget_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ServiceChargeBudget_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ServiceChargeBudget_propertyId_year_key" ON "ServiceChargeBudget"("propertyId", "year");
CREATE INDEX "ServiceChargeBudget_organizationId_idx" ON "ServiceChargeBudget"("organizationId");
ALTER TABLE "ServiceChargeBudget" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "ServiceChargeBudgetLine" (
  "id"       TEXT NOT NULL,
  "budgetId" TEXT NOT NULL,
  "category" "ExpenseCategory" NOT NULL,
  "amount"   DECIMAL(14,2) NOT NULL,
  "notes"    TEXT,
  CONSTRAINT "ServiceChargeBudgetLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ServiceChargeBudgetLine_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "ServiceChargeBudget"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ServiceChargeBudgetLine_budgetId_category_key" ON "ServiceChargeBudgetLine"("budgetId", "category");
ALTER TABLE "ServiceChargeBudgetLine" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "Invoice" ADD COLUMN "serviceChargeBudgetId" TEXT;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_serviceChargeBudgetId_fkey" FOREIGN KEY ("serviceChargeBudgetId") REFERENCES "ServiceChargeBudget"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Invoice_serviceChargeBudgetId_idx" ON "Invoice"("serviceChargeBudgetId");
