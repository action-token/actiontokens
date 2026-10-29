-- CreateTable
CREATE TABLE "ai_usage" (
    "artistId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "text" INTEGER NOT NULL DEFAULT 0,
    "image" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("artistId","day")
);

-- AddForeignKey
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
