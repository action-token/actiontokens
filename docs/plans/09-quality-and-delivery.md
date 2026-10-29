# 09 · Quality and delivery

## Tests (every change ships with tests)

| Layer                | Tool                                  | What                                                                          |
| -------------------- | ------------------------------------- | ----------------------------------------------------------------------------- |
| Pure logic           | Vitest                                | quote and price breakdown, access rules, ledger math, pin distance, slugs     |
| Transactions         | Vitest + Stellar testnet fixtures     | every `chain` builder: operations, amounts, memo                              |
| Services and routers | Vitest + mocked db / real tRPC caller | order state machine, gating, signer guard, studio refunds                     |
| Components           | Vitest + Testing Library              | BuyPanel, PriceBreakdown, TransactionToast cancel, TierGate                   |
| End to end           | Playwright                            | browse → preview → buy (wallet + custodial cancel), claim pin, run generation |
| Contracts            | `cargo test`                          | bounty_escrow, nft_oz                                                         |

## CI (`.github/workflows/ci.yml`)

format → typecheck → lint (incl. max-lines) → test → build (affected apps only, via turbo).

## Env files

Each app has `.env.example` (committed, documented) and `.env` / `.env.development` / `.env.production` (git-ignored). `pnpm env:check` verifies that shared values (DB, bucket, platform accounts) match across apps. No secret is ever committed.

## Deploy

- `app`, `artist`, `ar`, `studio`: one Vercel project each (Root Directory `apps/<name>`).
- `worker`: tsup bundle, PM2 on EC2, deployed by a GitHub workflow (as wadzzo).

## Cutover (phase 9, separate approval)

A parity checklist against every bandfan page and feature, then a production plan: freeze, migrate the production DB with the same script, DNS switch, rollback path.
