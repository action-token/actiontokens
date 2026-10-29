-- Old page addresses of renamed artists, so /artist/{old-slug} redirects.
CREATE TABLE "artist_slug_history" (
    "slug" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artist_slug_history_pkey" PRIMARY KEY ("slug")
);

CREATE INDEX "artist_slug_history_artistId_idx" ON "artist_slug_history"("artistId");

ALTER TABLE "artist_slug_history" ADD CONSTRAINT "artist_slug_history_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
