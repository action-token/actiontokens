# 42 · Map layers

**Status: built 2026-11-13. Migration `20261113200000_pin_layers` not yet applied (you run it).**

First of the map and AR upgrades that follow wadzzo (`/Volumes/Data/Projects/wadzzo`). Queue, one
plan each: **42 map layers**, 43 pin look, 44 form cards on the map, 45 admin All maps, 46 AR map
screen, 47 map style sheet, 48 theme, 49 AR marketplace tab. Trails are skipped (wadzzo built
them, then hid them everywhere on 2026-11-13).

## How wadzzo did it (read 2026-11-13, `docs/layers/README.md` and the code)

- An artist (a "brand" there) makes layers with a free name, an icon and a colour: up to 30 each.
  Two artists can each have a "Hospital". A pin or hotspot is in one layer or none; none is
  "regular". A hotspot's drops follow the hotspot's layer, later drops included; changing the
  hotspot's layer moves its drops. Deleting a layer makes what was in it regular again.
- Pins › Map has a layer switcher on the toolbar: "No layer" (the default), each layer (edit
  button: name, icon, colour, delete) and "New layer". The layer picked is the one the artist is
  in: new pins and hotspots go in it, with no field on the new forms. Eye buttons (off by default)
  show other layers' drops too; the switcher shows "+N". Edit forms keep a "Map layer" field. The
  Pins list shows each pin's layer.
- Fans: a Layers button on the AR map's rail opens a sheet: "Regular drops" (on) and one row per
  layer with live drops nearby (icon, name, artist's name and logo, drop count), each ticked on or
  off, with Select all / Deselect all. Several can be on; the map shows regular drops (if on) plus
  every layer that's on. Two layers with one name show the artist ("Hospital · Acme"). The button
  shows how many are on. The AR camera uses the same choice. It isn't saved.
- Fan-map filter by `layer` on the pin list, and a layers list with counts. The embed map sends
  no layer, so it shows every pin.

## Bandcoin today

`Pin` and `Hotspot` have no layer. The AR map filters by All / Following / Available / Collected
only. The artist Pins map has clusters, hotspot areas and place search.

## Decisions (your answers, 2026-11-13)

| Question        | Answer                                                                                   |
| --------------- | ---------------------------------------------------------------------------------------- |
| Artist UI       | Layer switcher on Pins › Map, as wadzzo; "Map layer" field on edit forms                 |
| Icons / colours | Both: wadzzo's 38 icons and its colours, with music icons added                          |
| Fan side        | AR map and AR camera                                                                     |
| Other maps      | Embeds show every pin; the Pins list and admin pin pages show each pin's layer name only |
| Trails          | Skipped                                                                                  |

## What gets built

### Data (`packages/db`) — migration for you to run

- `model PinLayer { id, artistId (cascade with the artist), name, icon, color, createdAt }`,
  indexed on `artistId`, table `pin_layers`.
- `Pin.layerId` and `Hotspot.layerId`: nullable, `ON DELETE SET NULL`, indexed.
- One additive migration, `20261113200000_pin_layers`.

### Shared (`packages/api`, `packages/ar-core`)

- `LAYER_ICONS` (wadzzo's 38 plus music: Guitar, Mic, Headphones, Disc3, Drum, Piano, Radio,
  Speaker, Ticket kept) and `LAYER_COLORS`, one list used by the portal and AR, with a test that
  every icon name has a drawing component in the shared icon map.
- `MAX_LAYERS_PER_ARTIST = 30`.

### API

- `services/artist/layers.ts`: `listLayers`, `createLayer`, `updateLayer`, `deleteLayer`
  (activity-logged; the 30 limit is an `AppError`), and `checkLayer(artistId, layerId, keep?)`: a
  layer must be the artist's own; `undefined` leaves it alone, `null` is no layer.
- Artist routers: `layers.list/create/update/delete`; `layerId` on pin create/update and hotspot
  create/update. `updateHotspot` with a new layer moves the hotspot's drops. `placeDrop` copies the
  hotspot's layer onto each drop.
- `listPins` returns each pin's layer; the admin pin list and map return its layer name.
- Fan: `ar.pin.list` takes optional `layer` (`"none"`, an id, or ids separated by commas) and each
  `ArPin` gains `layer: { id, name, icon, color } | null`. New `ar.pin.layers({lat,lng,radiusKm})`
  returns `[{ id, name, icon, color, artist, artistImage, pinCount }]`, by name then artist, only
  layers with a live drop in the area.
- Agent tools (the AI pin builder): a pin made in the chat can name a layer from the artist's own;
  nothing else changes.

### Artist portal (Pins › Map)

- `features/pins/layers/`: the selected-layer store, `LayerSwitcher` (No layer, each layer with an
  edit button and an eye, New layer, "+N" for the eyes on), `LayerDialog` (name, icon grid, colour
  swatches, delete), `LayerField` (the "Map layer" dropdown on edit pin and edit hotspot, shown
  once the artist has a layer), and `LayerTag` (the small badge on the Pins list and pin card).
- The map shows the picked layer's pins and hotspots plus any with the eye on; a new pin or
  hotspot gets the picked layer, with a note "This pin goes in layer …". The existing new-pin and
  new-hotspot pages take `?layer=<id>`.
- Same toolbar look, popovers and badges as the rest of the portal.

### AR (`apps/ar`)

- `lib/ar/layers.ts` (`inLayer`: regular counts when no layer; groups by chip) and a Layers
  sheet (`LayerSheet`) opened from a Layers button on the map's rail with the count of layers on,
  matching wadzzo's rows (icon, name, artist and logo, count, tick; Select all / Deselect all;
  "Regular drops" on by default). Names that clash show the artist.
