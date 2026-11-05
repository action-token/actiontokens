# 31 · Worker deploy to EC2 (Docker, GitHub Actions)

Decided 2026-11-06: **GitHub Actions** triggers it, the worker runs as **one Docker container**,
**Caddy** on the same server gives HTTPS and the WebSocket, and the **web apps stay on Vercel**.
The old `express-bandcoin` (PM2) is not touched; both can share the server.

## How a push becomes a deploy

1. Push to `main` changes the worker or a package it uses (`.github/workflows/deploy-worker.yml`).
2. The runner tests the worker, builds the image from `apps/worker/Dockerfile`, and streams it
   to the server (`docker save | ssh docker load`). The server never compiles anything.
3. `scripts/deploy-worker.sh` runs on the server: it tags the running image as `previous`,
   stops the container (up to 120 s so the job in hand finishes), starts the new one and waits
   for `/health`. If it never answers, it starts `previous` again and the workflow fails.

The workflow does nothing until the repository variable `DEPLOY_WORKER` is `true`.

## Staying up

- `--restart unless-stopped` brings it back after a crash or a reboot (Docker is enabled at boot).
- `scripts/worker-watchdog.sh` (cron, every minute) restarts a container that is running but
  `unhealthy`, and starts one that was left stopped.
- Logs rotate at 10 MB × 5 files.

## One-time setup

**Server** (as the SSH user): Docker (`systemctl enable --now docker`, user in the `docker`
group), Caddy, `mkdir ~/bandcoin`, the env file `~/bandcoin/worker.env` (from
`apps/worker/.env.example`, production values, mode 600), the watchdog cron line.

**Caddy** (`/etc/caddy/Caddyfile`): `worker.<domain> { reverse_proxy 127.0.0.1:8080 }`. The DNS A
record points at the server. Open ports 80 and 443 only; 8080 stays bound to 127.0.0.1.
If the old express app already uses 8080, set `HOST_PORT` for the deploy and the Caddy upstream.

**GitHub** (`Bandcoin2023/bandcoin` › Settings): secrets `EC2_SSH_KEY` (the whole pem),
`EC2_HOST`, `EC2_USER`; an `production` environment; variable `DEPLOY_WORKER=true`.

**Studio on Vercel**: `LIVE_WS_URL=wss://worker.<domain>/live`, and `NEXTAUTH_SECRET` identical
to the worker's.

## Checks

`curl https://worker.<domain>/health` answers 200; a WebSocket opens at `/live`; killing the
container (`docker kill`) brings it back within seconds; a push to `main` that touches the
worker deploys it.
