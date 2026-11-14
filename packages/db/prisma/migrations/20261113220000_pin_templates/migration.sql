-- Pin templates (plan 43): an artist's saved pin and hotspot setups (additive).
CREATE TABLE "pin_templates" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "formType" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "hasLocation" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pin_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pin_templates_artistId_formType_updatedAt_idx" ON "pin_templates"("artistId", "formType", "updatedAt");

ALTER TABLE "pin_templates" ADD CONSTRAINT "pin_templates_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
