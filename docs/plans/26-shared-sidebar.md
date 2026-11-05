# 26 — One sidebar for the marketplace and the artist portal

The marketplace and the artist portal had two different sidebars. Both now use
one frame, styled like Wadzzo's sidebar.

## Decisions (2026-11-05)

- **Look:** Wadzzo's sidebar.
- **Code:** one shared frame in `packages/ui` (`patterns/side-frame.tsx`);
  each app passes its own links, header buttons, balance card and footer
  links.
- **Width:** as in Wadzzo: 19.5rem open, 5.25rem as a rail. A chevron on the
  sidebar's edge folds it, and the choice is remembered per browser. Below
  the xl breakpoint it is always the rail. This replaces the marketplace's
  drag-to-resize on the left; the right panel keeps its handle.

## Colours

New tokens, scoped to `.side-scope`:

|                                     | Dark mode                 | Light mode           |
| ----------------------------------- | ------------------------- | -------------------- |
| `side` (the block)                  | chartreuse `#dbdc2c`      | ink `#16170f`        |
| `side-ink` (text, circles)          | `#1b1c05`                 | pale `#f3f4ea`       |
| `side-mint` (current page, accents) | pale chartreuse `#f6f7c9` | chartreuse `#dbdc2c` |

New utilities: `blob` (uneven corners) and `dash-rule` (long-dash separator).

## Layout

- **Header:** logo on an ink blob, "Bandcoin" with the handwritten app name;
  round ink buttons (Search and the bell in the marketplace, the bell in the
  portal).
- **Body**, between dashed rules: `*group*` labels, big display-font links
  with an arrow in an ink circle (current page: scribbled underline, pale
  circle), launch tiles to the other apps, then the balance card.
- **Footer:** the dark profile row (opens the wallet dialog, Settings, sign
  out), the theme switch and socials, then the info links and copyright.
- **Rail:** ink circles with tooltips, a wallet blob, and the avatar.

The big words (title, links, tiles) follow Wadzzo's height: uppercase at
Wadzzo's sizes (title 1.9rem, links 2.15rem in the marketplace and 1.7rem in
the portal) with tight lines, and Unbounded, about twice as wide as Anton, is
squeezed sideways (`TallText`) so they fit. Nothing is cropped.

## Tests

- The saved fold state: read, save, and a broken or missing value means open.
