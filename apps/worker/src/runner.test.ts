import { describe, expect, it, vi } from "vitest";

import type { Db, Job } from "@bandcoin/db";
import { AppError, ErrorCodes } from "@bandcoin/errors";

import { healthOf, STALE_TICK_MS } from "./health";
import {
  HEAVY_TYPES,
  newState,
  positiveInt,
  runLoop,
  runOnce,
  slotsFor,
} from "./runner";

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
  const state = newState();
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
    expect(state.running.size).toBe(0);
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

  it("asks only for the types of its slot", async () => {
    const { db, mock, state } = setup(null);
    const handlers = { "media.transcode": vi.fn(), "order.reconcile": vi.fn() };
    await runOnce(db, "w1", handlers, state, { types: ["order.reconcile"] });
    const values = mock.$queryRaw.mock.calls[0]!.slice(1) as unknown[];
    expect(values).toContainEqual(["order.reconcile"]);
  });

  it("fails a job that runs past its timeout and frees the loop", async () => {
    const { db, mock, state } = setup(job());
    const handler = vi.fn(() => new Promise<void>(() => undefined));
    await expect(
      runOnce(db, "w1", { "order.reconcile": handler }, state, { timeoutMs: 20 }),
    ).resolves.toBe(true);
    expect(mock.job.update).toHaveBeenCalledWith({
      where: { id: "j1" },
      data: expect.objectContaining({
        status: "QUEUED",
        lastError: expect.stringContaining("timed out") as unknown,
      }) as unknown,
    });
    expect(state.running.size).toBe(0);
  });

  it("tells the database it is alive while a job runs", async () => {
    const { db, mock, state } = setup(job());
    const handler = vi.fn(() => new Promise<void>((resolve) => setTimeout(resolve, 60)));
    await runOnce(db, "w1", { "order.reconcile": handler }, state, { heartbeatMs: 10 });
    expect(mock.job.updateMany).toHaveBeenCalledWith({
      where: { id: "j1", status: "RUNNING" },
      data: { lockedAt: expect.any(Date) as unknown },
    });
  });

  it("shows every running job at once", async () => {
    const { db, state } = setup(job());
    let release: () => void = () => undefined;
    const handler = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));
    const run = runOnce(db, "w1", { "order.reconcile": handler }, state);
    await vi.waitFor(() => expect(state.running.has("j1")).toBe(true));
    release();
    await run;
    expect(state.running.size).toBe(0);
  });
});

describe("slotsFor", () => {
  const all = ["order.reconcile", "agent.run", "pins.batch", "media.transcode"];

  it("gives ffmpeg work its own loops, apart from everything else", () => {
    expect(slotsFor(all, { general: 3, heavy: 1 })).toEqual([
      { types: ["order.reconcile", "agent.run", "pins.batch"], count: 3 },
      { types: ["media.transcode"], count: 1 },
    ]);
    expect(HEAVY_TYPES).toContain("media.transcode");
  });

  it("never leaves a group without a loop, and skips groups with no types", () => {
    expect(slotsFor(all, { general: 0, heavy: 0 }).map((slot) => slot.count)).toEqual([1, 1]);
    expect(slotsFor(["agent.run"], { general: 2, heavy: 1 })).toEqual([
      { types: ["agent.run"], count: 2 },
    ]);
  });
});

describe("positiveInt", () => {
  it("takes a whole number above zero, else the fallback", () => {
    expect(positiveInt("4", 3)).toBe(4);
    expect(positiveInt(undefined, 3)).toBe(3);
    expect(positiveInt("", 3)).toBe(3);
    expect(positiveInt("0", 3)).toBe(3);
    expect(positiveInt("-2", 3)).toBe(3);
    expect(positiveInt("1.5", 3)).toBe(3);
  });
});

describe("runLoop", () => {
  it("rests when idle, keeps going after a database error, and stops when asked", async () => {
    const { db, mock, state } = setup(null);
    mock.$queryRaw.mockRejectedValueOnce(new Error("connection reset"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let sleeps = 0;
    await runLoop(db, "w1", {}, state, {}, () => {
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
    state.running.add("j1");
    await expect(healthOf(db, state, now)).resolves.toMatchObject({ status: 200 });
  });
});
