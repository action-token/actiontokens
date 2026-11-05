import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { audioInZip, isAudioName, isZip } from "./audio-files";

describe("audio files", () => {
  it("knows audio by its extension, in any common format", () => {
    for (const name of ["a.mp3", "b.WAV", "c.flac", "d.m4a", "e.ogg", "f.opus", "g.aiff", "h.aif"])
      expect(isAudioName(name)).toBe(true);
    expect(isAudioName("cover.png")).toBe(false);
    expect(isAudioName("notes")).toBe(false);
  });

  it("spots zip files by name or type", () => {
    expect(isZip(new File([], "stems.zip"))).toBe(true);
    expect(isZip(new File([], "stems", { type: "application/zip" }))).toBe(true);
    expect(isZip(new File([], "song.mp3", { type: "audio/mpeg" }))).toBe(false);
  });

  it("takes the audio out of a zip and leaves everything else", () => {
    const zip = zipSync({
      "drums.wav": strToU8("RIFF-drums"),
      "stems/bass.mp3": strToU8("ID3-bass"),
      "stems/": new Uint8Array(),
      "cover.jpg": strToU8("jpeg"),
      "__MACOSX/stems/._bass.mp3": strToU8("junk"),
      ".DS_Store": strToU8("junk"),
    });
    const found = audioInZip(zip);
    expect(found.map((entry) => [entry.name, entry.type])).toEqual([
      ["drums.wav", "audio/wav"],
      ["bass.mp3", "audio/mpeg"],
    ]);
    expect(new TextDecoder().decode(found[1]!.bytes)).toBe("ID3-bass");
  });
});
