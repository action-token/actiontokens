-- A bounty's prize can be any classic asset the artist holds (their fan token,
-- for one), not only BANDCOIN, XLM or USDC. Exactly one of the two is set.
ALTER TABLE "bounties" ALTER COLUMN "prizeCurrency" DROP NOT NULL;
ALTER TABLE "bounties" ADD COLUMN "prizeAssetCode" TEXT;
ALTER TABLE "bounties" ADD COLUMN "prizeAssetIssuer" TEXT;
ALTER TABLE "bounties" ADD CONSTRAINT "bounties_prize_one_asset" CHECK (
  ("prizeCurrency" IS NOT NULL AND "prizeAssetCode" IS NULL AND "prizeAssetIssuer" IS NULL)
  OR ("prizeCurrency" IS NULL AND "prizeAssetCode" IS NOT NULL AND "prizeAssetIssuer" IS NOT NULL)
);
