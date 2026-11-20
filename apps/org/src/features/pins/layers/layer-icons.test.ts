import { describe, expect, it } from "vitest";

import { LAYER_ICONS } from "@actiontokens/ar-core/layers";

import { LAYER_ICON_COMPONENTS } from "@actiontokens/ui/patterns/layer-icon";

describe("layer icons", () => {
  it("draws every icon a layer can have, and nothing else", () => {
    expect(Object.keys(LAYER_ICON_COMPONENTS).sort()).toEqual([...LAYER_ICONS].sort());
  });
});
