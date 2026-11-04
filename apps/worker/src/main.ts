import { hostname } from "node:os";

import { createChainGateway, lyriaLive } from "@bandcoin/api";
import { db } from "@bandcoin/db/server";

import { handlersFor } from "./handlers";
import { startHealthServer } from "./health";
import { attachLiveRelay } from "./live-relay";
import { runLoop, type RunnerState } from "./runner";
import { startSchedules } from "./schedule";

/**
 * The worker process: the job loop, the schedules and the health check.
 * Stopping (SIGTERM from the host) finishes the job in hand first.
 */
const workerId = `${hostname()}:${process.pid}`;
const state: RunnerState = { lastTickAt: null, running: null, stopped: false };
const handlers = handlersFor({ db, chain: createChainGateway(db) });

const stopSchedules = startSchedules(db);
const health = startHealthServer(db, state, Number(process.env.PORT ?? 8080));
const live = attachLiveRelay(health, { ctx: { db }, connect: lyriaLive() });
console.log(`[worker] ${workerId} running: ${Object.keys(handlers).join(", ")}`);

const loop = runLoop(db, workerId, handlers, state);

async function stop(signal: string) {
  console.log(`[worker] ${signal}: finishing the current job, then stopping`);
  state.stopped = true;
  stopSchedules();
  health.close();
  await live.close();
  await loop;
  await db.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", () => void stop("SIGTERM"));
process.on("SIGINT", () => void stop("SIGINT"));
