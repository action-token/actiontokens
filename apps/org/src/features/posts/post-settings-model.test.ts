import { describe, expect, it } from "vitest";

import { settingsFrom, settingsProblem, settingsSummary } from "./post-settings-model";

describe("post settings", () => {
  it("starts a new post open to everyone with 100 copies", () => {
    expect(settingsFrom()).toEqual({
      audience: "EVERYONE",
      tierId: null,
      commentAccess: "VIEWERS",
      commentTierId: null,
      collectAccess: "VIEWERS",
      collectTierId: null,
      copies: 100,
    });
    expect(settingsFrom({ audience: "MEMBERS", tierId: "t1", copies: 25 })).toMatchObject({
      audience: "MEMBERS",
      tierId: "t1",
      copies: 25,
    });
  });

  it("asks for each members rule's tier and keeps copies in range", () => {
    const base = settingsFrom();
    expect(settingsProblem(base, 0)).toBeNull();
    expect(settingsProblem({ ...base, commentAccess: "MEMBERS" }, 0)).toBe(
      "Pick the tier that can comment.",
    );
    expect(settingsProblem({ ...base, copies: 0 }, 0)).toBe("Pick between 1 and 10,000 copies.");
    expect(settingsProblem({ ...base, copies: 3 }, 5)).toBe(
      "Fans have collected 5 already, so keep at least 5 copies.",
    );
  });

  it("sums the settings up in plain words", () => {
    const tierName = (id: string | null) => (id === "t1" ? "Insider" : "Members");
    expect(
      settingsSummary(
        {
          ...settingsFrom(),
          audience: "FOLLOWERS",
          commentAccess: "MEMBERS",
          commentTierId: "t1",
          collectAccess: "NOBODY",
        },
        tierName,
      ),
    ).toEqual({ see: "Followers", comment: "Insider", collect: "off" });
    expect(settingsSummary(settingsFrom(), tierName, false).collect).toBe(
      "needs a photo, video or song",
    );
  });

  it("labels the subscribers audience, and it needs no tier", () => {
    const settings = { ...settingsFrom(), audience: "SUBSCRIBERS" as const };
    expect(settingsSummary(settings, () => "").see).toBe("Subscribers");
    expect(settingsProblem(settings, 0)).toBeNull();
  });

  it("labels subscribers for comments and collecting, and they need no tier", () => {
    const settings = {
      ...settingsFrom(),
      commentAccess: "SUBSCRIBERS" as const,
      collectAccess: "SUBSCRIBERS" as const,
    };
    expect(settingsSummary(settings, () => "")).toMatchObject({
      comment: "subscribers",
      collect: "subscribers, 100 copies",
    });
    expect(settingsProblem(settings, 0)).toBeNull();
  });
});
