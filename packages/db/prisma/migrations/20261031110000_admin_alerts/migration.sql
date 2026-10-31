ALTER TABLE "app_settings" ADD COLUMN "alertRules" JSONB;

CREATE TABLE "admin_alert_reviews" (
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "reviewerId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_alert_reviews_pkey" PRIMARY KEY ("key")
);

ALTER TABLE "admin_alert_reviews" ADD CONSTRAINT "admin_alert_reviews_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
