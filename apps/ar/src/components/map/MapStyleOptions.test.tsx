import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MapStyleOptions } from "./MapLayersSheet";

describe("the map style options", () => {
  const html = renderToStaticMarkup(<MapStyleOptions view={{ lng: 90.4, lat: 23.8, zoom: 14 }} />);

  it("lists the six map types with one chosen (Default to begin with)", () => {
    for (const label of ["Default", "Streets", "Outdoors", "Satellite", "Light", "Dark"])
      expect(html).toContain(label);
    expect((html.match(/role="radio" aria-checked="true"/g) ?? []).length).toBe(2); // type + view
    expect(html).toContain('aria-label="Map type"');
  });

  it("has the 2D / 3D switch and the Terrain switch (off to begin with)", () => {
    expect(html).toContain('aria-label="View"');
    expect(html).toContain(">2D<");
    expect(html).toContain(">3D<");
    expect(html).toContain('aria-label="Terrain"');
    expect(html).toContain('role="switch" aria-checked="false"');
  });
});
