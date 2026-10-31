import { describe, expect, it } from "vitest";

import { fullArgs, peaksOf, previewArgs, previewWindow, stemArgs } from "./ffmpeg";

describe("the ported recipes", () => {
  it("fits the preview inside the track", () => {
    expect(previewWindow(200, 45)).toEqual({ start: 45, length: 30 });
    expect(previewWindow(200, 190)).toEqual({ start: 170, length: 30 });
    expect(previewWindow(20, 5)).toEqual({ start: 0, length: 20 });
    expect(previewWindow(200, -3)).toEqual({ start: 0, length: 30 });
  });

  it("normalises the stream and the preview, never the stems", () => {
    const full = fullArgs("in", "out.m4a").join(" ");
    expect(full).toContain("loudnorm=I=-14:TP=-1.5:LRA=11");
    expect(full).toContain("-b:a 256k");
    const preview = previewArgs("in", "out.m4a", { start: 10, length: 30 }).join(" ");
    expect(preview).toContain("-ss 10 -t 30");
    expect(preview).toContain("afade=t=in:st=0:d=1,afade=t=out:st=28:d=2,loudnorm");
    expect(preview).toContain("-b:a 128k");
    const stem = stemArgs("in", "out.m4a").join(" ");
    expect(stem).not.toContain("loudnorm");
    expect(stem).toContain("-b:a 256k");
  });

  it("reads the loudest sample of each slice as a 0–1 peak", () => {
    const samples = Buffer.alloc(8);
    [0, 16384, -32768, 0].forEach((value, i) => samples.writeInt16LE(value, i * 2));
    expect(peaksOf(samples, 2)).toEqual([0.5, 1]);
    expect(peaksOf(Buffer.alloc(0))).toEqual([]);
  });
});
