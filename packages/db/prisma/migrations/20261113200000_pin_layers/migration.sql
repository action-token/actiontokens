-- Map layers (plan 42): an artist's named, coloured groups of pins and hotspots (additive).
CREATE TABLE "pin_layers" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pin_layers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pin_layers_artistId_idx" ON "pin_layers"("artistId");

ALTER TABLE "pin_layers" ADD CONSTRAINT "pin_layers_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pins" ADD COLUMN "layerId" TEXT;
ALTER TABLE "hotspots" ADD COLUMN "layerId" TEXT;

CREATE INDEX "pins_layerId_idx" ON "pins"("layerId");
CREATE INDEX "hotspots_layerId_idx" ON "hotspots"("layerId");

ALTER TABLE "pins" ADD CONSTRAINT "pins_layerId_fkey" FOREIGN KEY ("layerId") REFERENCES "pin_layers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "hotspots" ADD CONSTRAINT "hotspots_layerId_fkey" FOREIGN KEY ("layerId") REFERENCES "pin_layers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
