import { describe, expect, it } from "vitest";

import {
  audibleGain,
  clampPan,
  clampVolume,
  defaultSetting,
  type Mix,
  startPosition,
  toggle,
} from "./mix";

const mix = (over: Mix = {}): Mix => ({
  drums: defaultSetting(),
  bass: defaultSetting(),
  lead: defaultSetting(),
  ...over,
});

describe("stem mix", () => {
  it("plays every stem at its own volume when nothing is muted or soloed", () => {
    expect(audibleGain(mix({ bass: { ...defaultSetting(), volume: 0.4 } }), "bass")).toBe(0.4);
    expect(audibleGain(mix(), "drums")).toBe(1);
  });

  it("a muted stem is silent", () => {
    expect(audibleGain(mix({ drums: { ...defaultSetting(), mute: true } }), "drums")).toBe(0);
  });

  it("solo silences every stem that isn't soloed, and several can be soloed together", () => {
    const soloed = mix({
      bass: { ...defaultSetting(), solo: true },
      lead: { ...defaultSetting(), solo: true, volume: 0.5 },
    });
    expect(audibleGain(soloed, "drums")).toBe(0);
    expect(audibleGain(soloed, "bass")).toBe(1);
    expect(audibleGain(soloed, "lead")).toBe(0.5);
  });

  it("a stem that is both soloed and muted stays silent", () => {
    expect(
      audibleGain(mix({ bass: { ...defaultSetting(), solo: true, mute: true } }), "bass"),
    ).toBe(0);
  });

  it("keeps volume between 0 and 1 and pan between hard left and hard right", () => {
    expect(clampVolume(2)).toBe(1);
    expect(clampVolume(-1)).toBe(0);
    expect(clampVolume(Number.NaN)).toBe(1);
    expect(clampPan(-3)).toBe(-1);
    expect(clampPan(0.25)).toBe(0.25);
  });

  it("toggle flips mute or solo for one stem and leaves the others alone", () => {
    const next = toggle(mix(), "bass", "solo");
    expect(next.bass?.solo).toBe(true);
    expect(next.drums?.solo).toBe(false);
    expect(toggle(next, "bass", "solo").bass?.solo).toBe(false);
  });
});

describe("startPosition", () => {
  it("carries the playhead over to the stems, or starts over if the stems are shorter than where the song is", () => {
    expect(startPosition(12.5, 20)).toBe(12.5);
    expect(startPosition(45, 20)).toBe(0);
    expect(startPosition(20, 20)).toBe(0);
    expect(startPosition(Number.NaN, 20)).toBe(0);
  });
});
