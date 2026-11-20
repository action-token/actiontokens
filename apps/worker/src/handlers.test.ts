import { JOB_TYPES } from "@actiontokens/api";
import { describe, expect, it } from "vitest";

import { handlersFor } from "./handlers";
import { SCHEDULES } from "./schedule";

const handlers = Object.keys(handlersFor({ db: {} as never, chain: {} as never }));

describe("the worker's job list", () => {
  it("has a handler for every job type, and none for a type that doesn't exist", () => {
    expect(JOB_TYPES.filter((type) => !handlers.includes(type))).toEqual([]);
    expect(handlers.filter((type) => !(JOB_TYPES as readonly string[]).includes(type))).toEqual([]);
  });

  it("only schedules jobs it can run, each at most once per 24 hours of wall time per run", () => {
    for (const schedule of SCHEDULES) {
      expect(handlers).toContain(schedule.type);
      expect(schedule.everyMs).toBeGreaterThanOrEqual(60_000);
    }
    expect(new Set(SCHEDULES.map((s) => s.type)).size).toBe(SCHEDULES.length);
  });

  it("never schedules the jobs that cost money or are asked for by a person", () => {
    const asked = ["pins.batch", "agent.run", "media.transcode"];
    expect(SCHEDULES.filter((s) => asked.includes(s.type))).toEqual([]);
  });
});
