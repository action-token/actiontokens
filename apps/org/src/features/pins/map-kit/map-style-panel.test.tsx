import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LOCATE_ZOOM, locateZoom } from "./user-location";
import { DEFAULT_PREVIEW, MapStyleOptions, previewUrl } from "./map-style-panel";

describe("the map style options", () => {
  const html = renderToStaticMarkup(<MapStyleOptions theme="dark" view={DEFAULT_PREVIEW} />);

  it("offer the six map types with Default chosen, a 2D / 3D switch and Terrain", () => {
    for (const label of ["Default", "Streets", "Outdoors", "Satellite", "Light", "Dark"])
      expect(html).toContain(label);
    expect((html.match(/role="radio"/g) ?? []).length).toBeGreaterThanOrEqual(8); // 6 types + 2D/3D
    expect(html).toMatch(/aria-checked="true"[^>]*>[\s\S]*?Default/);
    expect(html).toContain("2D");
    expect(html).toContain("3D");
    expect(html).toContain("Terrain");
  });

  it("show each type as a Mapbox picture at the map's place", () => {
    const url = previewUrl("satellite", "dark", { lng: 90.4, lat: 23.8, zoom: 12 });
    expect(url).toContain("mapbox/satellite-streets-v12");
    expect(url).toContain("90.4000,23.8000,11.0");
    expect(previewUrl("default", "dark", DEFAULT_PREVIEW)).toContain("mapbox/dark-v11");
    expect(previewUrl("default", "light", DEFAULT_PREVIEW)).toContain("mapbox/light-v11");
  });
});

describe("flying to you", () => {
  it("zooms in to 15.5 from far out and never zooms out", () => {
    expect(locateZoom(4)).toBe(LOCATE_ZOOM);
    expect(locateZoom(15.5)).toBe(15.5);
    expect(locateZoom(18)).toBe(18);
  });
});
