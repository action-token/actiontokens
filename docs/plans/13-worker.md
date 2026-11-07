# 13 · Worker (phase 8, first version)

`apps/worker`: an always-on Node process (decided 2026-10-31) that finishes
stuck payments and processes uploaded music. It uses the same database and
`@bandcoin/api` services as the apps, so a job does exactly what the app would.

## Decisions (asked 2026-10-31)

| Question      | Answer                                                                         |
| ------------- | ------------------------------------------------------------------------------ |
| Where         | **Small always-on server** (Railway / Fly / a VPS), like Wadzzo's task server. |
| First version | **Payment re-checks + music processing.**                                      |

## 1. Payment re-checks (`order.reconcile`, every minute)

Eight flows leave an order `SUBMITTED` when the network's answer is lost
("for the worker to re-check"). Every minute the worker takes those older than
a minute and asks Horizon about the order's `txHash`:

| Horizon says                                     | Worker does                                                     |
| ------------------------------------------------ | --------------------------------------------------------------- |
| Landed, successful                               | Finishes it exactly as the app would (see below) → `DELIVERED`  |
| Landed, failed                                   | `FAILED` with Stellar's code; a card order's charge is refunded |
| Not found, and past the transaction's time limit | `FAILED` (it can never land now); card refunded                 |
| Not found yet, still inside the time limit       | Leaves it for the next minute                                   |

**Finishing** is the part after "submit" in each flow (deliver the item,
link the artist's account, record the gift, extend the short link, move the
stock…). Today it sits inside each `submit…` function. Each flow gets one
exported `finish…(ctx, order)` that both `submit…` and the worker call, so
there's a single copy of it. Kinds: item purchase, gift, short link, recharge,
XLM swap, activation, issuer setup, storage setup, storage stock, storage
withdraw, NFT register. Each is tested both ways (app submit, worker finish),
and running a finish twice does nothing the second time.

**No retries for payments** (decided 2026-10-31): `order.reconcile` runs once
per minute and is never retried on failure; the payment toasts don't wait or
offer "try again" on an order, and Admin › Jobs has no Retry for payment jobs.

Every change is in the activity log as the system (`app: "worker"`), so it
shows on the person's timeline. The Alerts page's "stuck payment" alert then
only shows what the worker couldn't settle.

## 2. Music processing (`media.transcode`)

New and replaced recordings are saved `PENDING` and get a job. The worker:

1. Downloads the upload, reads its length (`ffprobe`).
2. Makes the **stream** (AAC 256 kbps `.m4a`), the **30 s preview** cut from
   the artist's preview start, and a **waveform** (peaks as JSON). The ffmpeg
   recipes are ported from the old bandfan worker (`package/express-wadzzo`):
   loudness normalised to −14 LUFS, a 128 kbps preview with fades in and out,
   and stems left un-normalised.
3. Stores them in the bucket under private keys (owners get signed links, as
   `playbackFor` already expects) and marks the media `READY`.

Changing the preview start re-cuts only the preview. A file ffmpeg can't read
ends `FAILED`; the song still plays from the original upload, and the artist
sees "Couldn't process the recording" on the song with a Retry. Existing
songs (`LEGACY`) keep working as now; one command processes them in batches
when you want
(`pnpm --filter @bandcoin/worker backfill:music 50`). Stems for people who
don't own the song still get their 30 s cut from the original file.

## The worker itself

- **Queue:** the existing `Job` table. Workers take jobs with
  `FOR UPDATE SKIP LOCKED`, so two copies never take the same one; failures
  retry with backoff (1, 5, 15, 60 min) up to 5 times, then `FAILED`.
- **Schedules:** a small in-process timer enqueues `order.reconcile` each
  minute (one at a time).
- **Health:** `GET /health` (last tick, queue size) for the host's checks;
  graceful stop finishes the running job.
- **Admin › Jobs:** recent and failed jobs with their error, and a Retry
  button on music jobs only (none on payment jobs).
- **Ships as** `apps/worker/Dockerfile` (Node 24 + ffmpeg, built from the repo
  root with `turbo prune`) and `apps/worker/.env.example`. It needs no wallet
  secrets: the worker never signs.
  Picking the host and deploying is a separate step with you; nothing is
  deployed by this plan.

## Order of work

1. Worker skeleton: queue, retries, schedule, health, tests.
2. `finish…` per payment kind + `order.reconcile`, tests per kind.
3. Music processing + song status in the portal, tests with a short sample file.
4. Admin › Jobs.
5. Dockerfile, env example, a dry run against the dev database.

## Risks

- **Money:** finishing a payment twice must be impossible. Each finish checks
  the order's state in the same database transaction and is tested twice-run.
- **Card refunds** go through Square sandbox in dev only.
- **ffmpeg** output differs by version; tests check length and format, not bytes.

## State on 2026-11-04 (plan complete, extended)

Everything above is built: queue with retries, schedules, health, payment re-checks, music
processing, Admin › Jobs (Retry on music jobs only), Dockerfile and env example. Since then the
worker also runs:

| Job | Runs | Retried? |
|---|---|---|
| `nft.unlocks`, `nft.keep-alive` | on a clock | yes (they only record, and can repeat) |
| `hotspot.drop`, `vanity.expire` | on a clock | no, the next tick picks up what's due |
| `studio.sweep` | every 10 min | no |
| `studio.music`, `studio.generate` | when asked | **never**: coins are held, so one attempt |
| `agent.run`, `pins.batch` | when asked | **never**: a retry could answer twice or double the pins |
| live music relay | WebSocket `/live` on the health port | n/a |

Changes made while finishing it:

- **A worker that dies mid-job no longer re-runs a once-only job.** Stale jobs (RUNNING for over 5
  minutes since the worker last touched them) used to go back in the queue whatever their attempts; now a job that used its attempts is
  marked FAILED ("The worker stopped…") and only jobs with attempts left are queued again.
- **Jobs run in parallel, like the Wadzzo worker.** `WORKER_CONCURRENCY` loops (default 3) take
  every job type except ffmpeg work, which has its own `WORKER_TRANSCODE_SLOTS` loops (default 1) so
  two transcodes never fight over the CPU and a long one never holds up an agent reply. A running
  job touches its row every 30 s (so a long job isn't taken for a dead one), and one running past
  `JOB_TIMEOUT_MS` (default 15 min) is failed and its loop moves on (the handler itself isn't
  stopped). Jobs a dead worker left behind are put back by a 30 s timer, not inside the loop.
- **The worker does sign one thing:** the treasury's NFT unlock records (`TREASURY_SECRET`). The env
  example said it never signs; it now lists every variable the jobs read (Gemini, OpenAI, Google Maps,
  the live-ticket secret) and says which are optional.
- A test checks every job type has a handler and nothing paid is put on a schedule.

Dry run against the dev database: all six scheduled jobs ran and succeeded, all 11 handlers
registered, and SIGTERM stopped it cleanly. Not run: the Docker image (no Docker engine was running)
and the live-music relay behind a real host's WebSocket proxy. Deploying stays a separate step.
