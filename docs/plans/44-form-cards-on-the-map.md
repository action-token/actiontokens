# 44 · Form cards on the map

**Status: built 2026-11-13. No migration.**

Third of the map and AR upgrades that follow wadzzo. Queue after: 45 admin All maps, 46 AR map
screen, 47 map style sheet, 48 theme, 49 AR marketplace tab, 50 phone bottom tab bar.

## How wadzzo did it (read 2026-11-13, `docs/layers/README.md` and the code)

New pin, edit pin, new hotspot and edit hotspot open as a floating card on the left of the map
(like its trail builder) instead of going to a page. The same page components are used: a context
(`FormCard`) tells `FormPage` and `FormSection` to draw as a card (header with the title and a
close button, tabs, the fields scrolling, the actions below, flat sections) and the form to take its
spot from map clicks, close instead of navigate, and leave out the side map. Every tab stays
mounted, so nothing typed is lost; after Save, a problem on another tab opens that tab. A click on
the map starts a new-pin card there, or moves the pin of an open card. A small zustand store says
which card is open and where the pin goes. A new-pin card starts from the last pin made in a card
(everything but its spot and layer), with Clear, kept for the session. The full pages stay and take
`?layer=`.

## Bandcoin today

Clicking the Pins map goes to `/pins/new?lat=&lng=`, "New pin" and "Draw hotspot" go to pages,
and Edit in a pin's card goes to `/pins/[id]`. `FormPage` (in `packages/ui`) has no card mode.

## Decisions (your answers, 2026-11-13)

| Question  | Answer                                                                              |
| --------- | ----------------------------------------------------------------------------------- |
| Forms     | All four: new pin, edit pin, new hotspot, edit hotspot                              |
| Map click | Opens a new-pin card there; with a card open, a click moves the pin                 |
| Last pin  | A new-pin card starts from the last pin made in a card, with Clear; this visit only |

## What gets built

### `packages/ui` (shared, used by every form page)

- `patterns/form-card.tsx`: `FormCardProvider`, `useFormCard()` (`onClose`, `onDone`, `at`,
  `layerId`). Nothing changes for pages without a provider.
- `FormPage`: with a card, draws the card layout (header with title, an optional header action and
  close; optional tabs; scrolling body; actions below). The page's `aside` is left out in a card.
  `FormSection`: flat in a card, with an optional `tab`. New `CardTab` for things that aren't a
  section. Tabs stay mounted (only hidden); after Save, the tab with a problem opens. Sections
  without a `tab` show on every tab.

### Pin and hotspot forms (`apps/artist`)

- New-pin form in a card: spot from `card.at` (map clicks move it), layer from the card, close and
  done close the card, cancel closes it. Tabs: **Details** (Fill with AI, title, description,
  picture, type, link), **Rules** (who can collect, reward, schedule, more options), **Look** (pin
  look and layer). The template picker sits in the card header; Save as template stays in the
  actions. The side map and spots list are left out.
