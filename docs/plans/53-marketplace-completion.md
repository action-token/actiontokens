# 53 · Completing the marketplace app (`apps/app`)

**Status:** started 2026-11-22. Owner asked to "complete the marketplace app" and picked all four parts
below. Work them in this order; tick the boxes as each lands and commit after each step (no co-author
lines, see the memory rule).

## Where it stands (2026-11-22)

- `apps/app` (port 3000) is the forked fan app with names changed: dark neon look of its own, a sidebar
  built on `packages/ui/patterns/side-frame.tsx`, only `theme.css` + a small `globals.css`.
- The org portal (`apps/org`) has the new Action-Tokens look in `apps/org/src/styles/portal.css`
  (1980 lines): tokens `--gx-*` / `--bc-*` for Dark and Light (lines 1–537 are generic: type, cards,
  buttons, fields, badges, tabs, overlays, tables, wallet header, motion, backdrop), its own sidebar
  ("control deck", `apps/org/src/features/shell/sidebar.tsx` + CSS lines 538–823), and the
  landing/tour (org only).
- Backends already done, no fan UI: communities (`api.community.*`, 30 procedures incl. `post.*`,
  `comment.*`), holder rewards (`api.reward.mine`; admin `admin.rewards.*`, `admin.telegram.*`).
- About 40 visible texts in `apps/app` still say "Artist".

## 1 · Organization wording

Visible text says "Organization(s)" (short: "Orgs"), never "Artist". Routes, code ids, props and the
`artist` API keep their names. Murals keep "artist".

- [x] Find every visible string: JSX text, `aria-label`, `title`, `placeholder`, metadata titles and
      descriptions, toasts, empty states, nav labels (`features/shell/nav.ts`), legal/info pages.
- [x] Replace; keep grammar ("an organization's"), keep `/artist/...` URLs.
- [x] Tests that assert labels (`nav.test.ts` etc.) updated.

## 2 · The org portal look in the marketplace

One look across both apps, from shared code.

- [ ] Move the generic part of `portal.css` (tokens through backdrop) to
      `packages/ui/src/styles/gx.css`; `portal.css` imports it and keeps sidebar/landing/tour.
      Org must look identical afterwards (screenshot compare: dashboard, a form, a table, wallet,
      dark + light).
- [ ] `apps/app/src/styles/globals.css` imports `gx.css`.
- [ ] The control-deck sidebar: move to `packages/ui` (props: groups, header tools, footer, balance
      card, signed-in state), CSS with it; org and app both use it. The app keeps its extra tools
      (search, bell, now-playing rail, right panel, player bar).
- [ ] Theme control (Light / Dark / System) the same as org; Light must be checked on every page.
- [ ] Re-check marketplace pages in both themes and at 390px: home, marketplace, item, organization
      page, bounties, collection, wallet, settings, music/player.
- [ ] Notch: decide with the owner whether the marketplace gets one (org has it only signed out).

## 3 · Communities (fan screens)

Over `api.community.*` (see `packages/api/src/routers/app/community.ts`).

- [ ] Nav entry "Communities" (Browse group).
- [ ] `/communities`: list + trending + mine, search.
- [ ] `/communities/[id]`: cover, profile, description, gate (requirements, AND/OR, your balance from
      `community.gate`), Join / Leave, members (respects `memberListVisibility`), activity.
- [ ] Posts: list, create (if `postPermission` allows), edit/delete own, like; comments with replies,
      delete own.
- [ ] Invite (search users), notification switches (`notifySettings` / `setNotifySettings`).
- [ ] Create / edit / delete a community (title, description, cover, profile picture, gate builder
      with `searchAssets`, visibility, who can post).
- [ ] Notification inbox links already go to `/communities/:id`: check they land.

## 4 · Holder rewards

- [ ] Fan: a Rewards page (from wallet or collection) over `api.reward.mine`: rounds, your share,
      paid / pending, Stellar links.
- [ ] Admin (org portal `/admin/rewards`, `/admin/telegram`) over `admin.rewards.*` /
      `admin.telegram.*`: rounds, set pot, sync, distribute (confirm dialog), blocked list.
- [ ] Real payout dry-run still needs `MOTHER_SECRET`, `REWARD_*` env and a funded testnet payer from
      the owner. Never run `distribute` against mainnet without the owner.

## Not in this plan

3D gallery app (F7 gallery port) is separate.

## Checks for every step

`npx prettier --write`, `npx tsc --noEmit`, `npx eslint src --quiet`, `npx vitest run` in the
touched apps/packages; look at the pages in the browser (dev: `pnpm dev:app` → :3000,
`pnpm dev:org` → :3001; local DB `pnpm db:up`).
