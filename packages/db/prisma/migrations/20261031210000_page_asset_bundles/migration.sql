-- Sell Page Assets: an artist sells a bundle of their fan token from storage, once.
ALTER TYPE "ListingKind" ADD VALUE 'BUNDLE';
ALTER TABLE "listings" ADD COLUMN "bundleAmount" DECIMAL(20,7);
ALTER TABLE "listings" ADD COLUMN "priceXlm" DECIMAL(20,7);
ALTER TABLE "listings" ADD COLUMN "note" TEXT;
