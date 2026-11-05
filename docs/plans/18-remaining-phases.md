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

### 1. ~~Copy bandfan's data into the dev database~~ (dropped 2026-11-03)

Not needed: work continues on the demo data in the dev database. No copy and no
testnet check of copied artists.

### 2. Fan app: feed and notifications (done)

- `/feed`: posts from artists you follow, newest first, with likes and comments as on the
  artist page. Tier-locked posts show how to qualify. Empty state links to Marketplace.
- `/notifications`: every notification, 20 at a time with "Load more", unread marked;
  opening the page marks them seen. The bell gets "See all".
- More notification kinds: a new post from an artist you follow, gift received, item
  delivered, bounty joined (for the artist), bounty winner, pin reward claimed.

**You check:** both pages, desktop and phone.

### 3. Hotspots (done 2026-11-03; batch pins moved to stage 7)

Decided: drops go live without admin review (as bandfan), the first drop is on the
start date, and every drop uses "spots per drop". Batch pin creation comes with the
pin agent in stage 7, the only place bandfan used it.

Original plan:

- Artist `/hotspots`: draw an area on the map (circle or polygon), choose how often pins
  drop (every N days), how long each pin lasts, start and end dates, auto-collect, and one
  or several spots per drop. List with pause, edit and hide. Same rules as bandfan.
- Worker `hotspot.drop` (every 5 minutes): for each active hotspot whose `nextDropAt`
  has passed, places pins at random points inside the area, then sets the next drop.
  Running it twice for the same drop does nothing.
- Worker `pin.batchCreate`: big pin batches (`PinBatchJob`) run in the worker with
  progress shown in the portal, instead of blocking the request.

**You check:** create a hotspot, see the first drop on the map and in the AR app.

### 4. Worker schedules (done 2026-11-03)

Built: `vanity.expire` hourly sends three reminders to the artist's bell (3 days
before, grace starts, link stopped), keeps the stored status in step, and frees names
past their 30 reserved days; the link itself was already right from its dates. The
Studio balance check is a live Admin › Alerts alert (decided: no nightly job).
Admin › Jobs names every job; scheduled jobs simply run again, so only music jobs
have Retry.

Original plan:

- `vanity.expire` (hourly), following the vanity rules: unpaid after `paidUntil` →
  **GRACE** for 7 days (link still works, renewal reminder) → **LAPSED** (the link
  redirects to `/artist/[slug]`; the name stays reserved for 30 days) → released.
- `studio.reconcile` (nightly): the cached Studio balance is compared with its ledger;
  differences show in Admin › Alerts. Nothing is changed automatically.
- Admin › Jobs lists the new jobs; Retry only on non-payment jobs.

**You check:** Admin › Jobs, and a vanity link moved through grace in dev.

### 5. Studio app: balance and top-up (`apps/studio`, port 3102) (done 2026-11-03)

Decided: anyone signed in; portal AI helpers stay free; 1 coin = $0.01; a run costs
the AI provider's cost + a 30% platform fee (Admin › Settings › Studio), rounded up to
whole coins; top up $1–$500 or a package (dollar price + bonus coins); BANDCOIN at its
live price, XLM/USDC at the live rate, or card. Held while a run goes, kept on success,
refunded once on failure. `pnpm --filter @bandcoin/api testnet:studio` runs a real
testnet top-up.

Original plan:

- New Next app with the same shell, sign-in and theme as the artist portal.
- `/` home: balance, recent generations, the tools.
- `/coins`: top up with a package or any amount, paid with BANDCOIN, XLM or USDC (one
  signed payment to the treasury, with the cancel countdown) or by card (Square). The
  ledger lists every top-up, spend and refund. No withdraw while it's an in-app balance.
- Prices per generation type in Admin › Settings (`studioPrices`), shown on every
  Generate button before you run it.

**You check:** top up on testnet and see the ledger.

### 6a. Studio live music (backend done 2026-11-04; Studio screens come last)

Live Lyria jams are charged per started minute of playing. The API signs a one-minute
ticket (`music.liveTicket`); the browser opens `/live?ticket=…` on the worker, which
relays to Lyria RealTime (`LiveSession`: connect is free, a minute is held when playing
reaches it, kept once music arrives in it, refunded if none did, pause stops the clock,
ends at 30 minutes or when coins run out). `music.saveRecording` keeps a WAV with the run.
Needs `GEMINI_API_KEY` and the same `NEXTAUTH_SECRET` (or `LIVE_TICKET_SECRET`) on the
API and the worker, and `LIVE_WS_URL` (default `ws://localhost:8080/live`). Verified with
real Lyria on the dev database. The Studio screens (a draft is in `apps/studio/src/features/live`,
not wired in) are built with the rest of the Studio frontend.

