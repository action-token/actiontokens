/**
 * Search areas. A named place ("Davenport, IA") becomes a box by geocoding; a
 * country or region may come with its outline (a Polygon or MultiPolygon with
 * [lat, lng] points) so results can be kept to what's really inside.
 */
export type Box = { south: number; west: number; north: number; east: number };
export type Ring = [number, number][];
export type SearchArea = { name: string; box: Box; rings?: Ring[] };

const boxSize = (b: Box) => (b.north - b.south) * (b.east - b.west);

/**
 * Boxes to search for places in an area: its own box, or for an outline in
 * several parts, the boxes of its biggest parts (at most 3; parts under 5% of
 * the biggest are skipped).
 */
export function searchBoxes(area: SearchArea): Box[] {
  if (!area.rings || area.rings.length < 2) return [area.box];
  const boxes = area.rings.map(boxOfRing).sort((a, b) => boxSize(b) - boxSize(a));
  return boxes.filter((b) => boxSize(b) >= boxSize(boxes[0]!) * 0.05).slice(0, 3);
}

export function boxOfRing(ring: Ring): Box {
  const lats = ring.map((p) => p[0]);
  const lngs = ring.map((p) => p[1]);
  return {
    south: Math.min(...lats),
    north: Math.max(...lats),
    west: Math.min(...lngs),
    east: Math.max(...lngs),
  };
}

/** Ray casting on [lat, lng] points. */
export function inRing(ring: Ring, lat: number, lng: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i]!;
    const [yj, xj] = ring[j]!;
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function inArea(area: SearchArea, lat: number, lng: number): boolean {
  const { box } = area;
  if (lat < box.south || lat > box.north || lng < box.west || lng > box.east) return false;
  return area.rings ? area.rings.some((ring) => inRing(ring, lat, lng)) : true;
}

/** Splits a box into an n×n grid, to search big areas tile by tile. */
export function tiles(box: Box, n: number): Box[] {
  const dLat = (box.north - box.south) / n;
  const dLng = (box.east - box.west) / n;
  const out: Box[] = [];
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      out.push({
        south: box.south + r * dLat,
        north: box.south + (r + 1) * dLat,
        west: box.west + c * dLng,
        east: box.west + (c + 1) * dLng,
      });
  return out;
}

export function metresBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** A box `radiusKm` around a point. */
export function boxAround(lat: number, lng: number, radiusKm: number): Box {
  const dLat = radiusKm / 111;
  const dLng = radiusKm / (111 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
  return { south: lat - dLat, north: lat + dLat, west: lng - dLng, east: lng + dLng };
}

/** Rough size of a box, for deciding how many tiles to search. */
export function boxSpanKm(box: Box): number {
  return (
    Math.max(
      metresBetween(box.south, box.west, box.north, box.west),
      metresBetween(box.south, box.west, box.south, box.east),
    ) / 1000
  );
}
