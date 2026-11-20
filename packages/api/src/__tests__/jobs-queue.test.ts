import { describe, expect, it, vi } from "vitest";

import type { Db } from "@actiontokens/db";

import {
  enqueueJob,
  failJob,
  releaseStaleJobs,
  retryAt,
  retryJob,
  STALE_AFTER_MS,
} from "../services/jobs/queue";

const now = new Date("2026-10-31T12:00:00Z");
const minutes = (date: Date | null) => (date ? (date.getTime() - now.getTime()) / 60_000 : null);

function setup(existing: Record<string, unknown> | null = null) {
  const db = {
    job: {
      findFirst: vi.fn().mockResolvedValue(existing),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: "j1", ...data }),
      ),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
  };
  return { db: db as unknown as Db, mock: db };
}

describe("job queue", () => {
  it("adds a job, or reuses one still waiting for the same thing", async () => {
    const fresh = setup();
    await enqueueJob(fresh.db, "media.transcode", { itemId: "i1" }, { dedupe: true });
    expect(fresh.mock.job.findFirst).toHaveBeenCalledWith({
      where: {
        type: "media.transcode",
        status: { in: ["QUEUED", "RUNNING"] },
        payload: { equals: { itemId: "i1" } },
      },
    });
    expect(fresh.mock.job.create).toHaveBeenCalledOnce();

    const waiting = setup({ id: "j0" });
    await expect(
      enqueueJob(waiting.db, "media.transcode", { itemId: "i1" }, { dedupe: true }),
    ).resolves.toEqual({ id: "j0" });
    expect(waiting.mock.job.create).not.toHaveBeenCalled();
  });

  it("waits 1, 5, 15, then 60 minutes between tries, and stops at the last attempt", () => {
    expect([1, 2, 3, 4].map((attempt) => minutes(retryAt(attempt, 5, now)))).toEqual([
      1, 5, 15, 60,
    ]);
    expect(retryAt(5, 5, now)).toBeNull();
    expect(minutes(retryAt(7, 10, now))).toBe(60);
  });

  it("schedules a retry with the error, or gives up for good", async () => {
    const { db, mock } = setup();
    await failJob(db, { id: "j1", attempts: 1, maxAttempts: 5 }, new Error("ffmpeg crashed"), now);
    expect(mock.job.update).toHaveBeenLastCalledWith({
      where: { id: "j1" },
      data: expect.objectContaining({
        status: "QUEUED",
        runAt: new Date(now.getTime() + 60_000),
        lastError: "ffmpeg crashed",
        lockedBy: null,
      }) as unknown,
    });
    await failJob(db, { id: "j1", attempts: 5, maxAttempts: 5 }, "no luck", now);
    expect(mock.job.update).toHaveBeenLastCalledWith({
      where: { id: "j1" },
      data: expect.objectContaining({ status: "FAILED", lastError: "no luck" }) as unknown,
    });
  });

  it("puts back jobs whose worker died mid-run, but fails the ones that must run once", async () => {
    const { db, mock } = setup();
    mock.job.findMany.mockResolvedValue([
      { id: "wait", attempts: 1, maxAttempts: 5 },
      { id: "paid", attempts: 1, maxAttempts: 1 },
      { id: "last", attempts: 5, maxAttempts: 5 },
    ]);
    await expect(releaseStaleJobs(db, now)).resolves.toBe(3);
    expect(mock.job.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "RUNNING", lockedAt: { lt: new Date(now.getTime() - STALE_AFTER_MS) } },
      }),
    );
    expect(mock.job.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["paid", "last"] }, status: "RUNNING" },
      data: expect.objectContaining({ status: "FAILED", lockedAt: null }) as unknown,
    });
    expect(mock.job.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["wait"] }, status: "RUNNING" },
      data: { status: "QUEUED", lockedAt: null, lockedBy: null, runAt: now },
    });
  });

  it("does nothing when no job is stale", async () => {
    const { db, mock } = setup();
    await expect(releaseStaleJobs(db, now)).resolves.toBe(0);
    expect(mock.job.updateMany).not.toHaveBeenCalled();
  });

  it("lets an admin run a job again with fresh attempts", async () => {
    const { db, mock } = setup();
    await retryJob(db, "j1");
    expect(mock.job.update).toHaveBeenCalledWith({
      where: { id: "j1" },
      data: expect.objectContaining({ status: "QUEUED", attempts: 0, lastError: null }) as unknown,
    });
  });
});
