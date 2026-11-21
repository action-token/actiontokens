# ActionTokens documentation

Everything about the platform in one place. New here? Read the first three, in order.

## Start here

| Guide                                     | What you get                                                               |
| ----------------------------------------- | -------------------------------------------------------------------------- |
| [Getting started](getting-started.md)     | Install, start the database, set the env files, run the apps               |
| [Architecture](architecture.md)           | The apps, the packages, how a request and a transaction flow               |
| [Testnet demo data](testnet-demo-data.md) | Real on-chain demo organizations, fans, pins and bounties                  |
| [Deployment (Vercel)](deployment.md)      | Projects, env vars and deploy steps for the AR app, fan app and org portal |

## Design

| Document                                      | What it covers                                                      |
| --------------------------------------------- | ------------------------------------------------------------------- |
| [AR sticker redesign](AR-STICKER-REDESIGN.md) | The Street Sticker look: type, colour (logo green), themes, screens |
| [`mockups/`](mockups)                         | Reference frames and font studies                                   |

## Plans

| Document                  | What it covers                                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| [Master plan](PLAN.md)    | Goals, owner decisions and the decision log                                                                 |
| [Fork plan](FORK-PLAN.md) | How ActionTokens was built from the Action Tokens monorepo                                                  |
| [`plans/`](plans)         | One file per feature or phase (schema, API, transactions, AR, …). Index: [plans/README.md](plans/README.md) |

## Migration from Actionverse

The old Actionverse database was only ever **read**; the data was copied into the new schema.

| Report                                              | What it is                                  |
| --------------------------------------------------- | ------------------------------------------- |
| [Dev dry run](migration-report-dev.md)              | Row counts and decisions, development copy  |
| [Production dry run](migration-report-prod.md)      | Row counts and decisions, production source |
| [Cutover report](migration-report-cutover.md)       | What the cutover will do and check          |
| [Dev copy rehearsal](copy-rehearsal-dev.md)         | A full copy into the dev database           |
| [Production copy rehearsal](copy-rehearsal-prod.md) | A full copy rehearsal from production data  |

## Deprecated repositories

| Repository                                               | Status                                                                                                                                        |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `action-token/actionverse`                               | Deprecated. Replaced by this repository.                                                                                                      |
| `action-token/gallery-actiontokens`                      | Deprecated. Replaced by this repository.                                                                                                      |
| `Wadzzo2023/connect_wallet`, `Wadzzo2023/express-wadzzo` | Legacy submodules of Actionverse, owned by another organization. Not used here; wallet connection is [`packages/wallet`](../packages/wallet). |

## Organization page

| Document                                    | What it is                                                                                |
| ------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [Org profile README](org-profile/README.md) | Text for the `action-token` GitHub page; copy to `action-token/.github/profile/README.md` |

## Writing docs

- One topic per file, kebab-case names, a short intro, then headings.
- Plans live in `plans/` and are numbered; guides live here in `docs/`.
- Never put keys, tokens or personal data in a doc. Testnet secret keys for demo wallets stay in the
  git-ignored `.local/` folder.
