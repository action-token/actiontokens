-- Declining a pending gift (plan 35): which waiting gifts a fan said no to (additive).
CREATE TABLE "declined_gifts" (
    "userId" TEXT NOT NULL,
    "balanceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "declined_gifts_pkey" PRIMARY KEY ("userId","balanceId")
);

CREATE INDEX "declined_gifts_balanceId_idx" ON "declined_gifts"("balanceId");

ALTER TABLE "declined_gifts" ADD CONSTRAINT "declined_gifts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