- Edit-pin form in a card: the same tabs; a map click moves nothing (a pin's place is fixed);
  "Full page" in the header opens `/pins/[id]` (spots list, delete).
- Hotspot forms in a card: tabs **Details**, **Schedule**, **Look**. A new hotspot card opens as
  soon as an area is drawn on the map and keeps that area; an edit card keeps the stored area.
  "Full page" opens `/hotspots/[id]` (redraw the area, drop now, pause, delete).
- After a save the card closes and the map's pins and hotspots refresh.

### Pins › Map

- `features/pins/map-form-card.ts`: which card is open (`newPin`, `editPin`, `newHotspot`,
  `editHotspot`) and the spot last clicked.
- A click on an empty spot opens a new-pin card there (a click on a hotspot area still opens that
  hotspot); with a pin card open, a click moves the pin. "New pin" opens the card and a banner says
  "Click the map where the pin goes". "Draw hotspot" finishes into a new-hotspot card. Edit in a
  pin's or hotspot's card opens the edit card. The card sits on the left (a bottom sheet on a
  phone); the toolbar moves over and the create buttons step aside while it's open. Leaving the
  map closes it.
- `features/pins/last-pin.ts`: the last pin made in a card (as template data, in memory). The next
  new-pin card applies it; Clear starts blank, keeping the spot and layer.
- The full pages stay (`/pins/new`, `/pins/[id]`, `/hotspots/new`, `/hotspots/[id]`) and still take
  `?lat=&lng=&layer=&template=`; Templates › Use and Duplicate still go to them.

## Tests

- `FormPage` and `FormSection` in card mode (`packages/ui` has no test runner, so these are tested in
  the artist app): card layout vs page layout, tabs hide but stay mounted, a problem on another
  tab opens it, the aside is left out.
- Map-form-card store; last pin remembers everything but spot and layer, and Clear drops it.
- The new-pin form in a card takes its spot from `at`; saving calls `onDone`.
- `pnpm typecheck && pnpm lint && pnpm test`.

## Not in this plan

- Redrawing a hotspot's area inside its edit card; the admin All maps (plan 45); trails.

## Built (2026-11-13)

- `packages/ui`: `patterns/form-card.tsx` (`FormCardProvider`, `useFormCard`, with `restart`);
  `FormPage` draws as a card (header, tabs, scrolling body, actions) and leaves out its aside;
  `FormSection` and `MoreOptions` are flat in a card and take a `tab`; new `CardTab`. Page and card
  bodies are container-query containers, so the forms' two-column grids use `@md:` and stay one
  column in the 380 px card (the pin look editor uses `@2xl:`).
- Artist app: `features/pins/map-form-card.ts`, `last-pin.ts`; the pin and hotspot forms in card
  mode (tabs Details, Rules, Look; spot and layer from the map; close or done close the card;
  template picker or "Full page" in the header; Clear on a card started from the last pin); Pins ›
  Map opens the card on a map click, New pin, Draw hotspot (when the area is finished) and Edit
  in the pin and hotspot cards. The toolbar moves over, the legend and in-view list step aside,
  leaving the map closes the card. The full pages still work.
- Tests: `form-card.test.tsx` (card vs page layout, rendered to markup, since the repo has no DOM
  test library), `map-form-card.test.ts` (store and last pin).
- Not tested: the new-pin form taking its spot from a click and calling `onDone` (needs a DOM test
  setup). Not tried in a browser.

## Changes after browser testing (2026-11-13, your notes: "follow wadzzo")

- **Tabs** are now Details, Look, Collect, Schedule, in Wadzzo's order (was Details, Rules, Look).
  "Who can collect it" and the "More options" group (collect mode, type, link, event, tags) are on
  Collect; Schedule is its own tab. A save that fails on another tab still opens that tab.
- **Fill with AI** is compact in a card: one-line prompt, smaller heading, a single example, so the
  title field shows on the first screen.
- **Zoom buttons** move to the bottom-right while a card is open (the card covers the bottom-left).
- **The pin on the map:** after a click (or when moving a pin) the map draws the pin at that spot in the
  look the Look tab has chosen so far (shape, colour, picture, badge), updating live. It was a missing
  marker before. The store keeps this as `draft`, cleared when the card closes or reopens.
- Not tried: hotspot cards (their tabs are unchanged), phone width.

## Card redesign (2026-11-13, your note: the card looks plain; tabs stay Details, Look, Collect, Schedule)

- **Live pin header:** a strip under the title with the pin as the map draws it (shape, colour, picture),
  its title so far, and chips for who can collect it, what it gives and when it runs. It follows the
  form live. (`pin-card-summary.tsx`; `FormPage` takes `cardSummary`.)
- **Boxed sections:** in a card, each section is its own rounded box with an icon badge and a bold
  title (`FormSection`, `MoreOptions` in card mode, so the hotspot card gets it too).
- **Back / Next:** for a new pin the footer walks Details, Look, Collect, Schedule ("Next: Look" and so
  on, Back on later tabs); Create pin and Template appear on the last tab. Editing a pin keeps its
  Save changes button on every tab. Details and Schedule get a tick when their required part is filled
  in (a title of 3 letters or more; an end that is after the start). `cardSteps`, `cardTabDone`.
- **Schedule tab:** four quick-pick cards (Today, This weekend, 1 week, 1 month, counted from the start
  or now; "This weekend" is left out on a Sunday), a plain-words line ("Live now until Sun, Nov 15,
  11:59 PM · 2 days"), then the exact dates. The full page keeps its "Run it for" buttons.
  (`schedule-quick.ts`, tested.)
- Checked in the browser, all four tabs. Not tried: the hotspot card's new boxes, phone width.

## Hotspot drawing (2026-11-13, your notes: the drawing vanished; follow Wadzzo's finishing)

- **The drawn area stays on the map** while the New hotspot card is open (a dashed outline over the
  yellow area). It was only drawn while drawing, and the card has no map of its own. (`draftArea` in the
  card store; `DraftAreaLayer`.)
- **Finishing works as in Wadzzo** (`hotspots/area-draw.tsx`, used by the Pins map and the hotspot
  form's own map): every shape needs **Finish area** (off until the shape is big enough, green when
  ready; circle and rectangle no longer finish on the second click, a third click starts them over);
  a shape with 3+ corners shows a green "Click to finish" marker on its first corner; clicking near it,
  a double-click, Enter or the button close it. **Undo** (button, Backspace, ⌘Z), **Cancel** (button,
  Esc), the shape follows the mouse, under 10 m is refused ("make the area bigger"), over 50 km is
  warned, and a click below zoom 9 zooms in first. Tested in the browser (circle, shape, Backspace,
  Esc); pure parts have tests.
- Not done: redrawing the area from inside the card (cancel and draw again).
