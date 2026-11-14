import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_LAYER_VIEW, layersOn, useMapLayer } from "./layers";

const view = () => useMapLayer.getState().view;

describe("the fan's layer choice", () => {
  beforeEach(() => useMapLayer.setState({ view: DEFAULT_LAYER_VIEW }));

  it("opens on regular drops with no layer on", () => {
    expect(view()).toEqual({ regular: true, layers: [] });
    expect(layersOn(view())).toBe(0);
  });

  it("ticks layers on and off, several at once", () => {
    const { toggleLayer, toggleRegular } = useMapLayer.getState();
    toggleLayer("a");
    toggleLayer("b");
    expect(layersOn(view())).toBe(2);
    toggleLayer("a");
    expect(view().layers).toEqual(["b"]);
    toggleRegular();
    expect(view().regular).toBe(false);
  });

  it("selects and deselects all", () => {
    const { setAll } = useMapLayer.getState();
    setAll(true, ["a", "b"]);
    expect(view()).toEqual({ regular: true, layers: ["a", "b"] });
    setAll(false, ["a", "b"]);
    expect(view()).toEqual({ regular: false, layers: [] });
  });

  it("reveals the layer of a search result without touching the rest", () => {
    const { reveal, toggleRegular } = useMapLayer.getState();
    reveal("a");
    reveal("a");
    expect(view().layers).toEqual(["a"]);
    toggleRegular();
    reveal(null);
    expect(view().regular).toBe(true);
  });

  it("forgets a layer that has no live drops any more", () => {
    const { setAll, keepOnly } = useMapLayer.getState();
    setAll(true, ["a", "b"]);
    keepOnly(["b"]);
    expect(view().layers).toEqual(["b"]);
  });
});
