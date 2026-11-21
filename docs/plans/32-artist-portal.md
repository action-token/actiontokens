# 32. Artist portal (apps/org)

The artist portal is `apps/org` (port 3001). Its screens already say "artist portal" and "Artist"; this plan
makes it fully **Action Tokens**: the brand, the ACTION token, the sticker design and the same look as the AR
app. Data, routes, package names and the `organization` model are unchanged. Only what people read and see.

User wording: "Artist(s)" in the portal. The AR app keeps "Organization(s)" (see AR-STICKER-REDESIGN.md).

## Phases

| #   | Phase                         | What                                                                                                                                                 | Status |
| --- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | Brand and token               | ACTION-TOKENS wordmark, Action Tokens logo (sidebar, boot, loader, currency icon), ACTION instead of BANDCOIN, page title, sign-in and settings text | done   |
| 2   | Design system                 | Sticker primitives (outlined cards, hard shadows, tilted tags), Teko + Barlow, logo-green themes, Dark / Light / High contrast, shared with `ui`     | to do  |
| 3   | Shell                         | Sidebar, mobile header, page headers (title + tilted eyebrow), account menu, theme switch                                                            | to do  |
| 4   | Sign-in and onboarding wizard | Sign-in card, 4 steps (profile, fan token, page address, review and pay) restyled                                                                    | to do  |
| 5   | Dashboard                     | Balance, followers, live drops and pins, recent activity at a glance                                                                                 | to do  |
| 6   | Drops, pins, bounties, events | Catalog, pin form, bounty and event forms and lists                                                                                                  | to do  |
| 7   | Music, posts, memberships     | Albums and songs, posts and stories, tiers and fan token                                                                                             | to do  |
| 8   | Money                         | Wallet, send, swap, receive, reports, royalties, recharge                                                                                            | to do  |
| 9   | Settings and page builder     | Profile header (cover, avatar), accounts, domain, integrations, page builder                                                                         | to do  |
| 10  | Admin                         | `/admin` screens (artists, claims, stories, murals, settings)                                                                                        | to do  |
| 11  | Check                         | Contrast audit (WCAG AA) in all three themes, mobile widths, typecheck, lint, tests                                                                  | to do  |
| 12  | Deploy                        | Vercel project `actiontokens-org-dev` (see deployment.md), env from `apps/org/.env.example`                                                          | to do  |

## Rules

- Never change routes, API names or database models for wording. Display only.
- The platform token shows as ACTION (`TOKEN_NAME` in `apps/org/src/lib/format.ts`); the stored value stays `BANDCOIN`.
- The brand is written **Action Tokens** in text and **ACTION-TOKENS** as the wordmark.
- Shared pieces live in `packages/ui` and also change the fan app, so check both after touching them.
- Each phase is one commit: `pnpm --filter @actiontokens/org typecheck lint test` green first.
