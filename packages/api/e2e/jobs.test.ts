import { afterAll, describe, expect, it } from "vitest";

import { db } from "@bandcoin/db/server";

import { claimJob, completeJob } from "../src/services/jobs/queue";

// Only the dev database: the queue's locking needs a real Postgres.
const host = new URL(process.env.DATABASE_URL ?? "postgresql://x@missing/x").hostname;
if (!host.startsWith("ep-shy-leaf-")) throw new Error(`Refusing to run against ${host}`);

/** A type no real worker handles, so the test can't take a real job (or a real worker this one). */
const TYPE = `test.claim.${Date.now()}`;

afterAll(async () => {
  await db.job.deleteMany({ where: { type: TYPE } });
  await db.$disconnect();
});

describe("job queue on Postgres", () => {
  it("gives each waiting job to exactly one of several workers at once", async () => {
    await db.job.createMany({
      data: Array.from({ length: 3 }, (_, index) => ({ type: TYPE, payload: { index } })),
    });
    const claimed = await Promise.all(
      ["w1", "w2", "w3", "w4"].map((worker) => claimJob(db, worker, [TYPE])),
    );
    const jobs = claimed.filter((job) => job !== null);
    expect(jobs).toHaveLength(3);
    expect(new Set(jobs.map((job) => job.id)).size).toBe(3);
    expect(jobs.every((job) => job.status === "RUNNING" && job.attempts === 1)).toBe(true);
    await completeJob(db, jobs[0]!, { ok: true });
    await expect(db.job.findUnique({ where: { id: jobs[0]!.id } })).resolves.toMatchObject({
      status: "SUCCEEDED",
      lockedBy: null,
    });
  });

  it("skips jobs that aren't due yet or of a type it doesn't know", async () => {
    await db.job.create({
      data: { type: TYPE, payload: {}, runAt: new Date(Date.now() + 3_600_000) },
    });
    await expect(claimJob(db, "w1", [TYPE])).resolves.toBeNull();
    await expect(claimJob(db, "w1", ["some.other.type"])).resolves.toBeNull();
  });
});
