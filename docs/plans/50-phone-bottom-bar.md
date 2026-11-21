# 50 · Phone bottom tab bar

**Status: built 2026-11-13. No migration.**

Last of the map and AR upgrades that follow wadzzo (queue: 42–49 built).

## How wadzzo did it (read 2026-11-13: marketplace `mobile-tabs.tsx`, brand `mobile-nav.tsx`, `ar-tab-button.tsx`, AR `AppShell`/`arcade.css`, commit `1a4d7eb9`)

- **Phone bar** (marketplace and brand portal): one bar flush with the bottom and both sides, rounded
  on top only, in the sidebar's colour (`side-scope`: green on light, ink on dark), with a soft upward
  shadow and the safe-area inset in its own padding. Four tabs and, in the middle, a **raised round AR
  button** that opens the AR app. The active tab gets an ink capsule that glides across; labels are
  8.5px bold caps.
- **AR key:** an ink disc lifted out of the bar, viewfinder corners closing on "AR", a spinning arc just
  inside its rim, a sonar ring and a small hop every ~5.5 s (still for people who prefer reduced
  motion).
- **Phone header** (brand portal, marketplace): logo and wordmark, then notifications, your profile
  and a **Menu** button; Menu opens the whole sidebar as a drawer from the right (sections, balance,
  footer). The brand portal also has a Create "+" there.
- **AR app:** content runs under the bar; each scroll list ends with a spacer the bar's height
  (`--ar-tabbar-space`); the map's nearby rail sits above the bar.

## Action Tokens today

- Fan app, artist portal and Studio each have a plain bar: surface colour, top border, equal tabs
  (fan app 5, Studio 5, portal 4 and "More" which opens a bottom sheet). The portal has no phone
  header; Studio's header has the logo and a coins pill; the fan app's has logo, search and account.
- AR's bar already matches wadzzo's (raised launcher). Its content stops above the bar
  (`pb-[80px]`), and its nearby rail uses a fixed offset.

## Decisions (your answers, 2026-11-13)

| Question      | Answer                                                                                                                       |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Bar style     | Wadzzo's bar on the fan app, artist portal and Studio                                                                        |
| Fan app tabs  | Home, Collection \| **AR** \| Marketplace, Playlists                                                                         |
| Artist portal | Follow wadzzo's small-device layout: a header with Menu, and Map, Store \| **AR** \| Bounties, Pins                          |
| Studio tabs   | Create, Library \| **AR** \| Artist (opens artist.action-tokens.io), Coins                                                   |
| AR            | Bar unchanged. Content runs under the bar; lists end with a spacer; the nearby rail sits above the bar (`--ar-tabbar-space`) |

"Store" in the portal is the Items page (what an artist sells) and "Pins" is Pin management.

## What gets built

### Shared (`packages/ui`)

- `patterns/phone-tab-bar.tsx`: `PhoneTabBar` takes `tabs` (left two, right two), the AR key in the
  middle, and renders the flush rounded bar. The sliding capsule is plain CSS (a fixed-width slot per
  tab and a translated indicator), so no animation library is added. Tabs may be links or external
  links (the Studio "Artist" tab); a tab may carry a dot (unused for now).
