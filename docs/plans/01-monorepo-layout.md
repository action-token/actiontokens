# 01 · Monorepo layout and conventions

## Stack (same versions as wadzzo, from one pnpm catalog)

Next 16 App Router, React 19, TypeScript strict, Tailwind 4, tRPC 11 with TanStack Query 5, Prisma 7 (`@prisma/adapter-pg`), NextAuth 4, Zod 4, Stellar SDK 17, Vitest, Playwright, Turborepo, pnpm workspaces.

Why App Router: public pages (item, artist, song, album) become Server Components, which fixes SEO and first paint. The old splash screen that delayed every page goes away.

## Tree

```
bandcoin/
├─ apps/
│  ├─ app/        @bandcoin/app      fans: home, music, marketplace, item, collections, playlists, profiles, bounties
│  ├─ artist/     @bandcoin/artist   artist portal + /admin
│  ├─ ar/         @bandcoin/ar       map, nearby pins, AR camera, claim
│  ├─ studio/     @bandcoin/studio   AI generators, pin agent, stem editor, studio coin wallet
│  └─ worker/     @bandcoin/worker   Express + job runner (tsup bundle, PM2 on EC2)
├─ packages/
│  ├─ db/         Prisma schema, client (`/server`), generated types, migration script
│  ├─ api/        tRPC: context, procedures, routers per app, shared services
│  ├─ chain/      ALL transaction building: classic tokens, nft_oz, escrow, studio coin, royalty
│  ├─ contracts/  Soroban sources (bounty_escrow, nft_oz) + generated TS bindings
│  ├─ wallet/     sign-in + signing providers (copied from wadzzo), custodial signing
│  ├─ auth/       NextAuth options, authorizeCredentials
│  ├─ storage/    S3 uploads, signed media URLs, image optimisation
│  ├─ media/      player engine, preview gating helpers, waveform (client + shared)
│  ├─ ui/         design system: tokens, primitives, patterns, boot screen, toasts
│  ├─ schemas/    Zod schemas shared by forms and routers
│  ├─ errors/     AppError + codes
│  ├─ geo/        distance, radius, geocode cache
│  ├─ config/     platform constants, fee rules, env readers
│  └─ utils/      small pure helpers (format money, dates, slugs)
├─ tooling/ eslint · prettier · typescript · vitest
└─ docs/ ARCHITECTURE.md · DEPLOYMENT.md · plans/
```

Apps never import from each other. Anything two apps need lives in a package. A package never imports from an app.

## Inside an app

```
apps/app/src/
├─ app/                 routes only: page.tsx, layout.tsx, loading.tsx, error.tsx (thin)
├─ features/<feature>/  components, hooks, and helpers for ONE feature (music, market, item, collection…)
│   ├─ components/
│   ├─ hooks/
│   └─ index.ts         what other features may use
├─ shell/               app frame: sidebar, top bar, mobile tabs, right panel, player bar
└─ trpc/                client provider
```

A `page.tsx` only loads data and composes feature components. No business logic in pages.

## Naming conventions

| Thing        | Rule                                                    | Example                                               |
| ------------ | ------------------------------------------------------- | ----------------------------------------------------- |
| Files        | kebab-case, describes what's inside                     | `buy-panel.tsx`, `use-play-queue.ts`                  |
| Components   | PascalCase noun                                         | `ItemCard`, `PriceBreakdown`                          |
| Hooks        | `use` + noun/verb                                       | `useOwnership`, `useCancelableSign`                   |
| Functions    | verb first                                              | `buildItemPurchaseXdr`, `getArtistBySlug`, `claimPin` |
| Booleans     | `is/has/can`                                            | `isOwner`, `canStreamFull`                            |
| tRPC routers | domain noun; procedures verb + noun                     | `item.getBySlug`, `order.create`, `pin.claim`         |
| DB models    | singular PascalCase; tables mapped to snake_case plural | `model PinClaim` → `pin_claims`                       |
| Env vars     | `SCREAMING_SNAKE`, public ones `NEXT_PUBLIC_`           | `STUDIO_COIN_ISSUER`                                  |

The old misspellings (`wallate`, `steller`, `aprovalSend`, `steamUrl`, `genreation`, `trcp`) disappear.

## Guardrails (lint, enforced in CI)

- No file over 1000 lines (`max-lines`).
- No imports across apps; no `~/` inside packages.
- `@bandcoin/db/server` and `@bandcoin/chain/server` can't be imported in client components.
- No `throw new Error`; use `AppError` with a code.
- No new dependency outside the catalog.
