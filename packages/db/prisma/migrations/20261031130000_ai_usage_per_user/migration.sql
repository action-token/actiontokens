-- The AI allowance is counted per person, so applicants without an artist page can use it too.
ALTER TABLE "ai_usage" ADD COLUMN "userId" TEXT;
UPDATE "ai_usage" u SET "userId" = a."userId" FROM "artists" a WHERE a."id" = u."artistId";
DELETE FROM "ai_usage" WHERE "userId" IS NULL;
ALTER TABLE "ai_usage" ALTER COLUMN "userId" SET NOT NULL;

ALTER TABLE "ai_usage" DROP CONSTRAINT "ai_usage_artistId_fkey";
ALTER TABLE "ai_usage" DROP CONSTRAINT "ai_usage_pkey";
ALTER TABLE "ai_usage" DROP COLUMN "artistId";
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("userId", "day");
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
