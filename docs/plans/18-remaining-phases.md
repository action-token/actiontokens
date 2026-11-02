# 18 · The remaining phases

Everything in plans 01–17 that isn't built yet, in the order it gets built.
Decisions asked on 2026-11-02 are at the top; each stage ends with something
you can open and check, and every stage ships with tests.

## Decisions (asked 2026-11-02)

| Question         | Answer                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Studio coin      | **In-app balance first.** A ledgered balance, topped up with BANDCOIN, XLM, USDC or card. It can become a Stellar token later. |
| AI providers     | **Same as bandfan, plus music:** OpenAI and Google for text, images and video, and a music generator (provider asked at stage 6). |
| Facebook sync    | **Build it.** It needs a Facebook app (id and secret) and page permissions; real artists need app review.                      |
| Copying old data | **Now, into the dev database.** The old database is opened read only. Production is never touched.                             |

## Already done inline (no worker job needed)

- **Royalty payouts:** the artist signs one batch in the portal (`submitRoyaltyBatch`).
- **Recharge and XLM swap:** finished in the request; `order.reconcile` covers lost answers.

## Stages

### 1. Copy bandfan's data into the dev database

`pnpm --filter @bandcoin/db legacy:run` copies the 91 old tables (4,268 rows
in the dry run) in the order of plan 03:
users → artists → chain accounts → items → listings → orders and ownership →
music → social → pins → bounties → studio → settings.

- `legacy_id_map` makes it re-runnable: a second run skips rows already copied.
- Nothing is deleted from the new database. Test data stays beside the copy.
- Secrets (storage keys) are decrypted with the old key and encrypted with the new one.
- Old `CreditBalance` becomes a Studio balance (one credit = one coin), as plan 08 suggested.
- Afterwards: row counts old vs new, and a sample of ownerships checked against Horizon,
  written to `docs/migration-report.md`.

**You check:** the report, and old artists and items in both apps.

### 2. Fan app: feed and notifications

- `/feed`: posts from artists you follow, newest first, with likes and comments as on the
  artist page. Tier-locked posts show how to qualify. Empty state links to Marketplace.
- `/notifications`: every notification, 20 at a time with "Load more", unread marked;
  opening the page marks them seen. The bell gets "See all".
- More notification kinds: a new post from an artist you follow, gift received, item
  delivered, bounty joined (for the artist), bounty winner, pin reward claimed.

**You check:** both pages, desktop and phone.

### 3. Hotspots and batch pins

- Artist `/hotspots`: draw an area on the map (circle or polygon), choose how often pins
  drop (every N days), how long each pin lasts, start and end dates, auto-collect, and one
  or several spots per drop. List with pause, edit and hide. Same rules as bandfan.
- Worker `hotspot.drop` (every 5 minutes): for each active hotspot whose `nextDropAt`
  has passed, places pins at random points inside the area, then sets the next drop.
  Running it twice for the same drop does nothing.
- Worker `pin.batchCreate`: big pin batches (`PinBatchJob`) run in the worker with
  progress shown in the portal, instead of blocking the request.

**You check:** create a hotspot, see the first drop on the map and in the AR app.

### 4. Worker schedules

- `vanity.expire` (hourly), following the vanity rules: unpaid after `paidUntil` →
  **GRACE** for 7 days (link still works, renewal reminder) → **LAPSED** (the link
  redirects to `/artist/[slug]`; the name stays reserved for 30 days) → released.
- `studio.reconcile` (nightly): the cached Studio balance is compared with its ledger;
  differences show in Admin › Alerts. Nothing is changed automatically.
- Admin › Jobs lists the new jobs; Retry only on non-payment jobs.

**You check:** Admin › Jobs, and a vanity link moved through grace in dev.

### 5. Studio app: balance and top-up (`apps/studio`, port 3102)

- New Next app with the same shell, sign-in and theme as the artist portal.
- `/` home: balance, recent generations, the tools.
- `/coins`: top up with a package or any amount, paid with BANDCOIN, XLM or USDC (one
  signed payment to the treasury, with the cancel countdown) or by card (Square). The
  ledger lists every top-up, spend and refund. No withdraw while it's an in-app balance.
- Prices per generation type in Admin › Settings (`studioPrices`), shown on every
  Generate button before you run it.

**You check:** top up on testnet and see the ledger.

### 6. Studio generators

- `/text`, `/image`, `/video`, `/music`: prompt, model, cost shown first, history.
  Same models as bandfan (OpenAI: text, DALL-E, Sora; Google: Imagen, Veo) plus music.
- Worker `generation.run`: reserves the price, calls the provider, saves the output to
  storage, then commits the spend; if it fails, the reserve is refunded and the error
  shown. Provider calls are retried; money is not.
- `/library`: everything generated, with "Use as cover", "Use in a post" and download.

**You check:** one generation of each kind, and a failed one refunded.

### 7. Pin agent and stem editor

- `/agent`: the bandfan pin and hotspot agent (chat). It proposes pins and hotspots as
  drafts with a summary; the artist confirms them in the portal. Worker `agent.run`.
- `/stems`: load stems you own, mix volume and mute per stem, play together, export a
  new track into the catalog as a draft.

**You check:** ask the agent for pins, confirm one; mix and export a track.

### 8. Facebook post sync

- Settings › Facebook: connect a page (Facebook login), choose auto-publish or manual.
- Worker `facebook.sync`: new page posts are copied as posts (text and images), once each.
  Optional: publish a Bandcoin post to the page.

**You check:** with a test page in a Facebook developer app.

### 9. Parity checklist and cutover plan

- Every bandfan page and feature listed with where it lives now, checked ✓ in a browser.
- A separate production cutover plan (domains, env, production copy, rollback) for your approval.

## Needed from you along the way

- Stage 6: the music provider and its API key; OpenAI and Google keys in local env.
- Stage 8: a Facebook developer app (id and secret).
- Stage 9: the domains for the apps.

## Risks

- **Data copy:** dev only. The script refuses a production URL, opens the old DB
  read-only, and stops on the first broken reference rather than guessing.
- **Money:** Studio top-ups use the existing order flow; spends are ledgered in one
  database transaction; no payment retries.
- **AI costs:** a provider is called only after the price is reserved.
