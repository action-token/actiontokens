-- Hotspots carry what each drop's pin looks like (bandfan copied it from the
-- previous drop), how many spots a drop places, and when it last dropped.
ALTER TABLE "hotspots"
  ADD COLUMN "title" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "template" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "spotsPerDrop" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "lastDropAt" TIMESTAMP(3);
