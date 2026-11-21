import { useSyncExternalStore } from "react";

import { MAP_BASES, type MapBase, type MapMode } from "./style";

/** A small stored choice, kept per device and shared live between every map on the page. */
export function storedChoice<T extends string>(key: string, fallback: T, valid: readonly T[]) {
  const listeners = new Set<() => void>();
  let memory: T | null = null;
  const read = (): T => {
    if (memory) return memory;
    try {
      const stored = window.localStorage.getItem(key);
      return valid.find((value) => value === stored) ?? fallback;
    } catch {
      return fallback;
    }
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    const onStorage = (event: StorageEvent) => {
      if (event.key === key) {
        memory = null;
        listener();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  };
  const write = (value: T) => {
    memory = value;
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Storage blocked: the choice lasts until the page is closed.
    }
    listeners.forEach((listener) => listener());
  };
  const use = () => useSyncExternalStore(subscribe, read, () => fallback);
  return { use, write, read };
}

/**
 * One app's map choices: the 2D/3D mode, the map type and terrain, stored under
 * `<prefix>-map-mode`, `-map-base` and `-map-terrain`. Each app has its own prefix (AR
 * `actiontokens-ar`, the portal `actiontokens-artist`), so an app keeps what its people already chose, and
 * the sites stay separate (they are different origins anyway).
 */
export function createMapPrefs(prefix: string) {
  const mode = storedChoice<MapMode>(`${prefix}-map-mode`, "2d", ["2d", "3d"]);
  const base = storedChoice<MapBase>(`${prefix}-map-base`, "default", MAP_BASES);
  const terrain = storedChoice<"on" | "off">(`${prefix}-map-terrain`, "off", ["on", "off"]);
  return {
    keys: {
      mode: `${prefix}-map-mode`,
      base: `${prefix}-map-base`,
      terrain: `${prefix}-map-terrain`,
    },
    useMapMode: mode.use,
    readMapMode: mode.read,
    setMapMode: mode.write,
    useMapBase: base.use,
    readMapBase: base.read,
    setMapBase: base.write,
    useMapTerrain: () => terrain.use() === "on",
    setMapTerrain: (on: boolean) => terrain.write(on ? "on" : "off"),
  };
}

export type MapPrefs = ReturnType<typeof createMapPrefs>;
