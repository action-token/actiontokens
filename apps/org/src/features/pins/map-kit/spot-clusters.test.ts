import { describe, expect, it } from "vitest";

import {
  buildSpotIndex,
  clusterExpansionZoom,
  itemsInView,
  MAX_ON_SCREEN,
  type SpotPoint,
} from "./spot-clusters";

const WORLD = { north: 85, south: -85, east: 180, west: -180 };

/** A tiny deterministic random source, so the tests don't depend on luck. */
function random(seed: number) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

/** Like the real data: a lot of pins, each with a lot of spots spread around a country. */
function manySpots(pins = 119, perPin = 85): SpotPoint[] {
  const next = random(7);
  return Array.from({ length: pins }, (_, p) =>
    Array.from({ length: perPin }, (_, s) => ({
      pinId: `pin${p}`,
      spotId: `pin${p}-spot${s}`,
      latitude: 25 + next() * 22,
      longitude: -123 + next() * 55,
      image: `https://cdn/${p % 3}.jpg`,
    })),
  ).flat();
}

const clusterCount = (items: ReturnType<typeof itemsInView>) =>
  items.reduce((total, item) => total + (item.kind === "cluster" ? item.count : 1), 0);

describe("pins on the map: spots grouped into clusters", () => {
  const spots = manySpots();
  const index = buildSpotIndex(spots);

  it("draws a handful of things when zoomed out, however many spots there are", () => {
    expect(spots).toHaveLength(10_115);
    const items = itemsInView(index, WORLD, 2);
    expect(items.length).toBeLessThanOrEqual(MAX_ON_SCREEN);
    expect(items.length).toBeLessThan(60);
    expect(items.every((item) => item.kind === "cluster")).toBe(true);
  });

  it("loses no spot: clusters and single spots add up to all of them", () => {
    // Without the cap, whatever the zoom, every spot is in exactly one cluster or on its own.
    for (const zoom of [0, 2, 6, 10, 17]) {
      expect(clusterCount(itemsInView(index, WORLD, zoom, { cap: Infinity }))).toBe(spots.length);
    }
  });

  it("never draws more than the cap, at any zoom, over the busiest area", () => {
    const busy = { north: 47, south: 25, east: -68, west: -123 };
    for (const zoom of [3, 5, 7, 9, 11, 13, 15, 17]) {
      expect(itemsInView(index, busy, zoom).length).toBeLessThanOrEqual(MAX_ON_SCREEN);
    }
  });

  it("zoomed in on a small area, shows single spots, and only the ones in view", () => {
    const near = spots[500]!;
    const box = {
      north: near.latitude + 0.05,
      south: near.latitude - 0.05,
      east: near.longitude + 0.05,
      west: near.longitude - 0.05,
    };
    const items = itemsInView(index, box, 16);
    const inside = spots.filter(
      (spot) =>
        spot.latitude <= box.north &&
        spot.latitude >= box.south &&
        spot.longitude <= box.east &&
        spot.longitude >= box.west,
    );
    const singles = items.filter((item) => item.kind === "spot");
    expect(singles.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThanOrEqual(inside.length);
    for (const item of singles) {
      expect(item.latitude).toBeLessThanOrEqual(box.north);
      expect(item.latitude).toBeGreaterThanOrEqual(box.south);
      expect(item.longitude).toBeLessThanOrEqual(box.east);
      expect(item.longitude).toBeGreaterThanOrEqual(box.west);
    }
  });

  it("keeps the nearest to the middle when the cap cuts things off", () => {
    const small = buildSpotIndex(
      Array.from({ length: 40 }, (_, i) => ({
        pinId: "p",
        spotId: `s${i}`,
        latitude: i * 0.5,
        longitude: 0,
      })),
    );
    const box = { north: 20, south: 0, east: 1, west: -1 };
    const items = itemsInView(small, box, 17, { cap: 5 });
    expect(items).toHaveLength(5);
    const kept = items.map((item) => item.latitude).sort((a, b) => a - b);
    // The middle of the box is latitude 10: the five closest spots are 9, 9.5, 10, 10.5, 11
    // (the index goes through map projection and back, so allow for float noise).
    [9, 9.5, 10, 10.5, 11].forEach((latitude, i) => expect(kept[i]).toBeCloseTo(latitude, 6));
  });

  it("always shows the selected spot as itself, even inside a cluster", () => {
    const target = spots[1234]!;
    const without = itemsInView(index, WORLD, 2);
    expect(without.some((item) => item.kind === "spot" && item.spotId === target.spotId)).toBe(
      false,
    );
    const withSelected = itemsInView(index, WORLD, 2, { selectedSpotId: target.spotId });
    const found = withSelected.find((item) => item.kind === "spot");
    expect(found).toMatchObject({ kind: "spot", spotId: target.spotId, pinId: target.pinId });
  });

  it("lists up to four different pictures from inside a cluster", () => {
    const [cluster] = itemsInView(index, WORLD, 0).filter((item) => item.kind === "cluster");
    expect(cluster).toBeDefined();
    if (cluster?.kind !== "cluster") throw new Error("expected a cluster");
    expect(cluster.images.length).toBeGreaterThan(0);
    expect(cluster.images.length).toBeLessThanOrEqual(4);
    expect(new Set(cluster.images).size).toBe(cluster.images.length);
  });

  it("copes with a view wider than the world, a view past the poles, and fractional zoom", () => {
    expect(() =>
      itemsInView(index, { north: 120, south: -120, east: 400, west: -400 }, 0.4),
    ).not.toThrow();
    expect(
      clusterCount(
        itemsInView(index, { north: 120, south: -120, east: 400, west: -400 }, 0.4, {
          cap: Infinity,
        }),
      ),
    ).toBe(spots.length);
    expect(() => itemsInView(index, WORLD, 2.7)).not.toThrow();
  });

  it("is empty with no spots", () => {
    expect(itemsInView(buildSpotIndex([]), WORLD, 3)).toEqual([]);
  });

  it("tells how far to zoom to open a cluster, never past the map's limit", () => {
    const [cluster] = itemsInView(index, WORLD, 2).filter((item) => item.kind === "cluster");
    if (cluster?.kind !== "cluster") throw new Error("expected a cluster");
    const zoom = clusterExpansionZoom(index, cluster.id);
    expect(zoom).toBeGreaterThan(2);
    expect(zoom).toBeLessThanOrEqual(18);
  });

  it("is quick to build and ask, for the page's sake", () => {
    const start = performance.now();
    const fresh = buildSpotIndex(spots);
    itemsInView(fresh, WORLD, 3);
    itemsInView(fresh, { north: 40, south: 30, east: -90, west: -110 }, 9);
    expect(performance.now() - start).toBeLessThan(1500);
  });
});
