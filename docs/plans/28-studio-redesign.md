# 28 — Studio redesign: the Action Tokens look, an AI-studio workflow

Studio worked but looked like a plain list of cards, and only Music and the
Mixer had screens (Images, Video and Writing said "Coming soon" though the
server already runs them). This makes Studio look like the marketplace, the
artist portal and AR, and work like an AI provider's dashboard (Gemini,
ChatGPT), building on the old bandfan AI pages ("Let's create", model and
settings, credits, history).

## Decisions (2026-11-05)

- **Look:** the same as the marketplace / portal / AR: the shared sidebar
  (`SideFrame`), squeezed uppercase display words, blobs, marker labels.
- **Sidebar:** the shared one, plus your latest creations under the links.
- **Home:** "LET'S CREATE": one big prompt box with tool chips, then your
  recent creations.
- **Tools:** a chat-style thread: your prompts and their results stacked, the
  prompt box pinned at the bottom with the **model menu inside it** and the
  settings that model supports as chips, and the price on the button.
- **Providers:** OpenAI and Google. The OpenAI key (`OPENAI_API_KEY`) is added
  to the Studio and worker env by the owner; I don't edit env files.
- **Pricing:** per model: its API cost (Admin › Settings) × (1 + the 30% fee),
  times what the options ask for (images, seconds, quality), rounded up to
  whole coins. 1 coin = $0.01, as today.
- **Follow-ups:** each prompt stands alone; "Use this prompt again" puts an
  earlier prompt back in the box. Editing a previous result can come later.
- **Enhance prompt:** free (the platform pays the small text-model cost, the
  owner's choice); it rewrites the prompt in the box, nothing is generated.
- **Scope:** everything in one round: the shell, home, the five missing tools,
  a Library, and Music, Mixer and Coins restyled.

## Screens

### Sidebar (shared `SideFrame`, tagline "studio")

- _create_: CREATE (home), IMAGES, VIDEO, MUSIC, WRITING, SOCIAL, SEO.
- _your work_: MIXER, LIBRARY, COINS.
- _recent_: your last 8 creations (tool icon + prompt), each opening its
  thread at that result. Needs a small `SideFrame` slot after the links.
- Header: a round "New" button (back to Create) and your coins.
- Tiles: Marketplace and Artist portal. Balance card: your coins, "Top up".
- Folds to the rail like the other apps; phones get a top bar and tabs.

### Home: LET'S CREATE

The big squeezed title, a large prompt box with chips (Image, Video, Music,
Writing, Social, SEO) and the model menu; sending it opens that tool's thread
with the run started. Under it: recent creations as a grid of cards.

### A tool's thread (Images, Video, Music, Writing, Social, SEO)

- Each run is one exchange: your prompt on the right; the result on the left:
  images in a grid (click to view large), the video player, the text with
  Copy, social variations as cards, the SEO article with its meta tags.
- Under each result: the model, what it cost, when, and Download / Copy /
  Use this prompt again / Remove. While running: progress; failed: the reason
  and "refunded".
- The prompt box: the text, **[model ▾]** (grouped by provider, each with
  what it's best at and its price), then only the chips that model supports
  (ratio, style, number of images, length, quality, size). Social and SEO add
  a "More" popover for their extra fields (platform, tone, word count…).
  **Generate · 12 coins**; short on coins → "Top up".
- Music: Clip and Full song are models in the menu; Live jam stays its own
  panel on the Music page.

### Library

Everything you've made, as a grid, filtered by tool; open, download, remove.

### Coins

Laid out like the wallet: a block with your coins big and Top up, the
packages, then the history.

### Mixer

Unchanged features, restyled to match.

## Server

- **Model catalog** (`services/studio/models.ts`): one entry per model:
  id, provider, tool, name, what it's best at, and its capabilities (ratios,
  sizes, counts, durations, qualities, styles) and how it's billed (per image,
  per second, per run). The one place model ids live; each id checked against
  the provider's docs when built.
- **Input:** `generateInput` gains `model` (a default per tool) and the
  options; the server refuses an option the chosen model doesn't support.
- **Pricing:** `prices` returns a price per model; a run's price is computed
  from the model and options on the server, held on start, refunded on
  failure (unchanged).
- **OpenAI adapter** next to `google.ts`: images, video (Sora) and text,
  same shape as the Google one, so the worker runs either.
- Admin › Settings: an API cost per model instead of per tool.

## Tests (first)

- Catalog: every model's defaults are valid; a model refuses an unsupported
  option.
- Pricing: per model and per option, rounding up, the fee.
- Input: a model from another tool is refused; defaults fill in.
- OpenAI adapter: builds the right request and reads the result (fake
  fetch); a provider error becomes a failed, refunded run.

## Risks

- Model ids change often: one catalog, checked at build time, easy to edit.
- OpenAI runs need the key in env; without it OpenAI models show as
  unavailable rather than failing.
