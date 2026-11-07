import { createServer, type Server } from "node:http";

import type { Db } from "@bandcoin/db";

import { IDLE_MS, type RunnerState } from "./runner";

/** The loop counts as alive if it asked for work this recently (or is busy on a job). */
export const STALE_TICK_MS = IDLE_MS * 30;

/** What GET /health answers: 200 while the loop is alive, 503 when it isn't. */
export async function healthOf(db: Db, state: RunnerState, now = Date.now()) {
  const alive =
    state.running.size > 0 ||
    (state.lastTickAt !== null && now - state.lastTickAt.getTime() < STALE_TICK_MS);
  const [queued, failed] = await Promise.all([
    db.job.count({ where: { status: "QUEUED", runAt: { lte: new Date(now) } } }),
    db.job.count({ where: { status: "FAILED" } }),
  ]).catch(() => [null, null] as const);
  return {
    status: alive && queued !== null ? 200 : 503,
    body: {
      ok: alive && queued !== null,
      lastTickAt: state.lastTickAt?.toISOString() ?? null,
      running: [...state.running],
      queued,
      failed,
    },
  };
}

/** The tiny HTTP server the host's health check calls. Nothing else is served. */
export function startHealthServer(db: Db, state: RunnerState, port: number): Server {
  const server = createServer((request, response) => {
    if (request.url !== "/health") {
      response.writeHead(404).end();
      return;
    }
    void healthOf(db, state).then(({ status, body }) => {
      response.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
    });
  });
  server.listen(port);
  return server;
}
