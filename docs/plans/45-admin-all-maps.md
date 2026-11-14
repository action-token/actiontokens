# 45 · Admin › All maps

**Status: built 2026-11-13. No migration.**

Fourth of the map and AR upgrades that follow wadzzo. Queue after: 46 AR map screen, 47 map style
sheet, 48 theme, 49 AR marketplace tab, 50 phone bottom tab bar.

## How wadzzo did it (read 2026-11-13)

Admin › All maps: pick a brand, and the page is the brand's own Pins map acting for it: its pins,
hotspots, trails and layers, floating cards that create for it (pins made through the admin path,
approved straight away), layers made, edited and picked. Templates stay the signed-in brand's own,
so they aren't offered there. The chosen brand is kept in the URL (`?brand=`), the map remounts
per brand. Every brand API takes an optional `creatorId`; an admin may pass another brand's, and
`resolveActingBrand` checks it (admin, brand exists, in scope). Pin review stays as its own page.

## Bandcoin today

Admin › Pin review › Map shows everyone's pins (or one artist's) and approves or rejects them; an
admin can't make or edit anything for an artist. The artist APIs assume the caller is the artist
(`ctx.artist`).

## Decisions (your answers, 2026-11-13)

| Question      | Answer                                                                                                                                                                                       |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Review map    | Follow wadzzo: Pin review › Map stays; All maps is new                                                                                                                                       |
| Admin power   | Everything the artist can on the map (make, edit, hide, delete pins and spots; hotspots; layers; looks and shapes). Pins made go live at once; every change is logged under the admin's name |
| Map assistant | Lets the admin use it, acting for the artist                                                                                                                                                 |
| Templates     | Not offered while acting (they are the admin's own), as wadzzo                                                                                                                               |

## How acting works (no assumptions: this is the design)

- The acting page runs inside its own tRPC and query cache (a nested provider) whose requests carry
  an `x-acting-artist: <artist id>` header. Nothing outside the page sends it, and its data never
  mixes with the admin's own pages (own cache, own keys).
- Only five artist routers honour it: pins, hotspots, layers, shapes and the map assistant
  (`actingArtistProcedure`). Everything else (wallet, items, gifts, settings, templates…) ignores the
  header and stays the admin's own, so an acting page can't touch money or settings.
- The server honours it only for an admin, for an approved artist; anything else is refused. An
  admin whose header names their own artist is just themselves.
- Pins made while acting skip review (`live`), as hotspot drops and confirmed assistant batches
  already do. Activity rows record the admin as the actor.

## What gets built

### API (`packages/api`)

- `Context.actAs` from the `x-acting-artist` header; `actingArtistProcedure` in `trpc.ts` (sets
  `ctx.artist` to the acting artist and `ctx.acting`).
- `routers/artist/pins.ts`, `hotspots.ts`, `layers.ts`, `shapes.ts` and `agent.ts` use it.
  `createPin` passes `live: ctx.acting`.
- `admin.artists.list` already lists artists for the picker (approved ones are offered).

### Artist portal

- `lib/acting-trpc.tsx`: `ActingTRPCProvider` (own query client and header).
- `features/pins/acting.tsx`: context with the artist being acted for; the forms hide the template
  picker and Save as template, the pin card prints the artist's name on QR sheets, the assistant is
  shown.
- `PinsMap` takes `acting` and `toolbarStart` (the picker); template and "Full page" links go to
  the artist's own pages only when not acting (Full page links are hidden while acting: those pages
  are the admin's own).
- `app/(portal)/admin/maps/page.tsx` + `features/admin/maps-view.tsx`: an artist picker (search by
  name, approved artists, kept in `?artist=`), the map remounting per artist, a note naming who the
  admin is acting for. A new "All maps" entry in the Admin group.

## Tests

- API: acting works for an admin and an approved artist; refused for a non-admin, a missing or
  unapproved artist; ignored on other procedures (templates, items); pins made while acting are
  approved at once and logged under the admin; the assistant's conversations are the admin's own
  per artist.
- Artist app: nav entry and its lit state; the picker's URL handling.
- `pnpm typecheck && pnpm lint && pnpm test`.

## Not in this plan

- Acting on anything but the map (items, wallet, settings); acting on pending or banned artists.

## Built (2026-11-13)

- API: `Context.actAs` (from `x-acting-artist`), `actingArtistProcedure` in `trpc.ts`; the pins,
  hotspots, layers, shapes and agent routers use it; `createPin` is live while acting. Tests:
  `artist-acting.test.ts` (7): works for an admin, refused for a non-admin or a missing or unapproved
  artist, header ignored on templates, own artist when the header is absent or names themselves,
  pins live at once, activity actor is the admin.
- Artist portal: `lib/acting-trpc.tsx` (own query cache and header), `features/pins/acting.tsx`
  (who is being acted for), `features/admin/maps-view.tsx` and `/admin/maps` (artist picker in the
  map's toolbar, "Acting as <name>", kept in `?artist=`, fresh map and layer choice per artist),
  "All maps" in the Admin group. `PinsMap` gained a `toolbarStart` slot. While acting: the forms
  and cards show no template picker, Save as template or Full page link; the pin card's QR sheets
  carry the artist's name; the assistant is the artist's (conversations are the admin's own per
  artist).
- Known limits: the Fill with AI box on the forms uses the admin's own allowance, and the artist's
  name there comes from the admin's own profile. Not tried in a browser.
