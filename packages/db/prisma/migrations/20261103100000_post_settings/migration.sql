-- Per-post settings: who can see, comment on and collect a post. Existing
-- tier posts become MEMBERS posts; everything else keeps today's behaviour.
CREATE TYPE "PostAudience" AS ENUM ('EVERYONE', 'FOLLOWERS', 'MEMBERS');
CREATE TYPE "PostAccess" AS ENUM ('VIEWERS', 'FOLLOWERS', 'MEMBERS', 'NOBODY');

ALTER TABLE "posts"
  ADD COLUMN "audience" "PostAudience" NOT NULL DEFAULT 'EVERYONE',
  ADD COLUMN "commentAccess" "PostAccess" NOT NULL DEFAULT 'VIEWERS',
  ADD COLUMN "commentTierId" TEXT,
  ADD COLUMN "collectAccess" "PostAccess" NOT NULL DEFAULT 'VIEWERS',
  ADD COLUMN "collectTierId" TEXT;

UPDATE "posts" SET "audience" = 'MEMBERS' WHERE "tierId" IS NOT NULL;

ALTER TABLE "posts" ADD CONSTRAINT "posts_commentTierId_fkey" FOREIGN KEY ("commentTierId") REFERENCES "membership_tiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "posts" ADD CONSTRAINT "posts_collectTierId_fkey" FOREIGN KEY ("collectTierId") REFERENCES "membership_tiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
