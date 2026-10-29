import { describe, expect, it } from "vitest";

import { formatDuration, latestPreviewStart, PREVIEW_SECONDS } from "../preview";

describe("latestPreviewStart", () => {
  it("leaves room for the whole 30 seconds", () => {
    expect(PREVIEW_SECONDS).toBe(30);
    expect(latestPreviewStart(200)).toBe(170);
    expect(latestPreviewStart(30)).toBe(0);
  });

  it("is zero for a song shorter than the preview", () => {
    expect(latestPreviewStart(20)).toBe(0);
    expect(latestPreviewStart(0)).toBe(0);
  });
});

describe("formatDuration", () => {
  it("shows minutes and seconds", () => {
    expect(formatDuration(185)).toBe("3:05");
    expect(formatDuration(59.6)).toBe("1:00");
    expect(formatDuration(0)).toBe("0:00");
  });

  it("adds hours for long recordings", () => {
    expect(formatDuration(3729)).toBe("1:02:09");
  });
});
