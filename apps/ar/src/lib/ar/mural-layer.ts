import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Which murals the map shows (Profile › Settings, saved on this device): all of them, only the
 * verified ones, or none. Three states, so it isn't one of the on/off settings above.
 */
export type MuralLayer = "all" | "verified" | "off";

export const useMuralLayer = create<{ layer: MuralLayer; setLayer: (layer: MuralLayer) => void }>()(
  persist((set) => ({ layer: "all", setLayer: (layer) => set({ layer }) }), {
    name: "actiontokens-ar-mural-layer",
  }),
);
