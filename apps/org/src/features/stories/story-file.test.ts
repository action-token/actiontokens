import { describe, expect, it } from "vitest";

import { MAX_VIDEO_SECONDS, shareLeft, storyKindOf, timeLeft, videoProblem } from "./story-file";

describe("story files", () => {
  it("takes photos and videos only", () => {
    expect(storyKindOf({ type: "image/jpeg" })).toBe("IMAGE");
    expect(storyKindOf({ type: "video/mp4" })).toBe("VIDEO");
    expect(storyKindOf({ type: "audio/mpeg" })).toBeNull();
    expect(storyKindOf({ type: "" })).toBeNull();
  });

  it("allows a video up to 30 seconds", () => {
    expect(MAX_VIDEO_SECONDS).toBe(30);
    expect(videoProblem(30)).toBeNull();
    expect(videoProblem(12.4)).toBeNull();
    expect(videoProblem(30.2)).toMatch(/up to 30 seconds.*31/);
    expect(videoProblem(Number.NaN)).toBeNull();
  });

  it("says how long a story has left", () => {
    const now = new Date("2026-11-05T12:00:00Z").getTime();
    expect(timeLeft(new Date(now + (5 * 60 + 20) * 60_000), now)).toBe("5h 20m left");
    expect(timeLeft(new Date(now + 12 * 60_000), now)).toBe("12m left");
    expect(timeLeft(new Date(now - 1000), now)).toBe("Ending");
  });

  it("measures how much of the day a story has left", () => {
    const now = new Date("2026-11-05T12:00:00Z").getTime();
    expect(shareLeft(new Date(now + 24 * 3_600_000), now)).toBe(1);
    expect(shareLeft(new Date(now + 12 * 3_600_000), now)).toBe(0.5);
    expect(shareLeft(new Date(now - 5), now)).toBe(0);
    expect(shareLeft(new Date(now + 48 * 3_600_000), now)).toBe(1);
  });
});
