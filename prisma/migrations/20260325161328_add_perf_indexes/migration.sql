-- CreateIndex
CREATE INDEX "ExpenseEntry_unitId_idx" ON "ExpenseEntry"("unitId");

-- CreateIndex
CREATE INDEX "Tenant_unitId_idx" ON "Tenant"("unitId");

-- CreateIndex
CREATE INDEX "Tenant_isActive_idx" ON "Tenant"("isActive");

-- CreateIndex
CREATE INDEX "Tenant_unitId_isActive_idx" ON "Tenant"("unitId", "isActive");
