import { describe, expect, it, vi } from "vitest";

import type { Db, Job } from "@bandcoin/db";
import { AppError, ErrorCodes } from "@bandcoin/errors";

import { healthOf, STALE_TICK_MS } from "./health";
import { runLoop, runOnce, type RunnerState } from "./runner";

const job = (extra: Partial<Job> = {}): Job =>
  ({
    id: "j1",
    type: "order.reconcile",
    payload: {},
    status: "RUNNING",
    attempts: 1,
    maxAttempts: 5,
    ...extra,
  }) as Job;

function setup(claimed: Job | null) {
  const db = {
    $queryRaw: vi.fn().mockResolvedValue(claimed ? [claimed] : []),
    job: {
      update: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      count: vi.fn().mockResolvedValue(3),
    },
    activityLog: { create: vi.fn().mockResolvedValue({}) },
  };
  const state: RunnerState = { lastTickAt: null, running: null, stopped: false };
  return { db: db as unknown as Db, mock: db, state };
}

describe("runOnce", () => {
  it("does nothing when no job is due", async () => {
    const { db, mock, state } = setup(null);
    await expect(runOnce(db, "w1", { "order.reconcile": vi.fn() }, state)).resolves.toBe(false);
    expect(state.lastTickAt).toBeInstanceOf(Date);
    expect(mock.activityLog.create).not.toHaveBeenCalled();
  });

  it("runs the job, stores its result and logs it as the system", async () => {
    const { db, mock, state } = setup(job());
    const handler = vi.fn().mockResolvedValue({
      result: { settled: 2 },
      target: { type: "Order", id: "o1" },
    });
    await expect(runOnce(db, "w1", { "order.reconcile": handler }, state)).resolves.toBe(true);
    expect(handler).toHaveBeenCalledWith(job());
    expect(mock.job.update).toHaveBeenCalledWith({
      where: { id: "j1" },
      data: expect.objectContaining({ status: "SUCCEEDED", result: { settled: 2 } }) as unknown,
    });
    expect(mock.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorRole: "SYSTEM",
        app: "worker",
        action: "job.order.reconcile",
        targetType: "Order",
        targetId: "o1",
        status: "SUCCESS",
      }) as unknown,
    });
    expect(state.running).toBeNull();
  });

  it("schedules a retry when the job throws, and logs the error code", async () => {
    const { db, mock, state } = setup(job());
    const handler = vi.fn().mockRejectedValue(new AppError(ErrorCodes.EXTERNAL_SERVICE_FAILED));
    await runOnce(db, "w1", { "order.reconcile": handler }, state);
    expect(mock.job.update).toHaveBeenCalledWith({
      where: { id: "j1" },
      data: expect.objectContaining({ status: "QUEUED" }) as unknown,
    });
    expect(mock.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "FAILED",
        errorCode: "EXTERNAL_SERVICE_FAILED",
      }) as unknown,
    });
  });

  it("only asks for the job types it has a handler for", async () => {
    const { db, mock, state } = setup(null);
    await runOnce(db, "w1", { "media.transcode": vi.fn() }, state);
    const values = mock.$queryRaw.mock.calls[0]!.slice(1) as unknown[];
    expect(values).toContainEqual(["media.transcode"]);
  });
});

describe("runLoop", () => {
  it("rests when idle, keeps going after a database error, and stops when asked", async () => {
    const { db, mock, state } = setup(null);
    mock.$queryRaw.mockRejectedValueOnce(new Error("connection reset"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let sleeps = 0;
    await runLoop(db, "w1", {}, state, () => {
      sleeps += 1;
      if (sleeps === 2) state.stopped = true;
      return Promise.resolve();
    });
    expect(sleeps).toBe(2);
    expect(error).toHaveBeenCalledWith("[worker] loop error", expect.any(Error));
    error.mockRestore();
  });
});

describe("health", () => {
  it("is healthy while the loop ticks or a job runs, and not when the loop stalls", async () => {
    const { db, state } = setup(null);
    const now = Date.now();
    state.lastTickAt = new Date(now - 1000);
    await expect(healthOf(db, state, now)).resolves.toMatchObject({
      status: 200,
      body: { ok: true, queued: 3 },
    });
    state.lastTickAt = new Date(now - STALE_TICK_MS - 1);
    await expect(healthOf(db, state, now)).resolves.toMatchObject({ status: 503 });
    state.running = "j1";
    await expect(healthOf(db, state, now)).resolves.toMatchObject({ status: 200 });
  });
});
