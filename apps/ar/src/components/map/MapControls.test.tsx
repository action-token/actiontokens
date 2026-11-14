import { Trophy } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { HudShortcut } from "./HudShortcut";
import { MapControls } from "./MapControls";

vi.mock("~/lib/ar/theme", () => ({ useMapMode: () => "2d", setMapMode: vi.fn() }));

const rail = (over: Partial<Parameters<typeof MapControls>[0]> = {}) =>
  renderToStaticMarkup(
    <MapControls
      onRecenter={vi.fn()}
      compassMode={false}
      onToggleCompass={vi.fn()}
      following={false}
      layers={<button aria-label="Map layers">L</button>}
      {...over}
    />,
  );

describe("the map's control rail", () => {
  it("is one capsule: recenter and refresh, compass, 2D/3D and layers", () => {
    const html = rail();
    expect(html).toContain("Recenter on your location and refresh pins");
    expect(html).toContain("Turn the map to your heading");
    expect(html).toContain("Switch to the 3D map"); // in 2D it offers 3D
    expect(html).toContain('aria-label="Map layers"');
    expect((html.match(/ar-glass/g) ?? []).length).toBe(1);
  });

  it("has no auto-collect, murals or separate refresh buttons any more", () => {
    const html = rail();
    expect(html).not.toContain("Auto-collect");
    expect(html).not.toContain("Murals");
    expect(html).not.toContain("Refresh pins");
  });

  it("shows the busy ring while the pins refresh, and says so", () => {
    const html = rail({ refetching: true });
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Refreshing pins");
  });

  it("says when it is following you and when the compass map is on", () => {
    expect(rail({ following: true })).toContain("Following your location");
    expect(rail({ compassMode: true })).toContain("Compass map on");
  });
});

describe("the shortcut pills under the profile", () => {
  it("are an icon and a label on one line", () => {
    const html = renderToStaticMarkup(
      <HudShortcut icon={Trophy} label="Events" onClick={vi.fn()} />,
    );
    expect(html).toContain('aria-label="Events"');
    expect(html).toContain(">Events<");
  });
});
