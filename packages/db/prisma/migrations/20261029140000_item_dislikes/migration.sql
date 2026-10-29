-- CreateTable
CREATE TABLE "item_dislikes" (
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_dislikes_pkey" PRIMARY KEY ("userId","itemId")
);

-- CreateIndex
CREATE INDEX "item_dislikes_itemId_idx" ON "item_dislikes"("itemId");

-- AddForeignKey
ALTER TABLE "item_dislikes" ADD CONSTRAINT "item_dislikes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_dislikes" ADD CONSTRAINT "item_dislikes_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
