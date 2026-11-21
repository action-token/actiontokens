# 43 · Pin look: shapes, Pin Studio, templates

**Status: built 2026-11-13 (stages A, B and C). Migrations `20261113210000_pin_look` and `20261113220000_pin_templates` not yet applied (you run them).**

Second of the map and AR upgrades that follow wadzzo. You chose one plan for all three parts, built
in three stages (A, B, C), each tested and reported before the next. Queue after this one: 44 form
cards on the map, 45 admin All maps, 46 AR map screen, 47 map style sheet, 48 theme, 49 AR
marketplace tab, 50 phone bottom tab bar. (Plan 42's list had these one number lower.)

## How wadzzo did it (read 2026-11-13)

**Look.** Each pin and hotspot has a look: a shape (a built-in, or the artist's own), a fill (the
artist's logo, the pin's own picture, or a plain colour), a colour, how the picture sits inside
(zoom and offset), and whether an auto-collect pin shows a ⚡ badge. A shape is only an outline
path in a 100×100 box, written in absolute commands; paths are checked on save and every app draws
them itself, so a shape can't carry scripts or links. Every reader goes through `resolvePinLook`,
which falls back step by step (missing own shape → built-in → circle; pin picture → logo →
colour). A shared `PinGlyph` draws it: the shape, the picture clipped inside or a colour, a
state-coloured outline that follows the edge, and the badge. The forms have a "Pin look" section
with a shape picker and a live preview; the map, nearby cards and AR all draw the same glyph.

**Pin Studio.** A full-page editor opened over the form (nothing typed is lost): select and edit
points, pen, freehand, built-in shapes, trace an image (PNG, JPG, WebP, GIF, SVG) into an outline,
and AI (a description, optionally a reference image or link, gives a black silhouette that is traced
into an editable outline). "Enhance with AI" redraws an outline and shows it beside the original.
Undo and redo, discard confirmation, a tip when a shape is thin. A "Pin shapes" library page edits,
archives or deletes saved shapes. Only the outline is ever saved. AI counts against the daily image
limit, only when it succeeds; a reference image needs a "you have the rights" tick.

**Templates.** A saved pin or hotspot setup (the form's values, with dates kept as durations so a
template never goes stale, optionally with the location or drawn area). "Start from template" on
the forms, "Save as template", and Pins › Templates to use, edit, copy or delete (200 per artist).
The data is versioned and read leniently.

## Action Tokens today

No look. Portal markers are round (tap) or square (auto-collect); AR draws a hex medallion with a
rarity-coloured ring, and nearby cards in a plain frame. Hotspots keep a pin template as JSON.
Action Tokens already has AI image generation, a daily image limit (10) and a public-URL fetch guard.

## Decisions (your answers, 2026-11-13)

| Question        | Answer                                                                                                                                          |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan size       | One plan for look, Pin Studio and templates, built in three stages                                                                              |
| Built-in shapes | Wadzzo's six (circle, square, hexagon, shield, star, teardrop) plus music ones: guitar pick, vinyl record, music note                           |
| Existing pins   | Circle with the artist's picture; auto-collect pins get a ⚡ badge, not a square                                                                |
| AR marker       | The pin's own shape, outlined in its rarity colour (grey when ended, tick when collected, padlock when locked); nearby cards use the same shape |
| Trails          | Skipped                                                                                                                                         |

## Stage A: pin look

### Data (migration `20261113210000_pin_look`, additive, you run it)

- `Pin` and `Hotspot`: `markerShape String?` (a built-in id), `pinShapeId String?` (the artist's own
  shape, `ON DELETE SET NULL`), `markerFill String @default("ARTIST")` (ARTIST, PIN or NONE),
  `markerColor String?`, `markerImageFit Json?`, `markerAutoBadge Boolean @default(true)`. A hotspot's drops copy
  its look.
- `PinShape` (stage B) is created here too so the column's relation exists: `id, artistId (cascade),
name, path, anchor (center or bottom), archived, createdAt, updatedAt`, table `pin_shapes`.

### Shared

- `packages/ar-core/src/pin-look.ts`: the six built-ins plus the three music shapes, `starPath`,
  `regularPolygonPath`, `polygonPath`, `checkShapePath` (absolute commands only, closed, inside the
  box, size caps), `lookToColumns`, `columnsToLook`, `resolvePinLook` and the `ResolvedPinLook` type.
- `packages/ui/src/patterns/pin-glyph.tsx` (`PinGlyph`), `segmented.tsx`, `range-field.tsx`.

### API

- Pin and hotspot create/update take and return `look`; an own shape must be the artist's.
  `placeDrop` copies the hotspot's look. Pins with no stored look read as the default.
- `ar.pin.list` returns each pin's resolved `look`. The artist and admin map reads return it too.

### Artist portal

- `features/pins/look/`: the "Pin look" section (shape picker with the built-ins and, once stage B
  is in, "My shapes" and "Draw a shape"; fill; colour; picture zoom and position; ⚡ badge) with a
  live preview, on the new and edit pin forms and the hotspot form. The form's location picker
  shows the pin as it will look.
- Pins › Map, the in-view list, the pin card and the admin pin map draw `PinGlyph` instead of the
  round/square marker.

### AR

- `PinMarker` draws the pin's glyph with the rarity outline and the existing states (tick, padlock,
  faded when ended, pulse when in range); `NearbyStrip` cards and the pin sheet use the same shape.
  Clusters keep their billboard.

## Stage B: Pin Studio

### API

- `shapes.list/usage/create/update/archive/delete` (an artist's own, activity-logged; a shape in use
  can be archived but not deleted).
- `shapes.ai`: a description, optionally a reference image (PNG, JPG, WebP, 8 MB) or link, gives a
  silhouette image; a reference needs the "I have the rights" tick. `shapes.enhance` redraws an
  outline. Both go through `withAiQuota` (one image each, only on success), the public-URL guard
  for links, and the existing OpenAI image model (edit endpoint for references).
- Server draws an outline as a PNG (`renderOutlinePng`) for enhance.

### Shared

- Shape geometry (points ↔ paths, freehand smoothing, tracing an image, the thin-shape tip) and
  shape size (how big a thin shape is drawn on the map), with the same tests as wadzzo's.

### Artist portal

- `/pins/studio` (full page, opens over the form and returns to it): tools Select, Pen, Freehand,
  Shapes, Trace, AI; undo and redo; discard confirmation; pin preview; compare view for enhance.
- Pins › Pin shapes: the library (edit, archive, restore, delete).
- Sidebar: "Pin shapes" under Pins.

## Stage C: pin templates

### Data (migration `20261113220000_pin_templates`)

- `PinTemplate`: `id, artistId (cascade), name, formType (PIN or HOTSPOT), data Json, schemaVersion,
hasLocation, createdAt, updatedAt`, indexed on artist, type and date.

### API

- `templates.list/get/create/update/duplicate/delete`; 200 per artist (`AppError`); data checked
  against the form's schema and read leniently (older versions upgrade).

### Artist portal

- "Start from template" and "Save as template" on the pin and hotspot forms (a pin may keep its
  location, a hotspot its drawn area; dates kept as durations).
- Pins › Templates (tabs Pins and Hotspots; Use, Edit, Copy, Delete).
- The AI pin builder is unchanged.

## Tests

- Stage A: path checks (accepts good, rejects relative commands, open outlines, out of the box,
  too detailed); look ↔ columns and every fallback; the drop copies the hotspot's look; an own
  shape must be the artist's; the map reads return a resolved look; AR marker states.
- Stage B: geometry and size (ported from wadzzo's tests); the AI endpoints count only on success,
  refuse a reference without the rights tick, and refuse private links; shape ownership and the
  in-use rule.
- Stage C: save, open, duplicate, delete; the limit; a template can't carry the other kind's
  fields; old versions read; dates become durations and come back as dates.
- `pnpm typecheck && pnpm lint && pnpm test` after each stage.

## Not in this plan

- Trails; a look on the website embed (it keeps drawing round pins); looks for murals.
- Applying one look to many existing pins at once.

## Stage A built (2026-11-13)

- Data: `PinShape`, the six look columns on `Pin` and `Hotspot`, migration `20261113210000_pin_look`
  (the shapes table is there already for stage B).
- `packages/ar-core/src/pin-look.ts` (nine built-ins: wadzzo's six plus guitar pick, vinyl record
  and music note; path checks; look to columns and back; `resolvePinLook`), `zod` added to
  `ar-core`. `PinGlyph` (draws holes with the even-odd rule so the record's spindle hole works),
  `Segmented` and `RangeField` in `packages/ui`.
- API: `services/artist/pin-look.ts`; `look` on pin and hotspot create/update; drops copy the
  hotspot's look; artist, admin and AR reads return a resolved `look`; `pinOptions` returns the
  artist's picture. Tests: `artist-pin-look.test.ts` (8), `pin-look.test.ts` (ar-core), list test.
- Portal: "Pin look" section (shape picker, picture, zoom and drag, colour, ⚡ badge, live preview in
  three states) on the pin and hotspot forms; the form's map shows the pin as it will look; a new
  pin starts from your last look (this browser); Pins › Map and the admin pin map draw the glyph.
- AR: `PinMarker` and the nearby cards draw the pin's shape with the rarity outline.
- Not yet: "My shapes" and "New shape" in the picker (stage B).

## Stage B built (2026-11-13)

- API: `services/artist/shapes.ts` (own shapes, 100 limit, in-use rule), `shapes.*` router
  (list, usage, create, update, archive, delete, ai, enhance), `services/ai/silhouette.ts`
  (references from a file or a public link, prompts, generate and enhance), `AiModel.edit` and a
  `quality` option, `renderOutlinePng` in `@actiontokens/storage`. AI goes through the daily image
  limit, only on success; a reference needs the "I have the rights" tick; links go through the
  public-URL guard. Tests: `artist-shapes.test.ts` (6), `artist-shapes-ai.test.ts` (5),
  `ai-silhouette.test.ts` (12), storage `outline-png.test.ts` (2).
- Shared: `shape-geometry.ts` and `shape-size.ts` with wadzzo's tests, plus `shapeScale` so thin
  shapes are drawn a little larger on the portal and AR maps.
- Portal: Pin Studio (`features/pins/studio/`, opens over the form as a full-page dialog: select,
  pen, freehand, shapes, trace, AI, enhance with compare view, undo/redo, discard confirmation,
  pin preview); the shape picker lists "Your shapes" with New shape and edit; Pins › Pin shapes
  (`/pins/shapes`, reached from Pin management and the picker) to edit, archive, restore or
  delete. No sidebar entry: the menu is capped at 15 and a test holds it.

## Stage C built (2026-11-13)

- Data: `PinTemplate`, migration `20261113220000_pin_templates`.
- Shared: `packages/ar-core/src/pin-template.ts` (the data for each kind, lenient reading, versioned,
  durations). Fields follow actiontokens's own forms (reward, visibility and tier, spots, tags, look),
  not wadzzo's.
- API: `services/artist/templates.ts` and the `templates.*` router (list, get, create, update,
  duplicate, delete; 200 limit; ownership); a shape's usage now counts templates. Tests:
  `artist-templates.test.ts` (6), `pin-template.test.ts` (ar-core, 13).
- Portal: `features/pins/templates/` with the form mapping (tested), `TemplatePicker` ("Start from
  template" on the new pin and new hotspot forms), `SaveTemplateDialog` ("Save as template", with
  "include the location / area"; a form started from a template can update it or save a new one),
  `useFormTemplate` (`?template=<id>`), and Pins › Templates (`/pins/templates`; Use, Rename,
  Duplicate, Delete), linked from Pin management.
- Differences from the plan: Edit on a template card is Rename; to change what is in one, use it,
  adjust the form and choose Save as template › Update. There is no separate edit form.
