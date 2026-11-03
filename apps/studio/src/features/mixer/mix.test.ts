import { describe, expect, it } from "vitest";

import {
  audible,
  clipLength,
  clock,
  mixLength,
  moveTo,
  newTrack,
  playSlice,
  trim,
  type MixTrack,
} from "./mix";
import { encodeWav } from "./wav";

const track = (over: Partial<MixTrack> = {}): MixTrack => ({
  ...newTrack({ name: "Beat", url: "https://bucket/beat.mp3", duration: 30 }, 0),
  ...over,
});

describe("mixer timeline", () => {
  it("measures clips and the whole mix", () => {
    const a = track({ startTime: 5, trimStart: 2, trimEnd: 3 });
    expect(clipLength(a)).toBe(25);
    expect(mixLength([a, track({ startTime: 0 })])).toBe(30);
    expect(mixLength([])).toBe(0);
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
    const a = track({ startTime: 4, trimStart: 1, trimEnd: 5 }); // plays 4 → 28
    expect(playSlice(a, 0)).toEqual({ wait: 4, offset: 1, length: 24 });
    expect(playSlice(a, 10)).toEqual({ wait: 0, offset: 7, length: 18 });
    expect(playSlice(a, 28)).toBeNull();
  });

  it("moves clips but not before the start, and trims from either edge", () => {
    expect(moveTo(track(), -3).startTime).toBe(0);
    const left = trim(track({ startTime: 10 }), "start", 4);
    expect(left).toMatchObject({ trimStart: 4, startTime: 14 });
    expect(trim(track(), "end", -6)).toMatchObject({ trimEnd: 6 });
    // Never below a quarter second, never past the file's own ends.
    expect(clipLength(trim(track(), "end", -100))).toBeCloseTo(0.25);
    expect(trim(track(), "start", -5)).toMatchObject({ trimStart: 0, startTime: 0 });
  });

  it("shows times like a player", () => {
    expect(clock(65.34)).toBe("1:05.3");
    expect(clock(0)).toBe("0:00.0");
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
