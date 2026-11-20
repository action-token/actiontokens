import { describe, expect, it, vi } from "vitest";

vi.mock("~/trpc/react", () => ({ api: {} }));

const { accessChoiceOf, accessInput } = await import("./access-field");

describe("who can buy it", () => {
  it("round-trips everyone, members and a tier", () => {
    expect(accessChoiceOf(undefined)).toBe("PUBLIC");
    expect(accessChoiceOf({ kind: "MEMBERS", tierId: null })).toBe("MEMBERS");
    expect(accessChoiceOf({ kind: "TIER", tierId: "t1" })).toBe("t1");
    expect(accessInput("PUBLIC")).toEqual({ kind: "PUBLIC" });
    expect(accessInput("MEMBERS")).toEqual({ kind: "MEMBERS" });
    expect(accessInput("t1")).toEqual({ kind: "TIER", tierId: "t1" });
  });
});
