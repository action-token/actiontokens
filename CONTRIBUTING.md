# Contributing to ActionTokens

Thanks for helping. This page is the short version; [docs/architecture.md](docs/architecture.md) explains how
the code fits together and [docs/getting-started.md](docs/getting-started.md) sets up your machine.

## Workflow

1. Branch from `main`: `feature/short-name` or `fix/short-name`.
2. Make a focused change. One pull request, one purpose.
3. Run the checks (all must pass):

   ```bash
   pnpm typecheck && pnpm lint && pnpm test && pnpm format:check
   ```

4. Open a pull request that says **what** changed and **why**, with a screenshot for any UI change (in Dark,
   Light and High contrast if it touches colour).

## Commit messages

- A short summary line in the imperative (`Add pin claim limit`), then a blank line and the reasons if needed.
- No generated attribution lines or co-author trailers.

## Code rules

- Apps never import each other; shared code goes in a package.
- Business logic lives in `packages/api/src/services`. Routers validate input and call a service.
- Build every Stellar or contract transaction in `@actiontokens/chain`. The user is the source and pays the fee.
- Use `AppError` from `@actiontokens/errors`, not `throw new Error`.
- Money is a decimal (7 places), never a float.
- Files are kebab-case, components PascalCase, functions verb-first. Keep files under 1000 lines.
- Colours, type and spacing come from design tokens; do not hard-code hex values in components.
- Text colour must keep at least 4.5:1 contrast (3:1 for large text) in all three AR themes.

## Database

- Schema changes go in `packages/db/prisma/schema` with a migration (`pnpm --filter @actiontokens/db migrate:dev`).
- Seed and reset scripts run only against a local database. Do not weaken `scripts/guard.ts`.

## Secrets

Never commit keys, tokens, `.env` files or real user data. Only `*.example` env files are tracked. If you
commit a secret by mistake, tell us immediately so it can be rotated; deleting it in a later commit is not
enough.

## Questions

Open a discussion or email [support@action-tokens.com](mailto:support@action-tokens.com).
