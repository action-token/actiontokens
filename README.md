<div align="center">

# ActionTokens

**Collect the real world.** Fans find drops on a map, walk to them and collect them in AR.
Organizations run everything from their own portal.

[Fan app](https://app.action-tokens.com) · [AR app](https://ar.action-tokens.com) · [Org portal](https://org.action-tokens.com)

</div>

ActionTokens is a platform on [Stellar](https://stellar.org). An **organization** (a brand, a venue, a cause, an
artist crew) issues its own **action token** and collectibles. **Fans** buy them, or collect them by visiting
**pins** on a map, completing **bounties** and scanning **murals**. Everything is a real Stellar asset or a
Soroban contract, so what a fan collects is theirs.

> **Looking for the old Actionverse?** It is deprecated. This repository replaces
> [`action-token/actionverse`](https://github.com/action-token/actionverse) and
> [`action-token/gallery-actiontokens`](https://github.com/action-token/gallery-actiontokens). See
> [docs/README.md](docs/README.md#migration-from-actionverse) for how the data moved.

## The apps

| App                          | Address                 | Local port | What it is                                                                                         |
| ---------------------------- | ----------------------- | ---------- | -------------------------------------------------------------------------------------------------- |
| [`apps/app`](apps/app)       | `app.action-tokens.com` | 3000       | **Fan app:** home, marketplace, items, collection, bounties, organization pages, wallet            |
| [`apps/org`](apps/org)       | `org.action-tokens.com` | 3001       | **Organization portal:** onboarding, catalog, memberships, pins, bounties, events, posts, `/admin` |
| [`apps/ar`](apps/ar)         | `ar.action-tokens.com`  | 3002       | **AR collector:** find pins on a map, collect them, scan murals, the embeddable pin map            |
| [`apps/worker`](apps/worker) | server only             |            | **Background jobs:** payment re-checks, music processing, hotspot drops, reconciliation            |

All apps share one login, one database and one API package.

## Stack

- **Web:** Next.js 16, React 19, Tailwind CSS 4, tRPC 11
- **Data:** Prisma 7 on PostgreSQL
- **Sign-in:** NextAuth with Stellar wallets (Freighter, Albedo, WalletConnect) and custodial email accounts
- **Chain:** Stellar SDK, classic assets, and the Soroban contracts `nft_oz` (NFT editions) and `bounty_escrow`
- **Payments:** wallet payments in ACTION, XLM or USDC, and cards through Square
- **Tooling:** pnpm, Turborepo, TypeScript, ESLint, Prettier, Vitest

## Quick start

You need Node 22 (see [`.nvmrc`](.nvmrc)), pnpm 12 and Docker.

```bash
pnpm install
pnpm db:up                                   # local Postgres in Docker (port 55432)

cp packages/db/.env.example packages/db/.env
cp apps/ar/.env.example     apps/ar/.env.local   # fill in the values, one file per app
pnpm --filter @actiontokens/db migrate:deploy
pnpm --filter @actiontokens/db seed          # demo organizations, items and pins

pnpm dev:ar                                  # or dev:app, dev:org, or `pnpm dev` for all
```

Development runs on Stellar **testnet**. The step-by-step guide, including funding testnet wallets and
loading real on-chain demo data, is in **[docs/getting-started.md](docs/getting-started.md)**.

## Repository layout

```
apps/
  app/        fan app
  org/        organization portal (and /admin)
  ar/         AR collector
  worker/     background jobs
packages/
  api/        tRPC procedures and services (the business logic)
  ar-core/    AR domain code: pins, distance, rarity, murals, the website-map embed
  auth/       turns a credential into a signed-in user
  chain/      every Stellar transaction we build: quotes, tokens, NFTs, escrow
  contracts/  Soroban contracts (bounty_escrow, nft_oz)
  db/         Prisma schema (one file per domain), migrations, seeds
  errors/     AppError and error codes
  geo/ map/   geographic helpers and the shared map
  page/       organization page blocks, themes and templates
  stellar/    account reads, quotes and price lookups
  storage/    S3 uploads and the rules for what may be uploaded
  ui/         design system: tokens, primitives, patterns
  utils/      small framework-free helpers
  wallet/     connect wallets, sign transactions, testnet or mainnet
tooling/      shared ESLint, Prettier, TypeScript and Vitest config
docs/         guides, architecture, design and plans (start at docs/README.md)
```

## Everyday commands

| Command                               | What it does                                   |
| ------------------------------------- | ---------------------------------------------- |
| `pnpm dev`                            | Run every app in development                   |
| `pnpm dev:app` / `dev:org` / `dev:ar` | Run one app                                    |
| `pnpm typecheck` · `lint` · `test`    | Check every package                            |
| `pnpm format` / `pnpm format:check`   | Format with Prettier, or only check            |
| `pnpm db:up` / `pnpm db:down`         | Start or stop the local Postgres               |
| `pnpm db:generate` / `pnpm db:studio` | Generate the Prisma client, or open the studio |
| `pnpm build`                          | Production build of every app                  |

Run `pnpm typecheck && pnpm lint && pnpm test` before you push.

## Documentation

| Read this                                                  | When you want to                                |
| ---------------------------------------------------------- | ----------------------------------------------- |
| [docs/getting-started.md](docs/getting-started.md)         | Set up a machine and run the apps               |
| [docs/architecture.md](docs/architecture.md)               | Understand how the apps, packages and chain fit |
| [docs/testnet-demo-data.md](docs/testnet-demo-data.md)     | Load real on-chain demo organizations and fans  |
| [docs/AR-STICKER-REDESIGN.md](docs/AR-STICKER-REDESIGN.md) | See the AR design language, themes and colours  |
| [docs/README.md](docs/README.md)                           | Browse everything, including plans and reports  |

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Report security problems privately,
as described in [SECURITY.md](SECURITY.md). Never commit keys, tokens or `.env` files.

## License

The source is visible for reading and local evaluation. Any other use needs written permission. See the
[ActionTokens License](LICENSE).