### 6b. Studio image, video and writing (backend done 2026-11-04; Google only)

`generate.start` (IMAGE, VIDEO, TEXT, SEO, SOCIAL) prices it, holds the coins and queues
`studio.generate`; the worker calls Google, saves the file (or the text) and keeps the
coins, or refunds them. `generate.library` lists everything you made (filter, paged),
`generate.remove` deletes one. Models: Gemini 3.1 Flash Image, Veo 3.1 Fast (8 s with
sound), Gemini 3.8 Flash. Imagen and Veo 3 no longer exist on the API, and gemini-2.5-flash
was closed to new users, so the model names live in one place (`google.ts`). Image and text
verified against real Google; video not run yet (about $1.20 a clip). OpenAI waits for a
key. "Use as cover / in a post" arrive with the Studio screens.

### 6. Studio generators

- `/text`, `/image`, `/video`, `/music`: prompt, model, cost shown first, history.
  Same models as bandfan (OpenAI: text, DALL-E, Sora; Google: Imagen, Veo) plus music.
- Worker `generation.run`: reserves the price, calls the provider, saves the output to
  storage, then commits the spend; if it fails, the reserve is refunded and the error
  shown. Provider calls are retried; money is not.
- `/library`: everything generated, with "Use as cover", "Use in a post" and download.

**You check:** one generation of each kind, and a failed one refunded.

### 7a. Pin agent and batch pins (backend built 2026-11-04; the chat screen comes with the Studio frontend)

Follows Wadzzo's map agent. `agent.send` queues one message (counts as one of the artist's
50 daily AI generations; admins are unlimited, and it's free for approved artists), the worker
job `agent.run` lets OpenAI call tools (Google places and geocoding, web lists and events,
the artist's own pins, hotspots, events and announcements, collection reports) and shows each
step live through `agent.poll`. The agent only proposes: `agent.confirm` runs a proposal once
through the same services as the forms, `agent.cancel` turns it down. Confirmed `create_pins`
become a `pins.batch` job: one pin per place (or one pin for all), live without admin review,
a place's Google photo and link, shared search tags from the first pin, progress in
`agent.pinJob`, and one bad place never stops the rest. Tests use a fake model; Google was
checked for real; the OpenAI side needs `OPENAI_API_KEY` in the worker's env to try for real.
MCP (built 2026-11-04, as Wadzzo): the portal's `/api/mcp` serves the agent to AI apps with `bc_mcp_…` tokens (Settings › AI apps; only a hash is stored, up to 10 per person); every tool calls the agent API as the token's person, so the daily limit and confirm-before-change rules are the same. Not built: a home area.

### 7. Pin agent and stem editor

- `/agent`: the bandfan pin and hotspot agent (chat). It proposes pins and hotspots as
  drafts with a summary; the artist confirms them in the portal. Worker `agent.run`.
- `/stems`: load stems you own, mix volume and mute per stem, play together, export a
  new track into the catalog as a draft.

**You check:** ask the agent for pins, confirm one; mix and export a track.

### 8a. Facebook post sync (built 2026-11-04; waiting for a Facebook app to try it for real)

Portal Settings › Facebook: Connect Facebook (`/api/facebook/start` → Facebook → `/api/facebook/callback`),
pick a page, and Bandcoin listens to its feed. Meta's webhook (`/api/webhooks/facebook`, checked
against the app secret) queues `facebook.import`; the worker fetches the post, re-hosts its
photos and videos in our storage and creates the post once (a post id is only copied once).
As in the old app, an imported post shows in the feed but has no collectible copies, and the
"auto-publish" setting only exists as a flag: nothing is posted to Facebook. A page can belong to
one artist; if Facebook says access was taken away the connection is dropped. Page tokens are
sealed with `SOCIAL_TOKEN_ENC_KEY`. Needs from you: a Facebook developer app (id, secret,
redirect and webhook set up as in `apps/artist/.env.example`). The old artist's one connection
wasn't carried over (its token was sealed with the old key): they connect again.

### 8. Facebook post sync

- Settings › Facebook: connect a page (Facebook login), choose auto-publish or manual.
- Worker `facebook.sync`: new page posts are copied as posts (text and images), once each.
  Optional: publish a Bandcoin post to the page.

**You check:** with a test page in a Facebook developer app.

### 9. Parity checklist and cutover plan (skipped 2026-11-05)

Production already runs the new apps on the copied data (data copy 2026-11-04). The fan app, the artist portal, the AR app and the
worker are all live, so a cutover and rollback plan is no longer needed. The checklist (`20-parity-checklist.md`) stays as the record of
what was built; clicking through it on production is left for later.

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
