-- AlterTable
ALTER TABLE "artists" ADD COLUMN     "issuerAccountId" TEXT;

-- AlterTable
ALTER TABLE "chain_accounts" ADD COLUMN     "activatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "breakdown" JSONB,
ADD COLUMN     "rateUsd" DECIMAL(20,7),
ADD COLUMN     "royaltyAmount" DECIMAL(20,7),
ADD COLUMN     "sellerAmount" DECIMAL(20,7);

-- CreateIndex
CREATE UNIQUE INDEX "artists_issuerAccountId_key" ON "artists"("issuerAccountId");

-- AddForeignKey
ALTER TABLE "artists" ADD CONSTRAINT "artists_issuerAccountId_fkey" FOREIGN KEY ("issuerAccountId") REFERENCES "chain_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
