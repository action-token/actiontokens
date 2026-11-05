import { describe, expect, it } from "vitest";

import {
  audible,
  clipLength,
  clock,
  duplicateClip,
  fadePoints,
  mixLength,
  moveTo,
  newTrack,
  normalizeProject,
  playSlice,
  setFade,
  snapTime,
  splitClip,
  trim,
  type MixClip,
  type MixTrack,
} from "./mix";
import { encodeWav } from "./wav";

const clip = (over: Partial<MixClip> = {}): MixClip => ({
  id: "c1",
  url: "https://bucket/beat.mp3",
  startTime: 0,
  trimStart: 0,
  trimEnd: 0,
  duration: 30,
  fadeIn: 0,
  fadeOut: 0,
  ...over,
});
const track = (over: Partial<MixTrack> = {}): MixTrack => ({
  ...newTrack({ name: "Beat", url: "https://bucket/beat.mp3", duration: 30 }, 0),
  ...over,
});

describe("mixer timeline", () => {
  it("measures clips and the whole mix across every clip", () => {
    expect(clipLength(clip({ startTime: 5, trimStart: 2, trimEnd: 3 }))).toBe(25);
    const a = track({ clips: [clip({ startTime: 0 }), clip({ id: "c2", startTime: 40 })] });
    expect(mixLength([a, track()])).toBe(70);
    expect(mixLength([])).toBe(0);
    expect(mixLength([track({ clips: [] })])).toBe(0);
  });

  it("plays soloed tracks if any, otherwise every unmuted one", () => {
    const a = track({ id: "a" });
    const b = track({ id: "b", muted: true });
    const c = track({ id: "c", soloed: true });
    expect(audible([a, b]).map((t) => t.id)).toEqual(["a"]);
    expect(audible([a, b, c]).map((t) => t.id)).toEqual(["c"]);
    expect(audible([a, { ...c, muted: true }]).map((t) => t.id)).toEqual(["a"]);
  });

  it("knows what part of a clip to play from any point", () => {
    const a = clip({ startTime: 4, trimStart: 1, trimEnd: 5 }); // plays 4 → 28
    expect(playSlice(a, 0)).toEqual({ wait: 4, offset: 1, length: 24 });
    expect(playSlice(a, 10)).toEqual({ wait: 0, offset: 7, length: 18 });
    expect(playSlice(a, 28)).toBeNull();
  });

  it("moves clips but not before the start, and trims from either edge", () => {
    expect(moveTo(clip(), -3).startTime).toBe(0);
    expect(trim(clip({ startTime: 10 }), "start", 4)).toMatchObject({
      trimStart: 4,
      startTime: 14,
    });
    expect(trim(clip(), "end", -6)).toMatchObject({ trimEnd: 6 });
    // Never below a quarter second, never past the file's own ends.
    expect(clipLength(trim(clip(), "end", -100))).toBeCloseTo(0.25);
    expect(trim(clip(), "start", -5)).toMatchObject({ trimStart: 0, startTime: 0 });
  });

  it("keeps fades inside a clip that's trimmed shorter", () => {
    const short = trim(clip({ fadeIn: 4, fadeOut: 4 }), "end", -24); // 6 s left
    expect(short.fadeIn + short.fadeOut).toBeLessThanOrEqual(clipLength(short));
  });

  it("shows times like a player", () => {
    expect(clock(65.34)).toBe("1:05.3");
    expect(clock(0)).toBe("0:00.0");
  });
});

describe("old projects", () => {
  it("turns a v1 project (one clip per track) into tracks with clips", () => {
    const v1 = {
      bpm: 100,
      masterVolume: 0.8,
      tracks: [
        {
          id: "t1",
          name: "Beat",
          url: "https://bucket/beat.mp3",
          startTime: 3,
          trimStart: 1,
          trimEnd: 2,
          duration: 30,
          volume: 0.7,
          muted: true,
          soloed: false,
          color: "#fff",
        },
      ],
      publish: null,
    };
    const v2 = normalizeProject(v1);
    expect(v2).toMatchObject({ version: 2, bpm: 100, masterVolume: 0.8, snap: true });
    expect(v2.tracks[0]).toMatchObject({
      id: "t1",
      name: "Beat",
      volume: 0.7,
      muted: true,
      pan: 0,
    });
    expect(v2.tracks[0]!.clips).toEqual([
      {
        id: "t1-1",
        url: "https://bucket/beat.mp3",
        startTime: 3,
        trimStart: 1,
        trimEnd: 2,
        duration: 30,
        fadeIn: 0,
        fadeOut: 0,
      },
    ]);
  });

  it("leaves a v2 project as it is, and opens an empty or broken one as empty", () => {
    const v2 = { version: 2, bpm: 90, masterVolume: 1, snap: false, tracks: [] };
    expect(normalizeProject(v2)).toEqual(v2);
    expect(normalizeProject(null).tracks).toEqual([]);
  });
});

