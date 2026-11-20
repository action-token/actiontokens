import { describe, expect, it } from "vitest";

import { draftProblems, lockedReady, newLocked, toLockedInput } from "./drafts";

const file = { url: "https://cdn.example/a.mp3", name: "a.mp3", mime: "audio/mpeg" };

describe("locked content drafts", () => {
  it("needs a file, or a web link for a link", () => {
    expect(draftProblems(newLocked()).content).toBe("Upload the file.");
    expect(draftProblems({ ...newLocked(), file }).content).toBeUndefined();
    const link = { ...newLocked(), type: "OTHER" as const };
    expect(draftProblems({ ...link, link: "tickets" }).content).toMatch(/https:\/\//);
    expect(draftProblems({ ...link, link: "https://t.example/vip" })).toEqual({});
  });

  it("needs places and a sane radius once the condition is on", () => {
    const gated = { ...newLocked(), file, gated: true };
    expect(draftProblems(gated).places).toMatch(/at least one place/);
    const placed = { ...gated, places: [{ lat: 1, lng: 2, label: "" }] };
    expect(draftProblems(placed)).toEqual({});
    expect(draftProblems({ ...placed, radius: "5" }).radius).toBe("From 10 to 1000 m.");
  });

  it("is ready with at least one complete piece", () => {
    expect(lockedReady([])).toBe(false);
    expect(lockedReady([newLocked()])).toBe(false);
    expect(lockedReady([{ ...newLocked(), file }])).toBe(true);
  });

  it("becomes the API input in order, without blank names", () => {
    const song = { ...newLocked(), file, label: " Bonus " };
    const link = {
      ...newLocked(),
      type: "OTHER" as const,
      link: " https://t.example/vip ",
      gated: true,
      radius: "80",
      places: [{ lat: 23.78, lng: 90.4, label: "" }],
    };
    expect(toLockedInput([song, link])).toEqual([
      { type: "SONG", url: file.url, label: "Bonus", unlock: undefined },
      {
        type: "OTHER",
        url: "https://t.example/vip",
        label: undefined,
        unlock: { radiusMeters: 80, places: [{ lat: 23.78, lng: 90.4, label: undefined }] },
      },
    ]);
  });
});
