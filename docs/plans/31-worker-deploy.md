# 31 · Worker deploy to EC2 (Docker, GitHub Actions)

Decided 2026-11-06: **GitHub Actions** triggers it, the worker runs as **one Docker container**,
**Caddy** on the same server gives HTTPS and the WebSocket, and the **web apps stay on Vercel**.

The first plan used the old shared server (`52.0.7.24`, in another AWS account). It had 1.9 GB of
memory, no swap, and a full disk, and a `pnpm install` on it starved every app there. So the worker
got **its own server**.

## The server

| | |
|---|---|
| Name / id | `bandcoin-worker` · `i-0945aeab1cc369a1d` |
| Account / region | Wadzzo AWS account (827022199028) · us-west-2a (Oregon, same region as the Neon database) |
| Size | t3.small (2 vCPU, 2 GiB) · Ubuntu 24.04 LTS · 20 GiB gp3 · 1 GB swap |
| Address | Elastic IP **54.69.28.110** · SSH user `ubuntu` · key pair `bandcoin-worker` (public half of `bandcoin.pem`) |
| HTTPS name | `54-69-28-110.sslip.io` (free, resolves to the IP; Caddy gets a Let's Encrypt certificate) |
| Open ports | 22, 80, 443 (the worker's 8080 is bound to 127.0.0.1 only) |
| Cost | about **$20.40 a month**: server $15.18 + public IPv4 $3.65 + disk $1.60. About $5.25 while stopped. No free tier in this account. |

What takes the 2 GB: Ubuntu ~250 MB, the worker 150–300 MB, ffmpeg while processing a song 200–500 MB
(bursts), Caddy ~30 MB. Peak is about 1.5 GB; the swap file is the safety net.

## How a push becomes a deploy

1. Push to `main` changes the worker or a package it uses (`.github/workflows/deploy-worker.yml`).
2. The runner tests the worker, builds the image from `apps/worker/Dockerfile`, and streams it
   to the server (`docker save | ssh docker load`). The server never compiles anything.
3. `scripts/deploy-worker.sh` runs on the server: it tags the running image as `previous`,
   stops the container (up to 120 s so the job in hand finishes), starts the new one and waits
   for `/health`. If it never answers, it starts `previous` again and the workflow fails.

The workflow does nothing until the repository variable `DEPLOY_WORKER` is `true`.

## Staying up

- `--restart unless-stopped` brings it back after a crash; Docker starts at boot.
- `scripts/worker-watchdog.sh` (cron on the server, every minute) restarts a container that is
  running but `unhealthy`, and starts one that was left stopped.
- Logs rotate at 10 MB × 5 files. Ubuntu installs security updates by itself.

## Done on the server (2026-11-06)

Swap file, Docker, Caddy (`/etc/caddy/Caddyfile` → `127.0.0.1:8080`, certificate issued),
password logins off, the watchdog and its cron line, and `~/bandcoin/worker.env` (mode 600): the
production database, mainnet Stellar and treasury values, Square production, S3, `OPENAI_API_KEY`,
`GEMINI_API_KEY`, `GOOGLE_MAP_API_KEY`, `NEXTAUTH_SECRET`. **Not set anywhere:** SMTP (no emails),
`SOCIAL_TOKEN_ENC_KEY` (Facebook sync), `LIVE_TICKET_SECRET` (falls back to `NEXTAUTH_SECRET`).
Nothing is deployed yet, so Caddy answers 502 until the first deploy.

## Still to do (owner)

- **GitHub** (`Bandcoin2023/bandcoin` › Settings): secrets `EC2_SSH_KEY` (the whole pem),
  `EC2_HOST` = `54.69.28.110`, `EC2_USER` = `ubuntu`; an environment named `production`;
  variable `DEPLOY_WORKER` = `true`. Then push; the first deploy starts the worker on the
  **production** database.
- **Studio on Vercel**: `LIVE_WS_URL=wss://54-69-28-110.sslip.io/live`, and `NEXTAUTH_SECRET`
  identical to the worker's.
- **Later**: a real name (`worker.bandcoin.io` → A record to 54.69.28.110): change the one line in
  the Caddyfile and `LIVE_WS_URL`.

## Checks after the first deploy

`curl https://54-69-28-110.sslip.io/health` answers 200; a WebSocket opens at `/live`;
`docker kill bandcoin-worker` brings it back within seconds; a push that touches the worker deploys it.
