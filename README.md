# Bandcoin

Music and collectibles on Stellar. Fans buy, sell and stream music, collect rewards at pins on a map, and complete bounties. Artists run everything from their own portal: catalog, memberships, pins, bounties, events, posts, gifts and their public page.

This is the monorepo behind [bandcoin.io](https://bandcoin.io). It is a Turborepo with pnpm workspaces.

## Apps

| App                          | Address              | Local port | What it is                                                                                             |
| ---------------------------- | -------------------- | ---------- | ------------------------------------------------------------------------------------------------------ |
| [`apps/app`](apps/app)       | `bandcoin.io`        | 3000       | Fan app: home, music, marketplace, items, collection, playlists, bounties, artist pages, wallet        |
| [`apps/artist`](apps/artist) | `artist.bandcoin.io` | 3001       | Artist portal: onboarding, catalog, music, memberships, pins, bounties, events, posts, gifts, `/admin` |
| [`apps/ar`](apps/ar)         | `ar.bandcoin.io`     | 3002       | AR collector: find pins on a map, collect them, scan murals, the embeddable pin map                    |
| `apps/worker`                | _planned_            |            | Background jobs (transcoding, hotspot drops, payouts, reconciliation)                                  |

All apps share one login (`NEXTAUTH_SECRET` and the `.bandcoin.io` cookie domain), one database and one API package.

## Stack

- **Web:** Next.js 16, React 19, Tailwind CSS 4, tRPC 11
- **Data:** Prisma 7 on PostgreSQL (Neon)
- **Sign-in:** NextAuth v4 with Stellar wallets (Freighter, Albedo, WalletConnect…) and custodial accounts (email, Google, Apple via Firebase)
- **Chain:** Stellar SDK, classic tokens, and the Soroban contracts `nft_oz` (NFT editions) and `bounty_escrow`
- **Payments:** wallet payments in BANDCOIN, XLM or USDC, and cards through Square
- **Files:** S3 for covers, music, art and mural photos
- **Tooling:** pnpm 12 with a version catalog, Turborepo, TypeScript, ESLint, Prettier, Vitest

## Repository layout

```
apps/
  app/       fan app
  artist/    artist portal (and /admin)
  ar/        AR collector
packages/
  api/       tRPC context, procedures, services (the business logic) and one root router per app
  ar-core/   AR domain code: pins, distance, rarity, murals, the website-map embed
  auth/      turns a credential into a signed-in user
  chain/     every Stellar transaction Bandcoin builds: quotes, tokens, NFTs, escrow
  db/        Prisma schema (one file per domain) and the shared client
  errors/    AppError and error codes
  geo/       geographic helpers
  page/      artist page blocks, themes and templates
  stellar/   account reads, quotes and price lookups
  storage/   S3 uploads and the rules for what may be uploaded
  ui/        design system: tokens, primitives and patterns
  utils/     small framework-free helpers
  wallet/    connect wallets, sign transactions, testnet or mainnet
tooling/     shared ESLint, Prettier, TypeScript and Vitest config
docs/        migration report and plans
```

## Getting started

You need Node 20.19 or newer and pnpm 12.

```bash
pnpm install

# One env file per app: copy the example and fill it in.
cp apps/app/.env.example    apps/app/.env.local
cp apps/artist/.env.example apps/artist/.env.local
cp apps/ar/.env.example     apps/ar/.env.local
cp packages/db/.env.example packages/db/.env

pnpm db:generate            # generate the Prisma client
pnpm dev:app                # or dev:artist, dev:ar, or `pnpm dev` for all of them
```

Development runs against Stellar **testnet**. Set `NEXT_PUBLIC_STELLAR_NETWORK=mainnet` (and the mainnet asset and contract addresses) only in production.

### Environment variables

Every variable an app reads is documented, with a comment, in that app's `.env.example`. The files are grouped the same way in all three apps: network, database, sign-in, chain keys, payments, storage, site details, links to the other apps, then the app's own integrations (maps, AI, Last.fm, Google Vision).

Real values never go in git: `.env`, `.env.local` and `.env.production` are ignored, and only `*.example` files are committed.

## Everyday commands

| Command                                  | What it does                                   |
| ---------------------------------------- | ---------------------------------------------- |
| `pnpm dev`                               | Run every app in development                   |
| `pnpm dev:app` / `dev:artist` / `dev:ar` | Run one app                                    |
| `pnpm typecheck`                         | Type-check every package                       |
| `pnpm lint`                              | Lint every package                             |
| `pnpm test`                              | Run every test suite                           |
| `pnpm format` / `pnpm format:check`      | Format with Prettier, or only check            |
| `pnpm db:generate` / `pnpm db:studio`    | Generate the Prisma client, or open the studio |
| `pnpm build`                             | Production build of every app                  |

Dependency versions live in the `catalog:` of [`pnpm-workspace.yaml`](pnpm-workspace.yaml), so upgrading a library is a one-line change.

## How the code is organised

- Apps never import each other. Shared code lives in a package, and packages never import apps.
- Business logic lives in `packages/api/src/services`. Routers only check input and call a service. Every mutation lands in the activity log.
- All Stellar and contract transactions are built in `@actiontokens/chain`, never in pages or routers. The user is always the transaction source, so the user pays the network fee.
- Money is shown with a full price breakdown before anything is signed, and custodial wallets get a 5 second countdown with Cancel.
- Files are kebab-case, components PascalCase, functions verb-first (`buildIssuerSetup`, `claimPin`). No file over 1000 lines.
- No `throw new Error`: use `AppError` from `@actiontokens/errors`.
- Run `pnpm typecheck && pnpm lint && pnpm test` before you push.

## Security

Never commit keys, tokens or `.env` files. If you find a security problem, email [support@bandcoin.io](mailto:support@bandcoin.io) instead of opening a public issue.
