# 47 · Map style sheet

**Status: built 2026-11-13. No migration.**

Sixth of the map and AR upgrades that follow wadzzo. Queue after: 48 theme, 49 AR marketplace tab,
50 phone bottom tab bar.

## How wadzzo did it (read 2026-11-13, `MapLayersSheet.tsx`, `MapTerrain.tsx`, `theme.ts`)

- **Map type:** Default (the app's own look), Streets, Outdoors, Satellite, Light, Dark. Default uses
  the app's flat Light/Dark (2D) or its 3D style; Streets and Satellite have a 3D version (Mapbox
  Standard); Outdoors, Light and Dark are tilted flat in 3D.
- **Options panel** (`MapStyleOptions`): the type as a grid of previews (Mapbox static pictures at
  the place last looked at), a 2D / 3D switch, and a Terrain switch.
- **Terrain:** hill shading and contour lines with heights (every fifth line labelled), from Mapbox's
  terrain tiles, drawn under roads and labels and under the app's own layers.
- **Where:** Profile › Settings › Map shows the options; maps without their own controls (directions,
  trails) have a button that opens them as a sheet. The fan map's rail keeps its own 2D/3D and the
  drop Layers button. The choice is stored per device and every map follows it (main map, directions,
  collected card's mini-map, embed).

## Bandcoin today

Only 2D (Mapbox Light/Dark flat) and 3D (the "3D" Standard style) exist, stored as a per-device mode;
no map types or terrain. The directions map has a round 2D/3D button.

## Decisions (your answers, 2026-11-13)

| Question | Answer                                                                                           |
| -------- | ------------------------------------------------------------------------------------------------ |
| Where    | Profile › Settings › Map and a sheet button on the directions map (the fan map's rail unchanged) |
| Types    | Wadzzo's six (Default, Streets, Outdoors, Satellite, Light, Dark) and Terrain                    |

## What gets built (`apps/ar`; no API or database change)

- **`lib/ar/theme.ts`:** `MAP_BASES`, labels, the Mapbox style URLs (2D and 3D), `mapStyleFor(mode,
theme, base)`, `isStandardStyle`, a small stored choice helper (per device, shared live between
  every map, safe when storage is blocked), `useMapBase`/`setMapBase`, `useMapTerrain`/
  `setMapTerrain`, and `useMapStyle()`. Keys `bandcoin-ar-map-base`, `bandcoin-ar-map-terrain`.
- **`components/map/MapLayersSheet.tsx`:** `MapStyleOptions` (type previews with the check, View 2D/3D,
  Terrain switch), `MapLayersButton` (button + sheet for maps without controls), `MapViewProbe` and
  `lastMapView()` (the place the previews show). Previews are loaded only when the options are on
  screen.
- **`components/map/MapTerrain.tsx`:** the terrain layers, placed under the style's labels (Standard's
  bottom slot, or below its first label layer).
- **Maps:** the main map (`MapCanvas`), directions, the collected card's mini-map and the embed use
  `mapStyleFor(mode, theme, base)`; main map, directions and mini-map draw `MapTerrain`; the main map
  records its view with `MapViewProbe`.
- **Profile › Settings › Map:** `MapStyleOptions` in a "Map" block.
- **Directions page:** its round 2D/3D button becomes the `MapLayersButton` sheet button.

## Tests

- `mapStyleFor` for every type in 2D and 3D, light and dark (Default keeps today's styles; Streets and
  Satellite use Standard in 3D; the others stay flat in 3D); `isStandardStyle`; the stored choices
  (default, set, ignores a stored value that isn't valid, works when storage throws).
- `MapStyleOptions` rendered to markup: six types with one checked, the 2D/3D switch, Terrain switch.
- `pnpm typecheck && pnpm lint && pnpm test`.

## Not in this plan

- The theme (48); trails; a style button on the fan map's rail.
- Note: the 3D "Default" style is a Wadzzo-account style (copied from wadzzo); it needs a token that
  can read it. Not changed here.

## Built (2026-11-13)

- `apps/ar`: map types, terrain and the stored choices in `lib/ar/theme.ts`; `MapLayersSheet.tsx`
  (`MapStyleOptions`, `MapLayersButton` titled "Map style", `MapViewProbe`) and `MapTerrain.tsx`;
  the main map, directions, the collected card's mini-map and the embed follow the choice; terrain
  is drawn on the main and directions maps (the mini-map and the embed take the map type only);
  Profile › Settings › Map; the directions map's button opens the sheet. The drop-layers button on the fan map keeps the
  name "Map layers"; this one is "Map style".
- Tests: `map-style.test.ts` (styles for every type and mode, Standard slots, stored choice),
  `MapStyleOptions.test.tsx`; AR now has a `vitest.config.ts` so `~/` resolves in tests.
- Not tried in a browser; the previews use Mapbox static images (loaded only when the options show).
