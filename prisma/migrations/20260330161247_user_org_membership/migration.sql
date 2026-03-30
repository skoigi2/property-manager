-- CreateTable
CREATE TABLE "UserOrganizationMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserOrganizationMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserOrganizationMembership_userId_idx" ON "UserOrganizationMembership"("userId");

-- CreateIndex
CREATE INDEX "UserOrganizationMembership_organizationId_idx" ON "UserOrganizationMembership"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "UserOrganizationMembership_userId_organizationId_key" ON "UserOrganizationMembership"("userId", "organizationId");

-- AddForeignKey
ALTER TABLE "UserOrganizationMembership" ADD CONSTRAINT "UserOrganizationMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOrganizationMembership" ADD CONSTRAINT "UserOrganizationMembership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
