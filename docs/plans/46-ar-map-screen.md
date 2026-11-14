# 46 · AR map screen redesign

**Status: built 2026-11-13. No migration.**

Fifth of the map and AR upgrades that follow wadzzo. Queue after: 47 map style sheet, 48 theme,
49 AR marketplace tab, 50 phone bottom tab bar (which also sets `--ar-tabbar-space`).

## How wadzzo did it (read 2026-11-13, commits `ed34da78`, `d2063cff`, `59ced798`, `e45aae27`)

- **Top row:** the All / Following filter leads, then search, then the profile on the right. The GPS
  "Live" pill is gone (with no fix the location gate covers the map anyway).
- **Profile capsule:** the avatar becomes one glass capsule holding the platform-token balance
  (signed in), all of it opening the profile. Under it, right-aligned glass pills with the icon and
  label on one line: Events, then Bounty (with a dot when a win or reply waits).
- **Control rail:** one glass capsule on the right edge: recenter (which also refreshes the pins,
  with a spinning ring while it does and a "Pins up to date" toast), compass map, a 2D/3D button
  that names the mode it switches to, and Layers. No murals or auto-collect buttons and no separate
  refresh.
- **Murals on map** (All / Verified / Off) is a three-way setting in Profile › Settings, saved on the
  device. **Auto-collect is on by default** (people who already saved their settings keep theirs).

## Bandcoin today

The top row is GPS pill, search, filter, a notifications bell, then the avatar with an Events
button under it. The rail is a recenter+refresh capsule, then separate round buttons for
auto-collect, compass, 2D/3D, murals and Layers (plan 42 added Layers). Murals are cycled by a map
button and kept in page state; auto-collect is off by default.

## Decisions (your answers, 2026-11-13)

| Question        | Answer                                                                                          |
| --------------- | ----------------------------------------------------------------------------------------------- |
| Balance         | The BANDCOIN balance, as on the Profile page                                                    |
| Bell            | Keep it, left of the profile capsule                                                            |
| Bounty dot      | Events and Bounty pills without a dot for now                                                   |
| Everything else | Follow wadzzo: no GPS pill, one control capsule, murals in Settings, auto-collect on by default |

## What gets built (all in `apps/ar`, no API or database change)

- **Top row:** filter first (`mr-auto`), search, bell, then the profile capsule. The GPS pill and its
  explainer go; `LocationGate` already covers a missing fix and keeps its reasons.
- **`ProfileButton`:** a `balance` mode (signed in): coin icon, the BANDCOIN balance (compact above
  100,000, a short skeleton while loading, "-" if it can't be read; same `account.me` query as the
  Profile page, cached 30 s) and the avatar, in one capsule opening the profile. Used on the map
  only; other screens keep the plain avatar.
- **Pills under the capsule:** a `HudShortcut` (icon and label on one line, right-aligned): Events
  (`/events`) and Bounty (`/bounty`), no dot.
- **`MapControls`:** one glass capsule with dividers: recenter and refresh (spinning ring while
  refreshing, toast "Pins up to date"), compass map, 2D/3D (shows the mode it switches to, from the
  map-mode store), Layers (the plan 42 button, in a bare variant for the capsule). Props shrink to
  `onRecenter`, `compassMode`, `onToggleCompass`, `following`, `refetching`, `layers`. The auto-collect,
  murals and refetch buttons and `MapModeButton`'s round look are removed from the rail (the 2D/3D
  button text stays; the component gains a `bare` variant, kept for the plan 47 style sheet).
- **Murals on map:** `useMuralLayer` (persisted, key `bandcoin-ar-mural-layer`, default "all") and a
  three-way "Murals on map" row in Profile › Settings, before the toggles' list ends; the map reads
  it and the cycle button and its toasts go.
- **Auto-collect:** on by default in `DEFAULT_SETTINGS`. Anyone who already saved their settings
  keeps their choice; Profile › Settings still has the switch (and a requireAuth gate is no longer
  needed on the map).
- **Recenter:** refreshes the pins too (the old refetch button's job).
- The nearby rail's bottom offset keeps today's value for now; plan 50 moves it to the tab bar.

## Tests

- `ProfileButton` balance formatting (compact/standard, missing) as a pure helper; the mural
  layer store (default, set, persists across a re-read); `DEFAULT_SETTINGS.autoCollect` is true and
  a saved `false` survives merging with defaults; `MapControls` and `HudShortcut` rendered to markup
  (rail has recenter, compass, 2D/3D naming the other mode, Layers; no auto-collect or murals
  buttons; refreshing shows the busy ring).
- `pnpm typecheck && pnpm lint && pnpm test`.

## Not in this plan

- The Bounty dot; the map style sheet and terrain (47); theme (48); marketplace tab (49); the bottom
  tab bar (50).

## Built (2026-11-13)

- `apps/ar`: top row (filter, search, bell, profile capsule with Events and Bounty pills under it; GPS
  pill removed), `ProfileButton` balance mode (`account.me`, `lib/ar/balance.ts`), `HudShortcut`,
  `MapControls` as one capsule (recenter and refresh, compass, 2D/3D, Layers in a bare variant),
  `lib/ar/mural-layer.ts` and the "Murals on map" row in Profile › Settings, auto-collect on by
  default. `MapModeButton` stays for the directions page.
- Tests: `balance.test.ts`, `map-settings.test.ts`, `MapControls.test.tsx` (rendered to markup).
- Not tried in a browser. The nearby rail still sits at the screen bottom; plan 50 moves it.
