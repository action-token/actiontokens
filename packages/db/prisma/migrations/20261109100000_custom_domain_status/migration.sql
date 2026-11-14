-- Custom domains (plan 32): status, www flag and check times (additive).
CREATE TYPE "CustomDomainStatus" AS ENUM ('NEEDS_SETUP', 'PENDING', 'LIVE', 'BROKEN');

ALTER TABLE "custom_domains"
  ADD COLUMN "status" "CustomDomainStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "withWww" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "lastCheckedAt" TIMESTAMP(3),
  ADD COLUMN "brokenSince" TIMESTAMP(3),
  ADD COLUMN "lastError" TEXT;

-- Rows that exist now were copied from bandfan's AWS Amplify setup: they aren't on
-- the new host, so the artist reconnects them ("Needs verifying").
UPDATE "custom_domains" SET "status" = 'NEEDS_SETUP', "verifiedAt" = NULL;

CREATE INDEX "custom_domains_status_lastCheckedAt_idx" ON "custom_domains"("status", "lastCheckedAt");

ALTER TYPE "NotificationType" ADD VALUE 'DOMAIN';
