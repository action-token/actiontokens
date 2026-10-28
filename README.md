# Bandcoin

Music NFT platform on Stellar: fans buy, sell and stream music and collectibles, collect rewards at AR pins and complete bounties. Artists manage everything from the artist portal and create with AI in Studio.

## Layout

| Path | What |
|---|---|
| `apps/app` | Fan site: home, music, marketplace, items, collection, playlists, bounties, profiles |
| `apps/artist` | Artist portal, with `/admin` for admins |
| `apps/ar` | AR pin collecting (mobile-first) |
| `apps/studio` | AI generation, pin agent, stem editor, studio coin wallet |
| `apps/worker` | Background jobs (transcoding, AI, hotspot drops, payouts, reconciliation) |
| `packages/*` | Shared code: `db`, `api`, `chain`, `wallet`, `auth`, `storage`, `ui`, `errors`, `geo`, `utils`… |
| `tooling/*` | Shared eslint, prettier, typescript and vitest config |
| `docs/plans` | The restructure plan |

## Commands

```bash
pnpm install
pnpm dev:app        # or dev:artist, dev:ar, dev:studio, dev:worker
pnpm typecheck && pnpm lint && pnpm test
```

Node ≥ 20.19, pnpm 12. Dependency versions live in the `catalog:` of `pnpm-workspace.yaml`.

## Rules

- Apps never import each other; shared code lives in a package; packages never import apps.
- kebab-case files, PascalCase components, verb-first functions (`buildItemPurchaseXdr`, `claimPin`).
- No file over 1000 lines. No `throw new Error`: use `AppError` from `@bandcoin/errors`.
- All Stellar and contract transactions are built in `@bandcoin/chain`, never in pages or routers.
- Env files are never committed; every app documents its variables in `.env.example`.
