-- Admins can hide an item or a bounty from fans.
ALTER TABLE "bounties" ADD COLUMN "hiddenAt" TIMESTAMP(3),
ADD COLUMN "hiddenReason" TEXT;

ALTER TABLE "items" ADD COLUMN "hiddenAt" TIMESTAMP(3),
ADD COLUMN "hiddenReason" TEXT;
