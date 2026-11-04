import { describe, expect, it } from "vitest";

import { channelOf, decodePcm, MAX_RECORDING_SECONDS, recordingWav, secondsOf } from "./pcm";

const base64 = (samples: number[]) =>
  btoa(String.fromCharCode(...new Uint8Array(new Int16Array(samples).buffer)));

describe("live audio", () => {
  it("decodes base64 16-bit samples", () => {
    expect([...decodePcm(base64([1, -1, 32767, -32768]))]).toEqual([1, -1, 32767, -32768]);
  });

  it("drops a half frame at the end", () => {
    expect(decodePcm(base64([1, 2, 3])).length).toBe(2);
  });

  it("splits left and right as floats", () => {
    const samples = new Int16Array([16384, -16384, 0, 32767]);
    expect([...channelOf(samples, 0)]).toEqual([0.5, 0]);
    expect(channelOf(samples, 1)[0]).toBe(-0.5);
  });

  it("measures seconds of stereo 48 kHz audio", () => {
    expect(secondsOf(96_000)).toBe(1);
  });

  it("writes a WAV with the right header and samples", async () => {
    const { blob, cut } = recordingWav([new Int16Array([1, 2]), new Int16Array([3, 4])]);
    const view = new DataView(await blob.arrayBuffer());
    expect(cut).toBe(false);
    expect(String.fromCharCode(view.getUint8(0), view.getUint8(8))).toBe("RW");
    expect(view.getUint32(24, true)).toBe(48_000);
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(40, true)).toBe(8);
    expect([44, 46, 48, 50].map((at) => view.getInt16(at, true))).toEqual([1, 2, 3, 4]);
  });

  it("cuts a recording at the upload limit", () => {
    const second = new Int16Array(96_000);
    const chunks = Array.from({ length: MAX_RECORDING_SECONDS + 5 }, () => second);
    const { blob, cut } = recordingWav(chunks);
    expect(cut).toBe(true);
    expect(blob.size).toBe(44 + MAX_RECORDING_SECONDS * 96_000 * 2);
  });
});
