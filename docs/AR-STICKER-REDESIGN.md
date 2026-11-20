# AR app redesign: "Street Sticker" (concept B)

On 2026-11-20 the owner picked concept **B · Street Sticker** from the layout review page
(`apps/ar/src/app/(bare)/review`, live at `http://localhost:3002/review`). The goal is an
ActionTokens look that is clearly different from Bandcoin, not just a recolour.

The reference is `apps/ar/src/app/(bare)/review/concept-sticker.tsx`. Match it.

## The language

| Element | Rule |
|---|---|
| Palette | Black `#050605` background, neon green `#4dff2a` accent, paper `#f2f7f2` for sticker faces. Rarity colours stay the same. |
| Type | Anton (`font-display` / `font-hud`), uppercase, for titles, buttons, tags and tabs. Onest (`font-sans`) for body text. |
| Outline | 3px solid black on light or green stickers, and 3px paper on dark cards. Never a 1px hairline as the main edge. |
| Shadow | A hard offset shadow with no blur: `4px 4px 0` black on green or paper, and `4px 4px 0` green on dark cards. No soft glows. |
| Tilt | Stickers and cards tilt by ±1–3°, alternating. Titles and labels tilt by ±2–3°. Inputs and long lists don't tilt. |
| Tape | A translucent paper strip (`.st-tape`) on featured cards. |
| Texture | A green halftone dot grid (`.st-halftone`) behind screens and over the map. |
| Press | A pressed sticker moves down and right by the shadow offset, and the shadow goes to 0. |
| Nav | A floating paper dock pill with a black outline, a green hard shadow and a big tilted green AR sticker in the middle. The active tab is a black circle with a green icon. |

## How it is applied

1. **Primitives:** `apps/ar/src/styles/sticker.css` is imported after `arcade.css` in
   `app/layout.tsx`. It redefines `.ar-key`, `.ar-key-primary`, `.ar-key-gold`, `.ar-key-danger`,
   `.ar-bevel`, `.ar-glass` and `.ar-tabbar-surface` in sticker style and adds the `.st-*`
   utilities. Every screen that uses these classes changes at once.
2. **Shell:**
   - `components/shell/BottomTabBar.tsx` becomes the floating dock.
   - `ScreenHeader` in `components/shell/AppShell.tsx` becomes a big Anton title with a tilted
     green eyebrow sticker.
   - `.ar-tabbed` spacing matches the dock's height.
3. **Shared UI:** `components/ui/SegmentedTabs.tsx`, `Badges.tsx`, `ArButton.tsx` and
   `BottomSheet.tsx` move to sticker style.
4. **Screens, in order:** collection, then map overlays (pins, nearby sheet, pills), profile,
   marketplace, artists, then the rest (bounty, events, murals, coins, notifications, scan/ar).

Business logic, data and routes don't change. Tests must stay green: run `pnpm --filter ar test`,
`tsc` and `eslint`.

## Naming

In ActionTokens, the people who drop items are **organizations**, not artists. User-facing text says
"Organization(s)", or "Orgs" where space is short. Routes (`/artists`) and code identifiers stay as
they are. Murals keep "artist", because street-art painters really are artists.

## Status

The status below is updated as each step lands.

- [x] 1 Primitives (`sticker.css`)
- [x] 2 Shell: the dock is wide and labelled (Map, Collection, AR, Market, Orgs), with an animated AR
  sticker (wobble, ping, turning dashed ring). `components/murals/PackBar.tsx` replaces the PackRing
  as the mural-download sticker bar above the dock. The header is restyled.
- [x] 3 Shared UI: SegmentedTabs, Chip, RarityPlate, StatusBadge, DetectionBadge, StatBlock,
  ArButton sizes and BottomSheet
- [ ] 4 Screens: collection, map, profile, marketplace, artists, rest
