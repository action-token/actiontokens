/**
 * What every Action Tokens map shares (AR and the artist portal): the map types, the 2D/3D looks and
 * how a style URL is chosen. Pure: no React, no Mapbox.
 */
export type ResolvedTheme = "light" | "dark";
export type MapMode = "2d" | "3d";

/**
 * The 3D look, per theme, from Wadzzo: "Wadzzo 3D Dark/Light" in Mapbox Studio (account: wadzzo),
 * Mapbox Standard with 3D buildings, landmarks and lighting and a colour theme of its own. Needs
 * Wadzzo's Mapbox token (NEXT_PUBLIC_MAPBOX_API), which owns the styles.
 */
export const MAP_STYLE_3D: Record<ResolvedTheme, string> = {
  dark: "mapbox://styles/wadzzo/cmuwbonsf00rv01sdcun4fhdu",
  light: "mapbox://styles/wadzzo/cmuwc16ut00gz01sd6359b3sw",
};

export const MAP_STYLE_2D: Record<ResolvedTheme, string> = {
  dark: "mapbox://styles/mapbox/dark-v11",
  light: "mapbox://styles/mapbox/light-v11",
};

/**
 * "default" is the app's own look (Mapbox Light / Dark flat, the 3D style tilted). The others are
 * Mapbox's own styles; Streets and Satellite have a 3D (Mapbox Standard) version, Outdoors, Light
 * and Dark are tilted flat in 3D. Terrain adds hill shading and contour lines over any of them.
 */
export const MAP_BASES = ["default", "streets", "outdoors", "satellite", "light", "dark"] as const;
export type MapBase = (typeof MAP_BASES)[number];

export const MAP_BASE_LABEL: Record<MapBase, string> = {
  default: "Default",
  streets: "Streets",
  outdoors: "Outdoors",
  satellite: "Satellite",
  light: "Light",
  dark: "Dark",
};

const MAPBOX_2D: Record<Exclude<MapBase, "default">, string> = {
  streets: "mapbox://styles/mapbox/streets-v12",
  outdoors: "mapbox://styles/mapbox/outdoors-v12",
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",
  light: "mapbox://styles/mapbox/light-v11",
  dark: "mapbox://styles/mapbox/dark-v11",
};

const MAPBOX_3D: Partial<Record<MapBase, string>> = {
  streets: "mapbox://styles/mapbox/standard",
  satellite: "mapbox://styles/mapbox/standard-satellite",
};

/** The basemap style for a mode + live theme + map type. */
export function mapStyleFor(
  mode: MapMode,
  theme: ResolvedTheme,
  base: MapBase = "default",
): string {
  if (base === "default") return mode === "3d" ? MAP_STYLE_3D[theme] : MAP_STYLE_2D[theme];
  return (mode === "3d" ? MAPBOX_3D[base] : undefined) ?? MAPBOX_2D[base];
}

/** Whether that style is Mapbox Standard (it has slots: extra layers go in "bottom"). */
export function isStandardStyle(mode: MapMode, base: MapBase): boolean {
  return mode === "3d" && (base === "default" || Boolean(MAPBOX_3D[base]));
}
