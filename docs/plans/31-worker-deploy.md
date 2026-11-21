# 31 · Worker deploy to EC2 (Docker, GitHub Actions)

Decided 2026-11-06: **GitHub Actions** triggers it, the worker runs as **one Docker container**,
**Caddy** on the same server gives HTTPS and the WebSocket, and the **web apps stay on Vercel**.

The first plan used the old shared server (`52.0.7.24`, in another AWS account). It had 1.9 GB of
memory, no swap, and a full disk, and a `pnpm install` on it starved every app there. So the worker
got **its own server**.

## The server

|                  |                                                                                                                                                                                                                |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name / id        | `actiontokens-worker` · `i-0945aeab1cc369a1d`                                                                                                                                                                  |
| Account / region | Wadzzo AWS account (827022199028) · us-west-2a (Oregon, same region as the Neon database)                                                                                                                      |
| Size             | t3.small (2 vCPU, 2 GiB) · Ubuntu 24.04 LTS · 30 GiB gp3 (grown from 20 on 2026-11-06) · 1 GB swap                                                                                                             |
| Address          | Elastic IP **54.69.28.110** · SSH user `ubuntu` · key pair `actiontokens-worker` (public half of `action-tokens.pem`)                                                                                          |
| HTTPS name       | `actiontokens.54-69-28-110.sslip.io` (this worker, host port 8080). A free name that resolves to the IP; Caddy gets a Let's Encrypt certificate for it. The plain `54-69-28-110.sslip.io` is no longer served. |
| Open ports       | 22, 80, 443 (the worker's 8080 is bound to 127.0.0.1 only)                                                                                                                                                     |
| Cost             | about **$21.23 a month**: server $15.18 + public IPv4 $3.65 + 30 GB disk $2.40. About $6 while stopped. No free tier in this account.                                                                          |

**Shared machine.** The same EC2 instance also runs a container of another project. That project's
repo documents its own deploy, container, port and Caddy site; they share the instance's memory (2 GB),
disk and Docker, so the disk and memory alerts below cover the whole machine.

What takes the 2 GB: Ubuntu ~250 MB, the worker 150–300 MB, ffmpeg while processing a song 200–500 MB
(bursts), Caddy ~30 MB. Peak is about 1.5 GB; the swap file is the safety net.

## How a push becomes a deploy

1. Push to `main` changes the worker or a package it uses (`.github/workflows/deploy-worker.yml`).
2. The runner tests the worker, builds the image from `apps/worker/Dockerfile`, and streams it
   to the server (`docker save | ssh docker load`). The server never compiles anything.
3. `scripts/deploy-worker.sh` runs on the server: it tags the running image as `previous`,
   stops the container (up to 120 s so the job in hand finishes), starts the new one and waits
   for `/health`. If it never answers, it starts `previous` again and the workflow fails.

The workflow does nothing unless the repository variable `DEPLOY_WORKER` is `true` (it is). Each deploy has its own workflow lock, container name, port and env file.

## Staying up

- `--restart unless-stopped` brings it back after a crash; Docker starts at boot.
- `scripts/worker-watchdog.sh` (cron on the server, every minute) restarts a container that is
  running but `unhealthy`, and starts one that was left stopped.
- Logs rotate at 10 MB × 5 files. Ubuntu installs security updates by itself.

## Done on the server (2026-11-06)

Swap file, Docker, Caddy (`/etc/caddy/Caddyfile`: `actiontokens.54-69-28-110.sslip.io` → `127.0.0.1:8080`, certificate
issued), password logins off,
the watchdog and its cron line, and `~/actiontokens/worker.env` (mode 600): the production database,
mainnet Stellar and treasury values, Square production, S3, the Firebase web config the shared
wallet package reads on load, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_MAP_API_KEY`,
`NEXTAUTH_SECRET`, `SOCIAL_TOKEN_ENC_KEY` and the Google SMTP settings (login tested; mail still
needs SPF, DKIM and DMARC records on `action-tokens.io` to avoid spam folders). `LIVE_TICKET_SECRET`
isn't set (falls back to `NEXTAUTH_SECRET`).

The worker has run in production since 2026-11-06 (first working deploy: run 4, commit `a5da19b`).
The treasury's spendable XLM is low (about 1.3 XLM above its reserve), which can fail the
contract-unlock transactions with `tx_insufficient_balance`: top it up.

## Still to do (owner)

- **Studio on Vercel**: `LIVE_WS_URL=wss://actiontokens.54-69-28-110.sslip.io/live`, and
  `NEXTAUTH_SECRET` identical to the worker's.
- **Treasury**: a few XLM, so unlock transactions don't fail.
- **Email**: SPF, DKIM and DMARC records for `action-tokens.io`.
- **Later**: a real name (`worker.action-tokens.io`, an A record to 54.69.28.110): change the site name in
  the Caddyfile, then `LIVE_WS_URL`.

## Checks after the first deploy

`curl https://actiontokens.54-69-28-110.sslip.io/health` answers 200; a WebSocket opens at `/live`;
`docker kill actiontokens-worker` brings it back within seconds; a push that touches the worker deploys it.
