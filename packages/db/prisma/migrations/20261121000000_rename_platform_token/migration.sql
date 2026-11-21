-- The platform token is ACTION everywhere. Renames only; no data is changed or removed.
ALTER TYPE "Currency" RENAME VALUE 'BANDCOIN' TO 'ACTION';
ALTER TYPE "OrderKind" RENAME VALUE 'BANDCOIN_SWAP' TO 'ACTION_SWAP';
ALTER TABLE "listings" RENAME COLUMN "priceBandcoin" TO "priceActionToken";
ALTER TABLE "app_settings" RENAME COLUMN "vanityMonthlyBandcoin" TO "vanityMonthlyActionToken";
ALTER TABLE "app_settings" RENAME COLUMN "vanityNameChangeBandcoin" TO "vanityNameChangeActionToken";
