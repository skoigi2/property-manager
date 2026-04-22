-- Add per-org role + billing owner flag to UserOrganizationMembership
ALTER TABLE "UserOrganizationMembership"
  ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'MANAGER',
  ADD COLUMN "isBillingOwner" BOOLEAN NOT NULL DEFAULT false;

-- Create OrgInvitation table
CREATE TABLE "OrgInvitation" (
  "id"              TEXT NOT NULL,
  "email"           TEXT NOT NULL,
  "role"            "UserRole" NOT NULL,
  "organizationId"  TEXT NOT NULL,
  "invitedByUserId" TEXT NOT NULL,
  "token"           TEXT NOT NULL,
  "expiresAt"       TIMESTAMP(3) NOT NULL,
  "acceptedAt"      TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrgInvitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrgInvitation_token_key" ON "OrgInvitation"("token");
CREATE INDEX "OrgInvitation_token_idx"          ON "OrgInvitation"("token");
CREATE INDEX "OrgInvitation_organizationId_idx" ON "OrgInvitation"("organizationId");
CREATE INDEX "OrgInvitation_email_idx"          ON "OrgInvitation"("email");

ALTER TABLE "OrgInvitation"
  ADD CONSTRAINT "OrgInvitation_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "OrgInvitation_invitedByUserId_fkey"
    FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enable RLS (consistent with all other tables in this project)
ALTER TABLE "OrgInvitation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_full_access" ON "OrgInvitation"
  FOR ALL TO postgres USING (true) WITH CHECK (true);
