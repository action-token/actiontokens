# 30 · Audit of plans 26–29 (2026-11-05): what was added, what waits

Plans 26 (shared sidebar), 27 (wallet Send/Swap), 28 (Studio redesign) and 29
(Mixer) were checked against the code. This records what was built beyond
them, what the audit closed, and what is deliberately left for later.

## Built beyond the plans

- **Studio background glow** (Gemini-style): four drifting colour fields,
  transform/opacity only, no blur filters, no backdrop blur over it; stops
  under reduced motion.
- **Studio tool pages have no header bar.** The tool's name shows large in its
  empty state; each page keeps a hidden `h1`.
- **Sign-in switch fix:** a change of account empties every cached query
  (`forgetAccountData`) in app, artist, studio and AR; the marketplace sidebar
  goes by the session; Studio sign-out stays on the page.
- **Fonts:** display face is Bricolage Grotesque, weight 800, width 75%
  (Unbounded and Anton were tried and rejected); the `display` utility is
  uppercase with 0.9 line height; `TallText` no longer squeezes sideways.
- **Wadzzo's type scale** in the marketplace and shared patterns: page titles
  `text-[2.75rem] → 7xl`, section titles `4xl → 5xl`, smaller display text
  stepped up. The sidebar is unchanged.
- **Mixer uploads:** any audio the browser can play, zips unpacked in the
  browser (audio only), each file opened before upload, and a loading row per
  file with its stage. The server accepts any `audio/*` type.
- **Mixer Publish is for artists:** locked for everyone else, with Join as
  Artist (pending and rejected pages get their own message).

## Closed by this audit

- **Providers that aren't set up:** a model whose provider has no API key
  (`GEMINI_API_KEY`, `OPENAI_API_KEY`) shows "Not set up yet" and can't be
  picked; the default skips it; `startGeneration` refuses it before anything is
  held. (`providerReady`, `catalog(...).available`.) Music isn't covered: it
  still fails at run time without the Gemini key.

- **Mixer audio engine test** (`engine.test.ts`): every clip of a track starts
  on the shared clock with the track's volume and pan, playing from the middle
  skips what's over, and fades ramp the volume.
- **Artist portal text:** page titles were already at Wadzzo's size; display
  text inside portal pages is now stepped up the same way (74 strings). The
  wallet's right column was constrained so its card no longer overflows.
- **Wallet gifts test:** already existed (a token with no item is listed by
  its code and sender); the audit was wrong to call it missing.

## Waiting (skip for now)

- **Pricing** (see the 2026-11-05 cost check):
  - Bonus packages cut the markup to ~17% (Creator) and ~11% (Studio), and card
    fees can take most of a small card top-up. Decide whether to trim the
    bonuses or raise prices.
  - Provider costs in the catalog are estimates; replace them with real billing
    figures in Admin › Settings.
  - No earnings report: add spend minus provider cost, per model, to the admin
    dashboard.
- **Mixer on phones:** not designed or tested.
- **Mixer browser checks:** Export WAV and the locked Publish view haven't
  been checked in the browser.
- **Editing a previous Studio result:** still later, as plan 28 says.
- **Wallet:** a real signed Send and Swap (needs Albedo approval from the
  owner); the treasury must hold XLM and BANDCOIN.

## Owner's list (not mine to do)

- Add the Google and OpenAI keys to the Studio and worker env files, then
  rotate the keys that were pasted into chat.
- `apps/studio/.env.local`: `NEXTAUTH_URL` points at port 3001; it should be
  3102.
- `apps/ar/.env.production` has wrong URLs.
- The production worker wasn't processing jobs; check it.
- Dev database: `activity_logs_pkey` duplicate-key errors on every upload log
  (the ID counter looks behind).
