import Supercluster, { type ClusterProperties } from "supercluster";

/**
 * Pins › Map: what to draw for thousands of spots. A pin can have dozens of spots, and drawing each
 * one as its own map marker (an HTML element with an image) froze the page at about ten thousand.
 * Instead the spots are grouped into clusters, as the AR map does: zoomed out you see a few
 * billboards with counts, zoomed in you see single spots, and only those inside the visible area,
 * never more than MAX_ON_SCREEN things at once.
 */
export const MAX_ON_SCREEN = 300;
/** How far apart, in screen pixels, two spots must be to stay separate. Wide, to keep the count low. */
const RADIUS = 80;
const MAX_INDEX_ZOOM = 16;
/** A cluster never zooms the map in past this. */
const MAX_OPEN_ZOOM = 18;
const MAX_IMAGES = 4;

export type SpotPoint = {
  pinId: string;
  spotId: string;
  latitude: number;
  longitude: number;
  /** The pin's picture, shown on the cluster billboard. */
  image?: string | null;
};
export type Box = { north: number; south: number; east: number; west: number };

export type OnScreen =
  | {
      kind: "cluster";
      id: number;
      latitude: number;
      longitude: number;
      count: number;
      /** Up to four different pictures from inside. */
      images: string[];
    }
  | { kind: "spot"; pinId: string; spotId: string; latitude: number; longitude: number };

type Leaf = { pinId: string; spotId: string; images: string[] };
type Picked = { images: string[] };

const isCluster = (
  props: Leaf | (ClusterProperties & Picked),
): props is ClusterProperties & Picked => "cluster" in props && props.cluster;

export type SpotIndex = { clusters: Supercluster<Leaf, Picked>; byId: Map<string, SpotPoint> };

export function buildSpotIndex(spots: SpotPoint[]): SpotIndex {
  const clusters = new Supercluster<Leaf, Picked>({
    radius: RADIUS,
    maxZoom: MAX_INDEX_ZOOM,
    // A copy: `reduce` adds to it, and must not change the spot's own list.
    map: (props) => ({ images: [...props.images] }),
    reduce: (picked, props) => {
      for (const image of props.images) {
        if (picked.images.length >= MAX_IMAGES) break;
        if (!picked.images.includes(image)) picked.images.push(image);
      }
    },
  });
  clusters.load(
    spots.map((spot) => ({
      type: "Feature" as const,
      properties: {
        pinId: spot.pinId,
        spotId: spot.spotId,
        images: spot.image ? [spot.image] : [],
      },
      geometry: { type: "Point" as const, coordinates: [spot.longitude, spot.latitude] },
    })),
  );
  return { clusters, byId: new Map(spots.map((spot) => [spot.spotId, spot])) };
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/**
 * What to draw for the visible `box` at `zoom`: clusters and single spots, at most `cap` of them
 * (the ones nearest the middle are kept). The selected spot is always there as itself.
 */
export function itemsInView(
  index: SpotIndex,
  box: Box,
  zoom: number,
  { selectedSpotId, cap = MAX_ON_SCREEN }: { selectedSpotId?: string | null; cap?: number } = {},
): OnScreen[] {
  const wide = box.east - box.west >= 360;
  const west = wide ? -180 : clamp(box.west, -180, 180);
  const east = wide ? 180 : clamp(box.east, -180, 180);
  const south = clamp(box.south, -85, 85);
  const north = clamp(box.north, -85, 85);

  let items: OnScreen[] = index.clusters
    .getClusters([west, south, east, north], clamp(Math.floor(zoom), 0, MAX_INDEX_ZOOM + 1))
    .map((feature): OnScreen => {
      const [longitude, latitude] = feature.geometry.coordinates as [number, number];
      const props = feature.properties;
      if (isCluster(props))
        return {
          kind: "cluster",
          id: props.cluster_id,
          latitude,
          longitude,
          count: props.point_count,
          images: props.images,
        };
      return { kind: "spot", pinId: props.pinId, spotId: props.spotId, latitude, longitude };
    });

  if (items.length > cap) {
    const midLat = (north + south) / 2;
    const midLng = (east + west) / 2;
    const away = (item: OnScreen) => (item.latitude - midLat) ** 2 + (item.longitude - midLng) ** 2;
    items = items.sort((a, b) => away(a) - away(b)).slice(0, cap);
  }

  const picked = selectedSpotId ? index.byId.get(selectedSpotId) : undefined;
  if (picked && !items.some((item) => item.kind === "spot" && item.spotId === picked.spotId))
    items.push({
      kind: "spot",
      pinId: picked.pinId,
      spotId: picked.spotId,
      latitude: picked.latitude,
      longitude: picked.longitude,
    });
  return items;
}

/** The zoom at which a cluster opens up into its parts. */
export function clusterExpansionZoom(index: SpotIndex, clusterId: number) {
  return Math.min(index.clusters.getClusterExpansionZoom(clusterId), MAX_OPEN_ZOOM);
}
