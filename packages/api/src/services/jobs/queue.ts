import type { Db, Job, Prisma } from "@bandcoin/db";

/**
 * The background job queue (the `jobs` table). Apps add jobs; the worker
 * (apps/worker) takes one at a time with FOR UPDATE SKIP LOCKED, so two
 * worker copies never run the same job. A failed job waits longer each time
 * (1, 5, 15, 60 minutes) and gives up after `maxAttempts`.
 */
export const RETRY_MINUTES = [1, 5, 15, 60] as const;

/**
 * A job still RUNNING this long after its worker last touched it belonged to a worker that died.
 * A live worker touches its job every HEARTBEAT_MS, however long the job takes.
 */
export const STALE_AFTER_MS = 5 * 60_000;
export const HEARTBEAT_MS = 30_000;

export type JobType =
  | "order.reconcile"
  | "media.transcode"
  | "nft.unlocks"
  | "nft.keep-alive"
  | "hotspot.drop"
  | "vanity.expire"
  | "pins.batch"
  | "agent.run"
  | "facebook.import"
  | "stories.sweep"
  | "resale.verify"
  | "follows.sync"
  | "domains.check";
export const JOB_TYPES: readonly JobType[] = [
  "order.reconcile",
  "media.transcode",
  "nft.unlocks",
  "nft.keep-alive",
  "hotspot.drop",
  "vanity.expire",
  "pins.batch",
  "agent.run",
  "facebook.import",
  "stories.sweep",
  "resale.verify",
  "follows.sync",
  "domains.check",
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

/** The worker says it is still alive and on this job (moves `lockedAt`, which staleness is measured from). */
export async function heartbeatJob(db: Db, job: Pick<Job, "id">, now = new Date()) {
  await db.job.updateMany({ where: { id: job.id, status: "RUNNING" }, data: { lockedAt: now } });
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

/**
 * Deals with jobs whose worker stopped mid-run, so none stays RUNNING for ever:
 * one with attempts left goes back in the queue; one that has used them all
 * (a job meant to run once, like a payment or a paid AI run) is marked FAILED,
 * never run a second time.
 */
export async function releaseStaleJobs(db: Db, now = new Date()) {
  const stale = await db.job.findMany({
    where: { status: "RUNNING", lockedAt: { lt: new Date(now.getTime() - STALE_AFTER_MS) } },
    select: { id: true, attempts: true, maxAttempts: true },
  });
  const spent = stale.filter((job) => job.attempts >= job.maxAttempts).map((job) => job.id);
  const again = stale.filter((job) => job.attempts < job.maxAttempts).map((job) => job.id);
  if (spent.length > 0)
    await db.job.updateMany({
      where: { id: { in: spent }, status: "RUNNING" },
      data: {
        status: "FAILED",
        lockedAt: null,
        lockedBy: null,
        lastError: "The worker stopped while this was running. It isn't run again automatically.",
      },
    });
  if (again.length > 0)
    await db.job.updateMany({
      where: { id: { in: again }, status: "RUNNING" },
      data: { status: "QUEUED", lockedAt: null, lockedBy: null, runAt: now },
    });
  return stale.length;
}

/** Admin › Jobs: run a failed or finished job again now, with fresh attempts. */
export async function retryJob(db: Db, jobId: string) {
  return db.job.update({
    where: { id: jobId },
    data: { status: "QUEUED", runAt: new Date(), attempts: 0, lastError: null },
  });
}
