-- Admins can suspend a user: no sign-in and no actions until unsuspended.
ALTER TABLE "users" ADD COLUMN "suspendedAt" TIMESTAMP(3),
ADD COLUMN "suspendedReason" TEXT;
