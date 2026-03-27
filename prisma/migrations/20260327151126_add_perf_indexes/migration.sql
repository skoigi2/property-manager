-- CreateIndex
CREATE INDEX "ExpenseEntry_isSunkCost_date_idx" ON "ExpenseEntry"("isSunkCost", "date");

-- CreateIndex
CREATE INDEX "IncomeEntry_type_idx" ON "IncomeEntry"("type");

-- CreateIndex
CREATE INDEX "IncomeEntry_unitId_type_idx" ON "IncomeEntry"("unitId", "type");

-- CreateIndex
CREATE INDEX "PettyCash_propertyId_idx" ON "PettyCash"("propertyId");

-- CreateIndex
CREATE INDEX "Tenant_leaseEnd_idx" ON "Tenant"("leaseEnd");
