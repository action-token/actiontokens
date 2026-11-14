-- Pin look (plan 43): a shape, fill, colour and badge on pins and hotspots, and the artist's own shapes (additive).
CREATE TABLE "pin_shapes" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "anchor" TEXT NOT NULL DEFAULT 'center',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pin_shapes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pin_shapes_artistId_archived_idx" ON "pin_shapes"("artistId", "archived");

ALTER TABLE "pin_shapes" ADD CONSTRAINT "pin_shapes_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pins" ADD COLUMN "markerShape" TEXT,
ADD COLUMN "pinShapeId" TEXT,
ADD COLUMN "markerFill" TEXT NOT NULL DEFAULT 'ARTIST',
ADD COLUMN "markerColor" TEXT,
ADD COLUMN "markerImageFit" JSONB,
ADD COLUMN "markerAutoBadge" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "hotspots" ADD COLUMN "markerShape" TEXT,
ADD COLUMN "pinShapeId" TEXT,
ADD COLUMN "markerFill" TEXT NOT NULL DEFAULT 'ARTIST',
ADD COLUMN "markerColor" TEXT,
ADD COLUMN "markerImageFit" JSONB,
ADD COLUMN "markerAutoBadge" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "pins" ADD CONSTRAINT "pins_pinShapeId_fkey" FOREIGN KEY ("pinShapeId") REFERENCES "pin_shapes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "hotspots" ADD CONSTRAINT "hotspots_pinShapeId_fkey" FOREIGN KEY ("pinShapeId") REFERENCES "pin_shapes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
