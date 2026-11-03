import type { Db, Job, Prisma } from "@bandcoin/db";

/**
 * The background job queue (the `jobs` table). Apps add jobs; the worker
 * (apps/worker) takes one at a time with FOR UPDATE SKIP LOCKED, so two
 * worker copies never run the same job. A failed job waits longer each time
 * (1, 5, 15, 60 minutes) and gives up after `maxAttempts`.
 */
export const RETRY_MINUTES = [1, 5, 15, 60] as const;

/** A job still RUNNING this long after it was taken belonged to a worker that died. */
export const STALE_AFTER_MS = 15 * 60_000;

export type JobType =
  | "order.reconcile"
  | "media.transcode"
  | "nft.unlocks"
  | "nft.keep-alive"
  | "hotspot.drop";
export const JOB_TYPES: readonly JobType[] = [
  "order.reconcile",
  "media.transcode",
  "nft.unlocks",
  "nft.keep-alive",
  "hotspot.drop",
];

/**
 * Adds a job. With `dedupe`, a job of the same type and payload that is
 * still waiting or running is reused instead (one transcode per song).
 */
export async function enqueueJob(
  db: Db,
  type: JobType,
  payload: Prisma.InputJsonObject,
  options: { runAt?: Date; dedupe?: boolean; maxAttempts?: number } = {},
): Promise<Job> {
  if (options.dedupe) {
    const existing = await db.job.findFirst({
      where: { type, status: { in: ["QUEUED", "RUNNING"] }, payload: { equals: payload } },
    });
    if (existing) return existing;
  }
  return db.job.create({
    data: {
      type,
      payload,
      runAt: options.runAt ?? new Date(),
      ...(options.maxAttempts ? { maxAttempts: options.maxAttempts } : {}),
    },
  });
}

/** Takes the next due job of a type this worker knows, or null when there is none. */
export async function claimJob(
  db: Db,
  workerId: string,
  types: readonly string[],
): Promise<Job | null> {
  const rows = await db.$queryRaw<Job[]>`
    UPDATE jobs SET status = 'RUNNING', "lockedAt" = now(), "lockedBy" = ${workerId},
           attempts = attempts + 1, "updatedAt" = now()
    WHERE id = (
      SELECT id FROM jobs
      WHERE status = 'QUEUED' AND "runAt" <= now() AND type = ANY(${[...types]}::text[])
      ORDER BY "runAt" LIMIT 1 FOR UPDATE SKIP LOCKED
    )
    RETURNING *`;
  return rows[0] ?? null;
}

export async function completeJob(db: Db, job: Pick<Job, "id">, result?: Prisma.InputJsonValue) {
  await db.job.update({
    where: { id: job.id },
    data: { status: "SUCCEEDED", lockedAt: null, lockedBy: null, lastError: null, result },
  });
}

/** When a failed job runs next, or null when it has used its attempts. */
export function retryAt(attempts: number, maxAttempts: number, now = new Date()): Date | null {
  if (attempts >= maxAttempts) return null;
  const minutes = RETRY_MINUTES[Math.min(attempts, RETRY_MINUTES.length) - 1] ?? 60;
  return new Date(now.getTime() + minutes * 60_000);
}

/** Records the error and either schedules a retry or gives up. */
export async function failJob(
  db: Db,
  job: Pick<Job, "id" | "attempts" | "maxAttempts">,
  error: unknown,
  now = new Date(),
) {
  const next = retryAt(job.attempts, job.maxAttempts, now);
  const message = error instanceof Error ? error.message : String(error);
  await db.job.update({
    where: { id: job.id },
    data: {
      status: next ? "QUEUED" : "FAILED",
      runAt: next ?? undefined,
      lockedAt: null,
      lockedBy: null,
      lastError: message.slice(0, 2000),
    },
  });
  return { retryAt: next };
}

/** Puts back jobs whose worker stopped mid-run, so they aren't stuck as RUNNING. */
export async function releaseStaleJobs(db: Db, now = new Date()) {
  const { count } = await db.job.updateMany({
    where: { status: "RUNNING", lockedAt: { lt: new Date(now.getTime() - STALE_AFTER_MS) } },
    data: { status: "QUEUED", lockedAt: null, lockedBy: null, runAt: now },
  });
  return count;
}

/** Admin › Jobs: run a failed or finished job again now, with fresh attempts. */
export async function retryJob(db: Db, jobId: string) {
  return db.job.update({
    where: { id: jobId },
    data: { status: "QUEUED", runAt: new Date(), attempts: 0, lastError: null },
  });
}
