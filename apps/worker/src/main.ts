import { hostname } from "node:os";

import { createChainGateway, lyriaLive } from "@bandcoin/api";
import { db } from "@bandcoin/db/server";

import { handlersFor } from "./handlers";
import { startHealthServer } from "./health";
import { attachLiveRelay } from "./live-relay";
import { DEFAULT_TIMEOUT_MS, newState, positiveInt, slotsFor, startWorker } from "./runner";
import { startSchedules } from "./schedule";

/**
 * The worker process: the job loop, the schedules and the health check.
 * Stopping (SIGTERM from the host) finishes the job in hand first.
 */
const workerId = `${hostname()}:${process.pid}`;
const state = newState();
const handlers = handlersFor({ db, chain: createChainGateway(db) });

const stopSchedules = startSchedules(db);
const health = startHealthServer(db, state, Number(process.env.PORT ?? 8080));
const live = attachLiveRelay(health, { ctx: { db }, connect: lyriaLive() });
console.log(`[worker] ${workerId} running: ${Object.keys(handlers).join(", ")}`);

// How many jobs run at once: ffmpeg jobs have their own loops (the box has two CPUs).
const slots = slotsFor(Object.keys(handlers), {
  general: positiveInt(process.env.WORKER_CONCURRENCY, 3),
  heavy: positiveInt(process.env.WORKER_TRANSCODE_SLOTS, 1),
});
console.log(`[worker] slots: ${slots.map((s) => `${s.count}× ${s.types.length} types`).join(", ")}`);
const worker = startWorker(db, workerId, handlers, state, slots, {
  timeoutMs: positiveInt(process.env.JOB_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
});

async function stop(signal: string) {
  console.log(`[worker] ${signal}: finishing the current job, then stopping`);
  state.stopped = true;
  stopSchedules();
  health.close();
  await live.close();
  await worker.stop();
  await db.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", () => void stop("SIGTERM"));
process.on("SIGINT", () => void stop("SIGINT"));
