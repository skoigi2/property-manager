CREATE TYPE "CommunicationType" AS ENUM ('EMAIL');

CREATE TABLE "CommunicationLog" (
    "id"                TEXT NOT NULL,
    "tenantId"          TEXT NOT NULL,
    "type"              "CommunicationType" NOT NULL,
    "subject"           TEXT NOT NULL,
    "body"              TEXT,
    "templateUsed"      TEXT,
    "loggedByEmail"     TEXT NOT NULL,
    "loggedByName"      TEXT,
    "sentAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "followUpDate"      TIMESTAMP(3),
    "followUpCompleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommunicationLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CommunicationLog_tenantId_sentAt_idx" ON "CommunicationLog"("tenantId", "sentAt");

ALTER TABLE "CommunicationLog"
    ADD CONSTRAINT "CommunicationLog_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
