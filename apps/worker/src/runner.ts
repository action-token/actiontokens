import {
  claimJob,
  completeJob,
  failJob,
  HEARTBEAT_MS,
  heartbeatJob,
  releaseStaleJobs,
} from "@actiontokens/api";
import type { Db, Job, Prisma } from "@actiontokens/db";
import { isAppError } from "@actiontokens/errors";

/** What one job type does. Its result is stored on the job; throwing schedules a retry. */
export type JobHandler = (
  job: Job,
) => Promise<{ result?: Prisma.InputJsonValue; target?: { type: string; id: string } } | void>;

export type RunnerState = {
  /** When any loop last asked for work: the health check's heartbeat */
  lastTickAt: Date | null;
  /** The jobs being run right now (one per busy loop) */
  running: Set<Job["id"]>;
  stopped: boolean;
};

export const newState = (): RunnerState => ({
  lastTickAt: null,
  running: new Set(),
  stopped: false,
});

/** How long to wait before asking again when there was nothing to do. */
export const IDLE_MS = 2_000;
/** How often jobs a dead worker left RUNNING are put back. */
export const MAINTENANCE_MS = 30_000;
/** A job running longer than this is failed (see `timeoutMs`). */
export const DEFAULT_TIMEOUT_MS = 15 * 60_000;

/** Job types that are heavy on CPU: they get their own loops so they never crowd out the rest. */
export const HEAVY_TYPES: readonly string[] = ["media.transcode"];

export type RunOptions = {
  /** Only take these job types (default: every type that has a handler). */
  types?: readonly string[];
  /** The handler is not stopped, only given up on: the job fails and the loop moves on. */
  timeoutMs?: number;
  heartbeatMs?: number;
};

/**
 * Runs one job if one is due: take it, run its handler, mark it done (or
 * schedule a retry), and write an activity row as the system. While the
 * handler runs, the database is told every few seconds that this worker is
 * alive, so a long job is never mistaken for one whose worker died. Returns
 * whether it did any work.
 */
export async function runOnce(
  db: Db,
  workerId: string,
  handlers: Record<string, JobHandler>,
  state: RunnerState,
  options: RunOptions = {},
): Promise<boolean> {
  state.lastTickAt = new Date();
  const job = await claimJob(db, workerId, options.types ?? Object.keys(handlers));
  if (!job) return false;

  state.running.add(job.id);
  const startedAt = Date.now();
  const beat = setInterval(
    () => void heartbeatJob(db, job).catch(() => undefined),
    options.heartbeatMs ?? HEARTBEAT_MS,
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  let error: unknown = null;
  let target: { type: string; id: string } | undefined;
  try {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Job timed out after ${Math.round(timeoutMs / 1000)}s`)),
        timeoutMs,
      );
    });
    const outcome = (await Promise.race([handlers[job.type]!(job), timeout])) ?? {};
    target = outcome.target;
    await completeJob(db, job, outcome.result);
  } catch (caught) {
    error = caught;
    await failJob(db, job, caught);
  } finally {
    clearInterval(beat);
    clearTimeout(timer);
    state.running.delete(job.id);
  }
  await recordJob(db, job, { error, target, durationMs: Date.now() - startedAt });
  return true;
}

/** One activity row per run, so admins see the worker next to everything else. */
async function recordJob(
  db: Db,
  job: Job,
  run: { error: unknown; target?: { type: string; id: string }; durationMs: number },
) {
  try {
    await db.activityLog.create({
      data: {
        actorRole: "SYSTEM",
        action: `job.${job.type}`,
        targetType: run.target?.type ?? "Job",
        targetId: run.target?.id ?? job.id,
        input: { jobId: job.id, attempt: job.attempts, payload: job.payload },
        status: run.error ? "FAILED" : "SUCCESS",
        errorCode: run.error ? (isAppError(run.error) ? run.error.code : "INTERNAL") : null,
        app: "worker",
        durationMs: run.durationMs,
      },
    });
  } catch (logError) {
    console.error("[worker] couldn't write the activity row", logError);
  }
}

/** One loop: work while there is work, rest when there isn't, stop when asked. */
export async function runLoop(
  db: Db,
  workerId: string,
  handlers: Record<string, JobHandler>,
  state: RunnerState,
  options: RunOptions = {},
  sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
) {
  while (!state.stopped) {
    let worked = false;
    try {
      worked = await runOnce(db, workerId, handlers, state, options);
    } catch (error) {
      // The database blinked: wait and carry on rather than crash the process.
      console.error("[worker] loop error", error);
    }
    if (!worked && !state.stopped) await sleep(IDLE_MS);
  }
}

/** A group of loops that take the same job types. */
export type Slot = { types: string[]; count: number };

/** A whole number above zero from an env value, else the fallback. */
export function positiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/**
 * Heavy types (ffmpeg) get their own loops and everything else shares the
 * general ones, so a long transcode never holds up an agent reply and two
 * transcodes never fight over the CPU. Every group has at least one loop.
 */
export function slotsFor(
  handlerTypes: readonly string[],
  counts: { general: number; heavy: number },
): Slot[] {
  const heavy = handlerTypes.filter((type) => HEAVY_TYPES.includes(type));
  const general = handlerTypes.filter((type) => !HEAVY_TYPES.includes(type));
  return [
    { types: general, count: Math.max(1, counts.general) },
    { types: heavy, count: Math.max(1, counts.heavy) },
  ].filter((slot) => slot.types.length > 0);
}

/**
 * Starts every loop and the timer that puts back jobs a dead worker left
 * running. `stop()` takes no new job and waits for the ones in hand.
 */
export function startWorker(
  db: Db,
  workerId: string,
  handlers: Record<string, JobHandler>,
  state: RunnerState,
  slots: Slot[],
  options: Omit<RunOptions, "types"> = {},
) {
  const tidy = () =>
    void releaseStaleJobs(db).catch((error: unknown) =>
      console.error("[worker] couldn't release stale jobs", error),
    );
  tidy();
  const maintenance = setInterval(tidy, MAINTENANCE_MS);
  const loops = slots.flatMap((slot) =>
    Array.from({ length: slot.count }, () =>
      runLoop(db, workerId, handlers, state, { ...options, types: slot.types }),
    ),
  );
  return {
    stop: async () => {
      state.stopped = true;
      clearInterval(maintenance);
      await Promise.all(loops);
    },
  };
}
