# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for a security problem. Email
[support@action-tokens.com](mailto:support@action-tokens.com) with:

- what you found and where (app, page or package),
- steps to reproduce, and the impact you expect,
- your contact details, if you want a reply.

We acknowledge reports within a few working days and tell you when it is fixed.

## What is in scope

- The apps in this repository (`apps/app`, `apps/org`, `apps/ar`, `apps/worker`) and the packages they use.
- The Soroban contracts in `packages/contracts`.
- Sign-in, wallet and transaction-building code (`packages/auth`, `packages/wallet`, `packages/chain`).

Out of scope: testnet tokens (they have no value), third-party services, and findings that need a rooted device
or a stolen wallet key.

## How we handle secrets

- Keys, tokens and `.env` files are never committed. Only `*.example` env files are tracked.
- Organization issuer secret keys are stored encrypted (`CHAIN_ACCOUNT_KEY`).
- Seed and reset scripts refuse to run against anything but a local development database.
- The demo wallets created by the testnet seed are testnet-only and kept in a git-ignored folder.

If you find a real secret in this repository or its history, report it the same way.
