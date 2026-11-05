import { describe, expect, it } from "vitest";

import { declare } from "./upload";

const file = (name: string, type = "") => new File([new Uint8Array([1, 2, 3])], name, { type });

describe("upload details", () => {
  it("keeps the type the browser gives", async () => {
    expect((await declare(file("a.mp3", "audio/mpeg"))).fileType).toBe("audio/mpeg");
  });

  it("names audio by its extension when the browser gives no type", async () => {
    expect((await declare(file("beat.WAV"))).fileType).toBe("audio/wav");
    expect((await declare(file("song.flac"))).fileType).toBe("audio/flac");
    expect((await declare(file("take.m4a", "application/octet-stream"))).fileType).toBe(
      "audio/x-m4a",
    );
  });

  it("sends anything else as plain bytes", async () => {
    expect((await declare(file("model.glb"))).fileType).toBe("application/octet-stream");
  });
});