- `patterns/ar-tab-button.tsx`: `ArTabButton` (disc, corners, spinning arc, ping and hop).
- `styles/theme.css`: the `ar-hop`, `ar-ping`, `ar-spin` keyframes (still under reduced motion) and
  `--phone-bar-space` (the bar's height plus the safe area) for pages to pad against.
- The bar uses `side-scope` colours; it sits at `z-40`, hidden from the `sm` breakpoint up.

### Fan app (`apps/app`)

- `nav.ts`: `MOBILE_TABS` becomes left Home, Collection and right Marketplace, Playlists.
- `app-shell.tsx`: the old grid nav is replaced by `PhoneTabBar`; the player bar still sits directly
  above it. The page's bottom padding follows the new bar height.

### Artist portal (`apps/artist`)

- `nav.ts`: `phoneTabs` returns left Map, Items ("Store") and right Bounties, Pin management ("Pins");
  an entry the artist can't open yet (portal in onboarding or admin-only) is swapped for the next one
  that is allowed, as wadzzo does.
- `portal-shell.tsx`: a phone header (`sm:hidden`): the portal's wordmark, the notifications bell
  (with its unread dot), the account button and **Menu**. Menu opens the sidebar's sections as a right
  drawer (the content of today's "More" sheet: account, notifications, settings, every group). The
  "More" tab goes. Signed out: the header shows the wordmark and Sign in, and the bar is hidden as
  today.
- No Create "+" (the portal has no create hub today); not added without your say.

### Studio (`apps/studio`)

- `nav.ts`: `PHONE_TABS` becomes Create, Library | AR | Artist (external, `ARTIST_URL`), Coins.
- `studio-shell.tsx`: the bar is `PhoneTabBar`. The Image and Music tools stay in the sidebar/menu
  and on the Create page. Header unchanged.

### AR (`apps/ar`)

- `AppShell`: the reserved `pb-[80px]` goes; `<main>` gets `ar-tabbed`, which defines
  `--ar-tabbar-space` and ends each outer `.ar-scroll` pane with a spacer of that height.
- Map: the nearby rail's bottom offset uses `--ar-tabbar-space`.
- The bar's look and the camera launcher are untouched.

## Tests

- `PhoneTabBar` rendered to markup: two tabs each side around the AR key (labelled "Go to AR"), the
  active tab marked `aria-current` and the capsule at its slot, an external tab is a plain link,
  hidden on `sm` and up.
- Fan app: the four tabs and their active state (`Marketplace` on an item page); portal: the
  allowed-tab swap for an artist in onboarding and for an admin, the mobile header's Menu; Studio:
  the Artist tab links out and is never "active".
- AR: `AppShell` with tabs carries `ar-tabbed` and no fixed bottom padding.
- `pnpm typecheck && pnpm lint && pnpm test`.

## Not in this plan

- A Create "+" in the portal header; changing the fan app's or Studio's headers; the AR bar's look;
  badges on tabs (the dot prop exists but is unused); drawer for the fan app and Studio (they keep
  their own sidebars).

## Built (2026-11-13)

- `packages/ui`: `PhoneTabBar` (flush rounded bar in the sidebar colours; a CSS-only gliding capsule
  over fixed slots) and `ArTabButton` (hop, ping, spinning arc; still under reduced motion);
  `bc-hop`/`bc-ping`/`bc-spin` keyframes and `--phone-bar-space` in `theme.css`. The package's tests
  now include `.tsx` (`phone-tab-bar.test.tsx`).
- Fan app: Home, Collection | AR | Marketplace, Playlists; the player bar sits above the bar.
- Artist portal: phone header (wordmark, bell with unread dot, round account button, Menu) and the bar
  Map, Store | AR | Bounties, Pins; Menu opens the old "More" content as a right drawer (it keeps the
  portal's own surface styling, not the sidebar colours). `AccountButton` gained a `compact` mode.
  `phoneTabs` swaps tabs not open yet for the next allowed entry; the `tab` flag is gone from the nav.
- Studio: Create, Library | AR | Artist (opens artist.action-tokens.io), Coins; header unchanged.
- AR: bar unchanged; `AppShell` content runs under it (`ar-tabbed`, `--ar-tabbar-space`, list spacer)
  and the map's nearby rail sits above the bar by that variable.
- Tests: `phone-tab-bar.test.tsx`, fan app and portal `nav.test.ts`, Studio `nav.test.ts`,
  `AppShell.test.tsx`.
- Not tried in a browser or on a phone. The AR key opens `NEXT_PUBLIC_AR_URL` (default
  https://www.action-tokens.io) in the same tab. Signed-out portal: the header and bar still show.
