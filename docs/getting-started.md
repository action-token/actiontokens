# Getting started

From a clean machine to the apps running on your laptop, using a local database and Stellar **testnet**.

## 1. Install

| Tool   | Version                                 |
| ------ | --------------------------------------- |
| Node   | 22 (the version in `.nvmrc`)            |
| pnpm   | 12 (`packageManager` in `package.json`) |
| Docker | any recent version, for Postgres        |

```bash
git clone https://github.com/action-token/actiontokens.git
cd actiontokens
pnpm install
```

`pnpm install` also generates the Prisma client.

## 2. Start the database

```bash
pnpm db:up        # Postgres 17 in Docker, 127.0.0.1:55432, database actiontokens_dev
```

The compose file is for local development only. The db scripts refuse to run destructive work (seed, reset)
against anything but a local database; see [`packages/db/scripts/guard.ts`](../packages/db/scripts/guard.ts).

## 3. Environment files

One file per app. Copy the example and fill it in; every variable has a comment.

```bash
cp packages/db/.env.example packages/db/.env
cp apps/app/.env.example    apps/app/.env.local
cp apps/org/.env.example    apps/org/.env.local
cp apps/ar/.env.example     apps/ar/.env.local
```

The ones you must set to run anything:

| Variable                             | What it is                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------ |
| `DATABASE_URL`                       | `postgresql://actiontokens:actiontokens@127.0.0.1:55432/actiontokens_dev`                  |
| `NEXT_PUBLIC_STELLAR_NETWORK`        | `testnet` for development                                                                  |
| `NEXT_PUBLIC_ASSET_CODE` / `_ISSUER` | The platform token (ACTION) on that network                                                |
| `NEXTAUTH_SECRET`                    | A long random string, the same in all three apps                                           |
| `CHAIN_ACCOUNT_KEY`                  | Encrypts issuer secret keys in the database. Keep it, and never change it once data exists |
| `NEXT_PUBLIC_MAPBOX_API`             | Map tiles                                                                                  |

Real values never go in git: `.env`, `.env.local` and `.env.*.local` are ignored. Only `*.example` files are committed.

## 4. Create the tables and demo data

```bash
pnpm --filter @actiontokens/db migrate:deploy   # apply the migrations
pnpm --filter @actiontokens/db seed             # demo organizations, items, pins (database only)
```

`seed:reset` wipes and reseeds a local database. For demo data that is **real on testnet** (funded wallets,
issued tokens, funded bounties), use the testnet seed instead; see [testnet-demo-data.md](testnet-demo-data.md).

## 5. Run

```bash
pnpm dev:ar       # http://localhost:3002  AR collector
pnpm dev:app      # http://localhost:3000  fan app
pnpm dev:org      # http://localhost:3001  organization portal
pnpm dev          # all of them
```

## 6. Sign in on testnet

1. Install [Freighter](https://www.freighter.app/) and switch it to **Testnet**, or use Albedo.
2. Create or import an account. Fund it from Friendbot: `https://friendbot.stellar.org/?addr=<your public key>`.
3. Use **Connect wallet** in any app. A wallet becomes a fan; an organization account is created in the org portal.

## Checks before you push

```bash
pnpm typecheck && pnpm lint && pnpm test
```

## Troubleshooting

| Symptom                                    | Fix                                                                     |
| ------------------------------------------ | ----------------------------------------------------------------------- |
| `Refusing to seed … only a local database` | The guard stopped you; point `DATABASE_URL` at the Docker database      |
| Issuer secrets will not decrypt            | `CHAIN_ACCOUNT_KEY` differs from the one used when the data was created |
| Map is blank                               | `NEXT_PUBLIC_MAPBOX_API` is missing                                     |
| Location prompt never appears (AR)         | Allow location for `localhost` in the browser                           |
