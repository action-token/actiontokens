# The Bandcoin worker: payment checks, music processing (needs ffmpeg) and agent
# jobs, batch pins and hotspot drops. Port 8080 serves /health.
# Build from the repo root:
#   docker build -f apps/worker/Dockerfile -t bandcoin-worker .
# Run with the variables in apps/worker/.env.example:
#   docker run --env-file apps/worker/.env.local -p 8080:8080 bandcoin-worker

FROM node:24-slim AS base
RUN corepack enable
WORKDIR /repo

# Only the worker and the packages it uses, so other apps' changes don't rebuild it.
FROM base AS prune
COPY . .
RUN pnpm dlx turbo@2.11.10 prune @bandcoin/worker --docker

FROM base AS install
# Prisma needs OpenSSL to find the right engine for this system.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=prune /repo/out/json/ ./
# No install scripts yet: packages/db's postinstall runs `prisma generate`, and its schema is only
# copied in the next step. The client is generated explicitly below.
RUN pnpm install --frozen-lockfile --ignore-scripts --filter "@bandcoin/worker..."
COPY --from=prune /repo/out/full/ ./
RUN pnpm --filter @bandcoin/db generate

FROM node:24-slim AS run
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
ENV NODE_ENV=production PORT=8080
WORKDIR /repo
COPY --from=install /repo ./
WORKDIR /repo/apps/worker
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
# Started with node directly, not through pnpm: pnpm would download itself at every start, try
# to reinstall as this non-root user, and sit between the host's SIGTERM and the worker, which
# finishes the job in hand before it exits.
CMD ["node", "--import", "tsx", "src/main.ts"]
