import { describe, expect, it } from "vitest";

import { mediaTypeOf, planUploads, songTitle } from "./media-files";

const f = (name: string, type = "") => ({ name, type });

describe("mediaTypeOf", () => {
  it("reads the type, or the extension when the browser gives none", () => {
    expect(mediaTypeOf(f("a.bin", "image/png"))).toBe("IMAGE");
    expect(mediaTypeOf(f("clip.MOV"))).toBe("VIDEO");
    expect(mediaTypeOf(f("song.flac"))).toBe("AUDIO");
    expect(mediaTypeOf(f("notes.pdf", "application/pdf"))).toBeNull();
  });
});

describe("songTitle", () => {
  it("drops the extension and underscores", () => {
    expect(songTitle("02 night_drive-demo.mp3")).toBe("02 night drive-demo");
  });
});

describe("planUploads", () => {
  it("keeps a mix in the order picked, up to the room left, and counts the rest", () => {
    const picked = [f("a.jpg"), f("b.pdf"), f("c.mp4"), f("d.mp3"), f("e.png")];
    const plan = planUploads(picked, 3);
    expect(plan.take.map((entry) => [entry.file.name, entry.type])).toEqual([
      ["a.jpg", "IMAGE"],
      ["c.mp4", "VIDEO"],
      ["d.mp3", "AUDIO"],
    ]);
    expect(plan).toMatchObject({ unsupported: 1, overLimit: 1 });
  });
});
