-- CreateEnum
CREATE TYPE "EmailKind" AS ENUM (
  'PASSWORD_RESET',
  'ORG_INVITATION',
  'CONTACT_FORM',
  'CONTACT_AUTOREPLY',
  'NEW_USER_ALERT',
  'WELCOME',
  'NOTIFICATION',
  'MANUAL'
);

-- CreateTable
CREATE TABLE "EmailLog" (
  "id" TEXT NOT NULL,
  "kind" "EmailKind" NOT NULL,
  "fromEmail" TEXT NOT NULL,
  "toEmail" TEXT NOT NULL,
  "replyTo" TEXT,
  "subject" TEXT NOT NULL,
  "bodyHtml" TEXT NOT NULL,
  "bodyText" TEXT,
  "resendId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'sent',
  "errorMessage" TEXT,
  "organizationId" TEXT,
  "userId" TEXT,
  "inReplyToId" TEXT,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailLog_sentAt_idx" ON "EmailLog"("sentAt");
CREATE INDEX "EmailLog_toEmail_idx" ON "EmailLog"("toEmail");
CREATE INDEX "EmailLog_kind_idx" ON "EmailLog"("kind");
CREATE INDEX "EmailLog_organizationId_idx" ON "EmailLog"("organizationId");
CREATE INDEX "EmailLog_userId_idx" ON "EmailLog"("userId");
CREATE INDEX "EmailLog_inReplyToId_idx" ON "EmailLog"("inReplyToId");

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_inReplyToId_fkey" FOREIGN KEY ("inReplyToId") REFERENCES "EmailLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Enable RLS so the table cannot be reached via Supabase anon/authenticated keys.
-- Prisma (postgres role) bypasses RLS, so app access still works as normal.
ALTER TABLE "EmailLog" ENABLE ROW LEVEL SECURITY;
