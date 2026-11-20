# Architecture

## The pieces

```
        fans                     organizations                 server
   ┌──────────────┐          ┌──────────────────┐        ┌──────────────┐
   │ apps/app     │          │ apps/org         │        │ apps/worker  │
   │ apps/ar      │          │ (+ /admin)       │        │ background   │
   └──────┬───────┘          └────────┬─────────┘        └──────┬───────┘
          │  tRPC                     │  tRPC                   │
          └───────────────┬───────────┴─────────────────────────┘
                          ▼
                   packages/api            services = the business logic
                  ┌───────┴────────┐
                  ▼                ▼
          packages/db         packages/chain  ──►  Stellar (classic assets, Soroban)
          Prisma + Postgres   builds every transaction
```

- **Three web apps, one backend.** `app`, `org` and `ar` each have their own tRPC root router in
  `packages/api`, and all use the same services, the same database and the same login.
- **The worker** runs jobs that must not depend on a browser: payment re-checks, music processing, hotspot
  drops and reconciliation.

## Rules the code follows

1. **Apps never import each other.** Shared code lives in a package; packages never import apps.
2. **Routers are thin.** Business logic lives in `packages/api/src/services`. Every mutation lands in the
   activity log.
3. **All Stellar and contract transactions are built in `@actiontokens/chain`**, never in pages or routers.
   The user is the transaction source, so the user pays the network fee.
4. **Money is shown before it is signed.** A full price breakdown first; custodial wallets get a countdown
   with Cancel.
5. **Errors are `AppError`** from `@actiontokens/errors`, not `throw new Error`.
6. **Money is `Decimal(20, 7)`**, Stellar's precision. Never a float.
7. **Naming:** files kebab-case, components PascalCase, functions verb-first (`buildIssuerSetup`,
   `claimPin`). No file over 1000 lines.

## Data model

The Prisma schema is a folder, one file per domain, in [`packages/db/prisma/schema`](../packages/db/prisma/schema):
identity, catalog, market, bounty, community, AR (pins, murals, coin ledger), gallery and more. Models are
singular PascalCase; tables are snake_case plurals.

Key ideas:

| Concept      | What it is                                                                             |
| ------------ | -------------------------------------------------------------------------------------- |
| Organization | An approved account that owns a token issuer, a catalog, tiers, pins, bounties, events |
| Action token | The organization's own token (a classic Stellar asset), sold and earned                |
| Item         | A collectible or ticket (`IMAGE`, `MERCH`, `TICKET`, `FAN_TOKEN`, …), on chain or off  |
| Pin          | A place on the map with a reward, a claim limit and a time window                      |
| Bounty       | A prize funded into the `bounty_escrow` contract and paid to selected winners          |
| Mural        | A real mural found and scanned by fans, rewarding AR coins (off chain)                 |
| Ownership    | Who holds what, and how they got it (`PURCHASE`, `GIFT`, `PIN_CLAIM`, `BOUNTY`, …)     |

## Chain

- **Issuer accounts.** Each organization gets its own issuer, opened by `buildIssuerSetup`. The issuer secret
  is stored encrypted with `CHAIN_ACCOUNT_KEY`.
- **Platform token.** ACTION, configured by `NEXT_PUBLIC_ASSET_CODE` and `NEXT_PUBLIC_ASSET_ISSUER`.
- **Contracts** in [`packages/contracts`](../packages/contracts): `bounty_escrow` holds bounty prizes until a
  winner claims; `nft_oz` mints NFT editions.
- **Networks.** Development uses testnet. Mainnet values are set only in production.

## Sign-in

NextAuth v4. A **wallet** (Freighter, Albedo, WalletConnect) signs a challenge; a **custodial** account (email,
Google, Apple) is created and held for the user. Both end up as a `User` with a `walletAddress`.

## AR app

The AR app is a mobile web app: a map of pins, a capture flow, a collection ("Stash"), a marketplace, the
organizations list and a profile. Its design language, themes (Dark, Light, High contrast) and colours are in
[AR-STICKER-REDESIGN.md](AR-STICKER-REDESIGN.md).

## Deploys

The web apps deploy to Vercel. The worker runs as one Docker container on a server
(`.github/workflows/deploy-worker.yml`, off until the server is ready).