describe("editing", () => {
  it("splits a clip at the playhead into two that play the same sound", () => {
    const whole = clip({ startTime: 10, trimStart: 2, trimEnd: 3, fadeIn: 1, fadeOut: 2 }); // 10 → 35
    const parts = splitClip(whole, 20);
    expect(parts).not.toBeNull();
    const [left, right] = parts!;
    expect(left).toMatchObject({ startTime: 10, trimStart: 2, trimEnd: 18, fadeIn: 1, fadeOut: 0 });
    expect(right).toMatchObject({
      startTime: 20,
      trimStart: 12,
      trimEnd: 3,
      fadeIn: 0,
      fadeOut: 2,
    });
    expect(right.id).not.toBe(left.id);
    expect(clipLength(left) + clipLength(right)).toBeCloseTo(clipLength(whole));
  });

  it("won't split outside a clip or leave a sliver", () => {
    const whole = clip({ startTime: 10 }); // 10 → 40
    expect(splitClip(whole, 5)).toBeNull();
    expect(splitClip(whole, 40)).toBeNull();
    expect(splitClip(whole, 10.1)).toBeNull();
    expect(splitClip(whole, 39.9)).toBeNull();
  });

  it("duplicates a clip right after itself", () => {
    const copy = duplicateClip(clip({ startTime: 5, trimEnd: 10 })); // 5 → 25
    expect(copy).toMatchObject({ startTime: 25, trimEnd: 10 });
    expect(copy.id).not.toBe("c1");
  });

  it("snaps to the nearest beat when snapping is on", () => {
    // 120 BPM: a beat is half a second.
    expect(snapTime(1.3, 120, true)).toBe(1.5);
    expect(snapTime(1.2, 120, true)).toBe(1);
    expect(snapTime(1.3, 120, false)).toBe(1.3);
    expect(snapTime(-0.4, 120, true)).toBe(0);
  });

  it("sets fades that never overlap or pass the clip", () => {
    const ten = clip({ trimEnd: 20 }); // 10 s
    expect(setFade(ten, "in", 3).fadeIn).toBe(3);
    expect(setFade(setFade(ten, "in", 6), "out", 8).fadeOut).toBe(4);
    expect(setFade(ten, "in", -2).fadeIn).toBe(0);
  });
});

describe("fades as volume over time", () => {
  it("ramps up then down across a whole clip", () => {
    const faded = clip({ startTime: 2, trimEnd: 20, fadeIn: 2, fadeOut: 3 }); // 2 → 12
    expect(fadePoints(faded, 0)).toEqual([
      { at: 2, gain: 0 },
      { at: 4, gain: 1 },
      { at: 9, gain: 1 },
      { at: 12, gain: 0 },
    ]);
  });

  it("starts at the right volume when playing from inside a fade", () => {
    const faded = clip({ trimEnd: 20, fadeIn: 4 }); // 0 → 10
    expect(fadePoints(faded, 2)).toEqual([
      { at: 0, gain: 0.5 },
      { at: 2, gain: 1 },
    ]);
  });

  it("has no points without fades", () => {
    expect(fadePoints(clip(), 0)).toEqual([]);
  });
});

describe("WAV export", () => {
  it("writes a stereo 16-bit file with the right header and samples", () => {
    const left = new Float32Array([0, 1, -1]);
    const right = new Float32Array([0.5, 2, -0.5]);
    const wav = new DataView(encodeWav([left, right], 44_100));
    const text = (at: number) => String.fromCharCode(...new Uint8Array(wav.buffer, at, 4));
    expect([text(0), text(8), text(12), text(36)]).toEqual(["RIFF", "WAVE", "fmt ", "data"]);
    expect(wav.getUint16(22, true)).toBe(2);
    expect(wav.getUint32(24, true)).toBe(44_100);
    expect(wav.getUint32(40, true)).toBe(12);
    expect(wav.getInt16(44 + 2 * 2, true)).toBe(0x7fff); // left, frame 1
    expect(wav.getInt16(44 + 3 * 2, true)).toBe(0x7fff); // right clamped from 2
    expect(wav.getInt16(44 + 4 * 2, true)).toBe(-0x8000);
  });
});