- The choice sits in the AR store (not saved to the device), and both the map and the camera use
  it. The All / Following filter still applies on top.

## Tests

- API: create/update/delete; the 30 limit; someone else's layer is refused; deleting a layer makes
  pins regular; a hotspot's layer moves its drops and later drops copy it; the fan filter
  (`none`, one, several); the layers list only counts live drops; the admin list shows the layer.
- Portal/AR: `inLayer`, the chip naming, the icon list matches the icon map.
- `pnpm typecheck && pnpm lint && pnpm test`.

## Not in this plan

- Trails and trail layers; a mobile app filter (bandcoin has none); admin acting for an artist's
  layers (plan 45); layers on embeds.

## Built (2026-11-13)

- Data: `PinLayer`, `Pin.layerId`, `Hotspot.layerId`, migration `20261113200000_pin_layers`.
- Shared: `packages/ar-core/src/layers.ts` (icons incl. 8 music ones, colours, the limit, `layerLabels`,
  `inLayers`), `packages/ui/src/patterns/layer-icon.tsx`.
- API: `services/artist/layers.ts`, `layers.*` router; `layerId` on pin and hotspot create/update;
  drops copy the hotspot's layer; a hotspot's layer change moves its drops; layer shown in the artist
  and admin pin reads; `ar.pin.list` takes `layer`, `ar.pin.layers` lists the chips.
  Tests: `artist-layers.test.ts` (12).
- Artist portal: `features/pins/layers/` (switcher, dialog, field, note, tag, store), wired into
  Pins › Map, the pin and hotspot forms, the Pins list and the admin pin row and map card.
- AR: `lib/ar/layers.ts` (choice), `useMapLayers.ts`, `components/map/LayerSheet.tsx` on the map
  rail; `useDiscoveryPinsQuery` filters by it, so the map and camera agree; a search result reveals
  its layer. The filter runs on the device (every pin is already loaded), as wadzzo's mobile app does.
- Not done: the AI pin builder can't name a layer yet (pins it makes are regular). The AR rail's
  buttons will be rearranged in plan 46.

## Map assistant and layers (2026-11-13, as in Wadzzo)

- New pins and a new hotspot made from an assistant proposal go in **the layer picked on the map when
  you press Confirm**. The portal sends the selected layer with `agent.confirm`; the server checks it is
  the artist's own (`checkLayer`, before anything is queued; on All maps, the artist being acted for)
  and passes it to the pin batch (`options.layerId`) and to `createHotspot`. No layer picked = regular.
- The proposal card shows the read-only note "This pin / batch of pins / hotspot goes in layer X" while
  it is pending (nothing shown on No layer); it follows a layer switch until Confirm.
- Tests (`agent.test.ts`): own layer queued, none = null, another artist's refused with nothing queued,
  the worker hands it to the pin service, a hotspot gets it.
- Not tried in the browser (it needs a real assistant run, which uses the AI allowance).
