import { describe, expect, it, vi } from "vitest";

import type { Db } from "@bandcoin/db";

import { listJobs, retryAdminJob } from "../services/admin/jobs";

type Row = Record<string, unknown>;

const job = (extra: Row = {}) => ({
  id: "j1",
  type: "media.transcode",
  payload: { itemId: "i1", part: "all" },
  status: "FAILED",
  attempts: 5,
  maxAttempts: 5,
  runAt: new Date(),
  lastError: "ffmpeg exited 1",
  createdAt: new Date(),
  updatedAt: new Date(),
  ...extra,
});

function setup(rows: Row[]) {
  const db = {
    job: {
      findMany: vi.fn().mockResolvedValue(rows),
      findUnique: vi.fn().mockResolvedValue(rows[0] ?? null),
      update: vi.fn().mockResolvedValue({}),
    },
    item: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ id: "i1", title: "Gold Hour", artist: { name: "Luna Vale" } }]),
    },
    itemMedia: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const activity = { set: vi.fn(), facts: () => ({}) };
  return { ctx: { db: db as unknown as Db, activity }, db };
}

describe("listJobs", () => {
  it("names the song a music job is about, and offers Retry only on failed music jobs", async () => {
    const { ctx, db } = setup([
      job(),
      job({ id: "j2", status: "SUCCEEDED" }),
      job({ id: "j3", type: "order.reconcile", payload: {} }),
    ]);
    const { jobs, nextCursor } = await listJobs(ctx, { status: "failed" });
    expect(db.job.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "FAILED" } }),
    );
    expect(jobs.map((row) => [row.id, row.canRetry])).toEqual([
      ["j1", true],
      ["j2", false],
      ["j3", false],
    ]);
    expect(jobs[0]?.about).toEqual({ itemId: "i1", title: "Gold Hour", artist: "Luna Vale" });
    expect(jobs[2]?.about).toBeNull();
    expect(nextCursor).toBeNull();
  });
});

describe("retryAdminJob", () => {
  it("runs a failed music job again and puts its song back to waiting", async () => {
    const { ctx, db } = setup([job()]);
    await expect(retryAdminJob(ctx, "j1")).resolves.toEqual({ jobId: "j1" });
    expect(db.job.update).toHaveBeenCalledWith({
      where: { id: "j1" },
      data: expect.objectContaining({ status: "QUEUED", attempts: 0 }) as unknown,
    });
    expect(db.itemMedia.updateMany).toHaveBeenCalledWith({
      where: { itemId: "i1", status: "FAILED" },
      data: { status: "PENDING" },
    });
  });

  it("never retries a payment job, or one that hasn't failed", async () => {
    const payment = setup([job({ type: "order.reconcile", payload: {} })]);
    await expect(retryAdminJob(payment.ctx, "j1")).rejects.toMatchObject({
      message: "Payment jobs aren't retried.",
    });
    expect(payment.db.job.update).not.toHaveBeenCalled();

    const running = setup([job({ status: "RUNNING" })]);
    await expect(retryAdminJob(running.ctx, "j1")).rejects.toMatchObject({
      code: "RESOURCE_CONFLICT",
    });
    expect(running.db.job.update).not.toHaveBeenCalled();
  });
});
