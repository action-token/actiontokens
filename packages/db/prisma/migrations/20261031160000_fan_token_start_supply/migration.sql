-- Fan tokens the platform issues into a new artist's storage account at approval.
ALTER TABLE "app_settings" ADD COLUMN "fanTokenStartSupply" DECIMAL(20,7) NOT NULL DEFAULT 1000000;
