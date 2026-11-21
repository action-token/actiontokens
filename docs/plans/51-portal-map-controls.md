# 51 · Artist portal map controls

**Status: built 2026-11-13. No migration.**

Found while browser-testing `/pins` (your note: the bottom-left of the wide layout doesn't look like
wadzzo's four buttons).

## How wadzzo did it (read 2026-11-13: brand `map-kit/base-map.tsx`, `user-location.tsx`, `map-layers-panel.tsx`)

Bottom-left of every portal map:

- **One box, three buttons:** Locate me, Zoom in, Zoom out. Locate asks the browser for permission
  when pressed, flies to you (zooming in to 15.5 if the map is farther out, never zooming out) and draws a blue puck with an
  accuracy circle; if permission was already granted the puck shows without moving the camera, so a
  map the brand has framed stays put. Zoom buttons grey out at the ends of the range.
- **A separate Layers box** beside it: opens the map style panel: the map type as picture tiles
  (Default, Streets, Outdoors, Satellite, Light, Dark), a 2D / 3D switch and a Terrain switch. The
  choice is stored per device and every map follows it. There is no separate 3D button.

## Action Tokens today (seen in the browser)

The portal's one base map (`map-kit/base-map.tsx`) has a corner "3D" text button, Zoom in and Zoom out.
No locate button and no map types or terrain (only the AR app has them, plan 47, in its own code).

## Decisions (your answers, 2026-11-13)

| Question | Answer                                                                                    |
| -------- | ----------------------------------------------------------------------------------------- |
| Controls | All four: Locate, Zoom in, Zoom out in one box, and a Layers (map style) button beside it |
| Sharing  | Move the style logic into a shared package; AR and the portal both use it                 |
| Maps     | Every portal map, since they share one base map                                           |

## What gets built

### New package `packages/map` (`@actiontokens/map`)

- `style.ts` (moved from AR's `lib/ar/theme.ts`): `MAP_BASES`, labels, the 2D/3D Mapbox style URLs,
  `mapStyleFor(mode, theme, base)`, `isStandardStyle`, and `createMapPrefs(prefix)`, which returns the
  stored choices (`useMapMode/setMapMode`, `useMapBase/setMapBase`, `useMapTerrain/setMapTerrain`),
  each safe when storage is blocked and live-shared between every map on the page. AR uses prefix
  `actiontokens-ar` (its existing keys, so nobody's saved choice is lost); the portal uses
  `actiontokens-artist` (its existing 2D/3D key keeps working).
- `terrain.tsx` (moved from AR's `MapTerrain.tsx`): hill shading and contour lines under the labels.
- The existing tests move with the code (`map-style.test.ts`); AR keeps thin re-exports so its
  imports don't change.

### Artist portal (`apps/artist`)

- `map-kit/base-map.tsx`: the corner 3D button goes. A control box bottom-left (or the position the
  map asks for): Locate, Zoom in, Zoom out; the Layers button as its own box next to it. The map's
  style comes from `mapStyleFor(mode, theme, base)` and draws `MapTerrain`.
- `map-kit/user-location.tsx`: the locate button and puck, adapted from wadzzo (permission only when
  pressed; no camera move if already granted).
- `map-kit/map-style-panel.tsx`: the Layers panel in the portal's look (tiles for the six types using
  Mapbox static pictures at the map's current view, loaded only while open; 2D / 3D switch; Terrain
  switch), closing on a click outside or Escape.
- Every map using `BaseMap` gets this: Pins map, Admin All maps and Pin review map, pin reports,
  hotspot area drawing, map pickers, the assistant map, murals and unlock places. Small pickers pass
  `controls="zoom"` and keep only the zoom buttons (no panel, no locate), as they have little room.

### AR (`apps/ar`)

- `lib/ar/theme.ts` and `MapTerrain.tsx` use the shared package; nothing visible changes.

## Tests

- Moved: `map-style.test.ts` (every type in 2D and 3D, light and dark, Standard slots, stored choice
  defaults, invalid stored values, storage that throws), now per prefix: two prefixes don't share a
  choice.
- Portal: the panel rendered to markup (six types with one checked, 2D/3D and Terrain switches); the
  locate helper's fly rule (zoom never reduced below the map's current zoom, up to 15.5).
- `pnpm typecheck && pnpm lint && pnpm test`, then a browser check of `/pins` and `/admin/maps`.

## Not in this plan

- Sharing the choice between AR and the portal: they are different sites, so each keeps its own
  per-device choice (a cookie like the theme's could do it later).
- The map legend and the other toolbar buttons (unchanged).
- Phone layout of the controls (checked separately).

## Built (2026-11-13)

- `packages/map` (`@actiontokens/map`): `style` (types, 2D/3D URLs, `mapStyleFor`, `isStandardStyle`),
  `prefs` (`storedChoice`, `createMapPrefs(prefix)`) and `terrain` (`MapTerrainLayers`). AR keeps its
  saved choices (`actiontokens-ar-map-*`) and re-exports from `lib/ar/theme.ts`; the portal uses
  `actiontokens-artist-map-*`. Tests: `style.test.ts`, `prefs.test.ts` (8).
- Portal `map-kit`: `base-map.tsx` has Layers (own box), Locate, Zoom in, Zoom out (one box) and no
  corner 3D button; `controls` is `true` (full), `"zoom"` (map picker, unlock places, mural sheet) or
  `false`; `locate` defaults on with the full set; `forceTerrain`. `map-control-stack.ts` and
  `user-location.tsx` come from Wadzzo, `map-style-panel.tsx` is the Layers panel (six map types as
  Mapbox pictures at the map's view, 2D/3D, Terrain). Tests: `map-style-panel.test.tsx` (panel markup,
  preview URLs, the locate zoom rule).
- Checked in the browser on `/pins`: the four buttons bottom-left, the panel with its previews,
  Satellite and Terrain applied to the map; AR still compiles and loads.
- Not tried: Locate with a real fix (Chrome gave a CoreLocation error here), the other portal maps,
  `/admin/maps`, phone width. Keyed controls by corner so they move when a card opens.
