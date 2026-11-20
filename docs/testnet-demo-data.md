# Testnet demo data

`packages/api/scripts/testnet-seed.ts` fills a **development** database with organizations, fans, drops, pins,
events, bounties and murals that are **real on Stellar testnet**, so every screen has something to show and
every purchase, claim and bounty works end to end.

```bash
pnpm --filter @actiontokens/api testnet:seed
```

## What it creates

| Thing         | How many | Notes                                                                                     |
| ------------- | -------- | ----------------------------------------------------------------------------------------- |
| Organizations | 6        | A cause, brands, venues and an artist crew in Dhaka, plus one each in New York and London |
| Fans          | 5        | Each with a funded testnet wallet                                                         |
| Items         | 24       | Each organization has a token and three collectibles, all real assets of its own issuer   |
| Pins          | 16       | Most in Dhaka; collecting one pays a token or an item                                     |
| Bounties      | 6        | Created through the real organization API and **funded into escrow on chain**             |
| Murals        | 5        | Off chain, discovered by the first fan, with AR coin entries                              |
| Also          | –        | Events with RSVPs, posts, membership tiers, follows, announcements                        |

What is real on chain:

- Every organization and fan wallet is created and funded by **Friendbot**.
- Each organization opens its own issuer (the production builder); its tokens and items are classic assets of
  that issuer.
- ACTION comes from the testnet treasury (`MOTHER_SECRET`).
- Fans really hold the tokens and items the database says they own.

## Safety

- Runs only against a **local** database named `actiontokens_dev`, and only on testnet.
- Refuses to run twice: if a seeded organization slug already exists, it stops before writing anything.
- Never touches existing users.

## Signing in as a demo account

The script writes every wallet's public key and **secret key** to `.local/testnet-accounts.md` at the repo
root. That folder is git-ignored. These are testnet keys with no real value, but do not paste them anywhere
public.

1. Add a secret key to Freighter (switched to **Testnet**) or to Albedo.
2. Choose that wallet in **Connect wallet**.
3. An organization key opens the org portal as that organization; a fan key signs in as that fan.

## Requirements

`MOTHER_SECRET` (a funded testnet account holding ACTION), `CHAIN_ACCOUNT_KEY`, and `ESCROW_CONTRACT` for the
bounties, set in the app env file the script loads (`apps/ar/.env.development.local`).
