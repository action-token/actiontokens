import type { Prisma } from "@bandcoin/db";
import { AppError, ErrorCodes } from "@bandcoin/errors";

import type { Context } from "../../context";
import { retryJob } from "../jobs/queue";
import { ADMIN_PAGE } from "./pins";

/**
 * The worker's queue for /admin/jobs: what ran, what's waiting, what failed
 * and why. Only music jobs can be retried here; payment jobs never are
 * (the worker's once-a-minute payment check simply runs again).
 */
type ServiceCtx = Pick<Context, "db" | "activity">;

export const RETRYABLE_JOBS = ["media.transcode"] as const;

export type JobFilter = {
  status?: "failed" | "waiting" | "running" | "done";
  cursor?: string;
};

const STATUS_WHERE: Record<NonNullable<JobFilter["status"]>, Prisma.JobWhereInput> = {
  failed: { status: "FAILED" },
  waiting: { status: "QUEUED" },
  running: { status: "RUNNING" },
  done: { status: "SUCCEEDED" },
};

const itemIdOf = (payload: Prisma.JsonValue) =>
  payload &&
  typeof payload === "object" &&
  !Array.isArray(payload) &&
  typeof payload.itemId === "string"
    ? payload.itemId
    : null;

export async function listJobs(ctx: Pick<Context, "db">, input: JobFilter) {
  const rows = await ctx.db.job.findMany({
    where: input.status ? STATUS_WHERE[input.status] : {},
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: ADMIN_PAGE + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      type: true,
      payload: true,
      status: true,
      attempts: true,
      maxAttempts: true,
      runAt: true,
      lastError: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  const page = rows.slice(0, ADMIN_PAGE);
  // Music jobs name their song, so the admin sees what it was about.
  const itemIds = [
    ...new Set(page.map((row) => itemIdOf(row.payload)).filter((id) => id !== null)),
  ];
  const items = itemIds.length
    ? await ctx.db.item.findMany({
        where: { id: { in: itemIds } },
        select: { id: true, title: true, artist: { select: { name: true } } },
      })
    : [];
  const itemById = new Map(items.map((item) => [item.id, item]));
  return {
    jobs: page.map((row) => {
      const item = itemById.get(itemIdOf(row.payload) ?? "");
      return {
        ...row,
        about: item
          ? { itemId: item.id, title: item.title, artist: item.artist?.name ?? null }
          : null,
        canRetry:
          row.status === "FAILED" && (RETRYABLE_JOBS as readonly string[]).includes(row.type),
      };
    }),
    nextCursor: rows.length > ADMIN_PAGE ? (page.at(-1)?.id ?? null) : null,
  };
}

/** Runs a failed music job again from the first try; its song shows "Processing" again. */
export async function retryAdminJob(ctx: ServiceCtx, jobId: string) {
  const job = await ctx.db.job.findUnique({
    where: { id: jobId },
    select: { id: true, type: true, status: true, payload: true },
  });
  if (!job) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Job not found" });
  ctx.activity.set({ targetType: "Job", targetId: job.id });
  if (!(RETRYABLE_JOBS as readonly string[]).includes(job.type))
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, { message: "Payment jobs aren't retried." });
  if (job.status !== "FAILED")
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
      message: "Only a failed job can be retried.",
    });

  await retryJob(ctx.db, job.id);
  const itemId = itemIdOf(job.payload);
  if (itemId)
    await ctx.db.itemMedia.updateMany({
      where: { itemId, status: "FAILED" },
      data: { status: "PENDING" },
    });
  return { jobId: job.id };
}
