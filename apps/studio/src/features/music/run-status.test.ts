import { describe, expect, it } from "vitest";

import { downloadName, isWorking, runLabel } from "./run-status";

describe("music runs", () => {
  it("says what's happening in plain words", () => {
    expect(runLabel("RUNNING", "Full song")).toMatch(/couple of minutes/);
    expect(runLabel("RUNNING", "Music clip")).toBe("Making your clip…");
    expect(runLabel("FAILED", "Music clip")).toBe("Didn't work: coins refunded");
    expect(isWorking("QUEUED")).toBe(true);
    expect(isWorking("SUCCEEDED")).toBe(false);
  });

  it("names downloads after the prompt", () => {
    expect(downloadName("A warm lo-fi beat, with piano!", "audio/mpeg")).toBe(
      "a-warm-lo-fi-beat-with-piano.mp3",
    );
    expect(downloadName("???", "audio/wav")).toBe("bandcoin-music.wav");
  });
});
