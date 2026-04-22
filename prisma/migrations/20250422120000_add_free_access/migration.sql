-- Add freeAccess flag to Organization for super-admin complimentary access override
ALTER TABLE "Organization" ADD COLUMN "freeAccess" BOOLEAN NOT NULL DEFAULT false;
