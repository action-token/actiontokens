-- How much of the fan token one collect gives (items always give one copy).
ALTER TABLE "pins" ADD COLUMN "rewardAmount" DECIMAL(20,7) NOT NULL DEFAULT 1;
