import { describe, expect, it } from "vitest";

import {
  addMonths,
  normalizeVanityName,
  renewalEnd,
  validateVanityName,
  vanityTimeline,
} from "../vanity";

const at = (iso: string) => new Date(iso);

describe("vanity names", () => {
  it("lowercases and drops a leading @", () => {
    expect(normalizeVanityName("  @Luna_Vale ")).toBe("luna_vale");
  });

  it.each(["luna", "luna-vale", "luna_vale2", "ab"])("accepts %s", (name) => {
    expect(validateVanityName(name)).toBeNull();
  });

  it.each([
    ["a", /at least/],
    ["x".repeat(31), /at most/],
    ["Luna", /lowercase/],
    ["luna vale", /lowercase/],
    ["-luna", /Start with/],
    ["music", /can't be used/],
    ["actiontokens", /can't be used/],
    ["x-x-x", /can't be used/],
  ])("rejects %s", (name, reason) => {
    expect(validateVanityName(name)).toMatch(reason);
  });

  it("matches whole names only, so ordinary words that contain a banned one pass", () => {
    expect(validateVanityName("canal")).toBeNull();
  });
});

describe("addMonths", () => {
  it("clamps to the end of a shorter month", () => {
    expect(addMonths(at("2027-01-31T10:00:00Z"), 1).toISOString()).toBe("2027-02-28T10:00:00.000Z");
    expect(addMonths(at("2028-01-31T10:00:00Z"), 1).toISOString()).toBe("2028-02-29T10:00:00.000Z");
  });

  it("rolls over the year", () => {
    expect(addMonths(at("2026-12-15T00:00:00Z"), 1).toISOString()).toBe("2027-01-15T00:00:00.000Z");
  });
});

describe("vanityTimeline", () => {
  const paidUntil = at("2026-11-01T00:00:00Z");

  it("is on trial while the free month runs, active once it was paid", () => {
    const now = at("2026-10-20T00:00:00Z");
    expect(vanityTimeline({ status: "TRIAL", paidUntil }, now).status).toBe("TRIAL");
    expect(vanityTimeline({ status: "ACTIVE", paidUntil }, now).status).toBe("ACTIVE");
  });

  it("keeps working through the 7 day grace", () => {
    const timeline = vanityTimeline({ status: "ACTIVE", paidUntil }, at("2026-11-07T23:00:00Z"));
    expect(timeline.status).toBe("GRACE");
    expect(timeline.works).toBe(true);
    expect(timeline.graceEndsAt.toISOString()).toBe("2026-11-08T00:00:00.000Z");
  });

  it("stops working after the grace and holds the name 30 more days", () => {
    const timeline = vanityTimeline({ status: "TRIAL", paidUntil }, at("2026-11-09T00:00:00Z"));
    expect(timeline.status).toBe("LAPSED");
    expect(timeline.works).toBe(false);
    expect(timeline.heldUntil.toISOString()).toBe("2026-12-08T00:00:00.000Z");
  });

  it("treats a stored GRACE or LAPSED row that was renewed as active again", () => {
    const renewed = { status: "ACTIVE" as const, paidUntil: at("2026-12-01T00:00:00Z") };
    expect(vanityTimeline(renewed, at("2026-11-09T00:00:00Z")).status).toBe("ACTIVE");
  });
});

describe("renewalEnd", () => {
  it("adds a month to what is left when renewing early", () => {
    expect(renewalEnd(at("2026-11-10T00:00:00Z"), at("2026-11-01T00:00:00Z")).toISOString()).toBe(
      "2026-12-10T00:00:00.000Z",
    );
  });

  it("starts today when it already ran out", () => {
    expect(renewalEnd(at("2026-10-01T00:00:00Z"), at("2026-11-03T00:00:00Z")).toISOString()).toBe(
      "2026-12-03T00:00:00.000Z",
    );
  });
});
