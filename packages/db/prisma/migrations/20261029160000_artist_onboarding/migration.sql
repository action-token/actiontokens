-- AlterEnum
ALTER TYPE "ArtistStatus" ADD VALUE 'REJECTED';

-- AlterEnum
ALTER TYPE "OrderKind" ADD VALUE 'ISSUER_SETUP';

-- AlterTable
ALTER TABLE "artists" ADD COLUMN "rejectionReason" TEXT;
