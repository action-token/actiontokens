import { claimJob, completeJob, failJob, releaseStaleJobs } from "@bandcoin/api";
import type { Db, Job, Prisma } from "@bandcoin/db";
import { isAppError } from "@bandcoin/errors";

/** What one job type does. Its result is stored on the job; throwing schedules a retry. */
export type JobHandler = (
  job: Job,
) => Promise<{ result?: Prisma.InputJsonValue; target?: { type: string; id: string } } | void>;

export type RunnerState = {
  /** When the loop last asked for work: the health check's heartbeat */
  lastTickAt: Date | null;
  running: Job["id"] | null;
  stopped: boolean;
};

/** How long to wait before asking again when there was nothing to do. */
export const IDLE_MS = 2_000;

/**
 * Runs one job if one is due: take it, run its handler, mark it done (or
 * schedule a retry), and write an activity row as the system. Returns
 * whether it did any work.
 */
export async function runOnce(
  db: Db,
  workerId: string,
  handlers: Record<string, JobHandler>,
  state: RunnerState,
): Promise<boolean> {
  state.lastTickAt = new Date();
  await releaseStaleJobs(db);
  const job = await claimJob(db, workerId, Object.keys(handlers));
  if (!job) return false;

  state.running = job.id;
  const startedAt = Date.now();
  let error: unknown = null;
  let target: { type: string; id: string } | undefined;
  try {
    const outcome = (await handlers[job.type]!(job)) ?? {};
    target = outcome.target;
    await completeJob(db, job, outcome.result);
  } catch (caught) {
    error = caught;
    await failJob(db, job, caught);
  } finally {
    state.running = null;
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

/** The loop: work while there is work, rest when there isn't, stop when asked. */
export async function runLoop(
  db: Db,
  workerId: string,
  handlers: Record<string, JobHandler>,
  state: RunnerState,
  sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
) {
  while (!state.stopped) {
    let worked = false;
    try {
      worked = await runOnce(db, workerId, handlers, state);
    } catch (error) {
      // The database blinked: wait and carry on rather than crash the process.
      console.error("[worker] loop error", error);
    }
    if (!worked) await sleep(IDLE_MS);
  }
}
