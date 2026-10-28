# 06 · Design system (`@bandcoin/ui`)

**Approval gate:** before any app uses it, I publish one preview page with everything below, in dark and light, at desktop and phone width.

## Direction

A music store you want to spend time in: dark first, album art provides the color, the UI chrome stays quiet. Light mode is equally polished. It stays light on the GPU: no big blur layers or constant animation.

## Tokens (CSS variables, Tailwind 4 `@theme`)

- **Color:** neutral surfaces (`--bg`, `--surface`, `--surface-raised`, `--border`), text (`--fg`, `--fg-muted`), one brand accent (Bandcoin chartreuse #dbdc2c from the guitar-pick logo; a deep olive `primary-text` for accent text in light mode), plus `--success`, `--warning` and `--danger`. Contrast is tested to WCAG AA in both themes.
- **Dynamic accent:** item and artist pages pick up the cover's dominant color (stored as `accentColor` at upload), used only for the hero glow and the play button.
- **Spacing:** one 4px scale. Layout primitives (`Stack`, `Inline`, `Grid`, `Section`, `PageContainer`) so pages never hand-pick margins.
- **Radius and shadow:** 3 radii and 3 elevation levels.
- **Motion:** 150 / 250 / 400 ms, one easing curve. `prefers-reduced-motion` turns off non-essential motion.

## Fonts (self-hosted with `next/font`, no layout shift)

| Use | Font | Why |
|---|---|---|
| Display (headings, hero) | **Unbounded** | Wide, bold and modern; fits music and web3 |
| Text (UI, body) | **Onest** | Very readable at small sizes, a little warmer and less generic than Inter |
| Numbers (prices, balances, durations) | **JetBrains Mono** | Digits line up in breakdowns and tables |

You can swap these in the preview before we lock them in.

## Boot and loading

- **Boot screen** (first visit only, ≤ 600 ms, never blocks the server-rendered content behind it): the Bandcoin mark draws in on an equaliser pulse, then fades into the page. Repeat visits skip it.
- **Route loading:** every route has `loading.tsx` with **skeletons shaped like the real content** (item grid, track list, artist header). No spinners for page loads.
- **Inline loading:** buttons show their own pending state; images fade in over a blurred placeholder (`plaiceholder` at upload).
- **Empty and error states:** one `EmptyState` / `ErrorState` pattern with an illustration, one sentence, and one action.

## Components

**Primitives:** Button, IconButton, Input, Select, Textarea, Switch, Checkbox, Tabs, Dialog, Sheet, Drawer, Popover, Tooltip, Badge, Avatar, Skeleton, Toast.

**Patterns:** PageHeader, Section with "See all", MediaCarousel (snap scrolling, arrows on desktop, swipe on mobile), ItemCard, TrackRow, ArtistCard, PriceTag, **PriceBreakdown**, QuantityStepper, **BuyPanel**, TierGate ("Hold 10 $ARTIST, you have 3: Buy token"), **TransactionToast** (countdown + Cancel), PlayerBar, NowPlayingSheet, RightPanel, MobileTabBar, EmptyState, ErrorState, StatCard, DataTable, Dropzone.

## Shell (all web apps)

Left sidebar (collapsible), top bar with search and wallet, a **contextual right panel** (now playing, the artist's other items, nearby pins, and so on, per page), and a persistent player bar. On phones: a bottom tab bar, drawers instead of side panels, and a sticky buy bar on item pages.
