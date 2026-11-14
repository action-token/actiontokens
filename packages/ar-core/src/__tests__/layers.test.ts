import { describe, expect, it } from "vitest";

import { inLayers, LAYER_ICONS, layerLabels, type MapLayerChip } from "../layers";

const chip = (id: string, name: string, artist: string): MapLayerChip => ({
  id,
  name,
  icon: "MapPin",
  color: "#000000",
  artist,
  artistImage: null,
  pinCount: 1,
});

describe("map layers", () => {
  it("has no icon twice", () => {
    expect(new Set(LAYER_ICONS).size).toBe(LAYER_ICONS.length);
  });

  it("shows the artist only when two layers share a name", () => {
    const labels = layerLabels([
      chip("a", "Hospital", "Acme"),
      chip("b", "hospital", "Beta"),
      chip("c", "Venue", "Acme"),
    ]);
    expect(labels.get("a")).toBe("Hospital · Acme");
    expect(labels.get("b")).toBe("hospital · Beta");
    expect(labels.get("c")).toBe("Venue");
  });

  it("shows regular drops when they're on, and a layer's drops when it's ticked", () => {
    const regular = {};
    const venue = { layer: { id: "v" } };
    expect(inLayers(regular, true, new Set())).toBe(true);
    expect(inLayers(regular, false, new Set(["v"]))).toBe(false);
    expect(inLayers(venue, true, new Set())).toBe(false);
    expect(inLayers(venue, false, new Set(["v"]))).toBe(true);
  });
});
