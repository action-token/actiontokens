import { describe, expect, it } from "vitest";

import { directionsLink, placesView } from "./map-view";

describe("placesView", () => {
  it("centres on a single place", () => {
    expect(placesView([{ lat: 51.5, lng: -0.12 }])).toEqual({
      latitude: 51.5,
      longitude: -0.12,
      zoom: 14,
    });
  });

  it("treats the same spot twice as one place, not an empty frame", () => {
    const spot = { lat: 51.5, lng: -0.12 };
    expect(placesView([spot, spot])).toMatchObject({ latitude: 51.5, zoom: 14 });
  });

  it("frames several places, south-west corner first", () => {
    const view = placesView([
      { lat: 51.5, lng: -0.12 },
      { lat: 40.7, lng: -74 },
      { lat: 48.8, lng: 2.3 },
    ]);
    expect(view).toMatchObject({
      bounds: [
        [-74, 40.7],
        [2.3, 51.5],
      ],
    });
  });
});

describe("directionsLink", () => {
  it("opens the place in Google Maps", () => {
    expect(directionsLink({ lat: 51.5, lng: -0.12 })).toContain("query=51.5,-0.12");
  });
});
