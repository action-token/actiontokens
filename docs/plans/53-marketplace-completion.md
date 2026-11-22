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

- [x] Move the generic part of `portal.css` (tokens through backdrop) to
      `packages/ui/src/styles/gx.css`; `portal.css` imports it and keeps sidebar/landing/tour.
      Org must look identical afterwards (screenshot compare: dashboard, a form, a table, wallet,
      dark + light).
- [x] `apps/app/src/styles/globals.css` imports `gx.css`.
- [x] The control-deck sidebar: move to `packages/ui` (props: groups, header tools, footer, balance
      card, signed-in state), CSS with it; org and app both use it. The app keeps its extra tools
      (search, bell, now-playing rail, right panel, player bar).
- [ ] Theme control (Light / Dark / System) the same as org; Light must be checked on every page.
- [ ] Re-check marketplace pages in both themes and at 390px: home, marketplace, item, organization
      page, bounties, collection, wallet, settings, music/player.
- [x] Home page after the owner's prototype `docs/mockups/home.html` (2026-11-23): see "Home page" below.
- [ ] Re-check the other marketplace pages in the new look (Light, Dark, 390px).

### Home page (done 2026-11-23)

`apps/app/src/features/home/home-front.tsx` (+ `home-notch.tsx`, `styles/home.css`), data from
`catalog.home` (now also `drops` with supply / sold / saleEndsAt, and organizations with `bio`,
`coverUrl`, `token {code, slug, price}`, `following`, `subscribed`) and `community.trending` (now with
`requiredBalance`, sent as text). Sections: notch (search, balance or Sign in, bell, a real new drop or
bounty dropping down every 4 s), scroll hero "Take Action." (shared `ScrollHero`, frames copied to
`apps/app/public/landing/frames`), neon ribbon, Live drops (edition, copies left, countdown when the
sale ends), Bounties as Wanted posters, Organizations (fan token price, drops, crew, Follow, Buy),
Crews (gate text, "you have N" when signed in), Hear it (music rows, only when there are songs),
Explore (AR map; the gallery card shows only when `NEXT_PUBLIC_GALLERY_URL` is set).
**Left out on purpose (no data behind them):** top collectors, a public activity feed, token price
history (sparklines), XP / levels. Each needs a backend first; ask the owner.
Shared pieces now in `packages/ui`: `styles/gx.css` (look + sidebar + neon button),
`styles/landing.css` (hero, ribbon, section titles, reveal, notch), `patterns/control-deck.tsx`
(`ControlDeck`, `DeckVault`), `patterns/scroll-hero.tsx`, `patterns/theme-control.tsx`,
`patterns/portal-backdrop.tsx`.
**Local dev DB note:** `actiontokens_dev` had drifted from the regenerated init migration (missing
community `hiddenAt`/`hiddenReason`, gallery, rewards and Telegram tables, 6 notification types); the
additive diff was applied to the local Docker database only. Neon / production were not touched.

## 3 · Communities (fan screens)

Over `api.community.*` (see `packages/api/src/routers/app/community.ts`). Code in
`apps/app/src/features/community/*`, styles in `apps/app/src/styles/community.css` (`cm-*`).

- [x] Nav entry "Communities" (Browse group).
- [x] `/communities`: All crews (Biggest / Newest, search, load more) and My crews. Trending is not
      shown yet (`community.trending` exists).
- [x] `/communities/[id]`: cover, profile, owner, counts, description, gate panel (each token, your
      balance and verdict from `community.gate`), Join / Leave, Members (owner can remove), Activity.
- [x] Posts: list, composer (when `postPermission` allows), like, delete own / owner; comments with
      one level of replies, delete. Editing a post is not built yet (`post.update` exists).
- [x] Invite dialog (`searchUsers` → `invite`), notification switches dialog.
- [x] Create / edit / delete on ONE page (owner asked for one step) with a live preview beside it:
      banner + picture upload (`account.imageUpload`) or pasted address, name, description, who sees
      members, who posts, token gate (Stellar search via `searchAssets`, or code + issuer checked
      with the new `community.checkAsset`; amount 0 = trustline only; all / any). Ideas taken from
      actionverse `create-community-modal.tsx`.
- [x] `community.byId` now returns plain-string balances (`withPlainBalances`); superjson has no
      Decimal.
- [ ] Notification inbox links already go to `/communities/:id`: check they land.

## 4 · Holder rewards

- [x] Fan: `/rewards` "Reward checker" (Library nav), four tabs as in actionverse `/reward-checker`,
      tab + wallet kept in the address: - Checker: program cards, Your rewards (`reward.mine`: paid / pending totals, rounds, blocked
      note), Check a wallet (`reward.check`, public: tokens from the chain, this month / quarter
      standing, its rounds). - Asset holders: token search (signed in) or code + issuer → `reward.holders` (top 200). - Origin / Quarter rewards: round picker (`reward.rounds`) → ranked table
      (`reward.leaderboard`: holding, share, paid, blocked), wallet search, "Find me", pages of 50.
      Clicking a wallet opens it in Checker. - Services in `packages/api/src/services/rewards/public.ts`; tests `reward-checker.test.ts`.
- [ ] Admin (org portal `/admin/rewards`, `/admin/telegram`) over `admin.rewards.*` /
      `admin.telegram.*`: rounds, set pot, sync, distribute (confirm dialog), blocked list. The old
      checker's Sync / Download buttons belong here.
- [ ] Real payout dry-run still needs `MOTHER_SECRET`, `REWARD_*` env and a funded testnet payer from
      the owner. Never run `distribute` against mainnet without the owner.

## Not in this plan

3D gallery app (F7 gallery port) is separate.

## Checks for every step

`npx prettier --write`, `npx tsc --noEmit`, `npx eslint src --quiet`, `npx vitest run` in the
touched apps/packages; look at the pages in the browser (dev: `pnpm dev:app` → :3000,
`pnpm dev:org` → :3001; local DB `pnpm db:up`).
