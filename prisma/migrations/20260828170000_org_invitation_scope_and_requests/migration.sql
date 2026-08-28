-- Property-scoped invitations + manager-requested additions.
-- SENT = live invitation; REQUESTED = manager-created, awaiting admin approval.

-- CreateEnum
CREATE TYPE "OrgInvitationStatus" AS ENUM ('REQUESTED', 'SENT');

-- AlterTable
ALTER TABLE "OrgInvitation"
  ADD COLUMN "status" "OrgInvitationStatus" NOT NULL DEFAULT 'SENT',
  ADD COLUMN "propertyIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
