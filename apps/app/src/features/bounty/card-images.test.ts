import { describe, expect, it } from "vitest";

import { cardImages } from "./card-images";

const artist = { avatarUrl: "creator.png" };
const track = (albumArtUrl: string | null) => ({ albumArtUrl });

describe("cardImages", () => {
  it("uses the creator's image when there's no music", () => {
    expect(cardImages({ musicArt: [], artist })).toEqual(["creator.png"]);
  });

  it("uses music covers instead, when there are any", () => {
    expect(cardImages({ musicArt: [track("a"), track("b")], artist })).toEqual(["a", "b"]);
  });

  it("shows at most 3 covers", () => {
    const musicArt = ["a", "b", "c", "d", "e"].map(track);
    expect(cardImages({ musicArt, artist })).toEqual(["a", "b", "c"]);
  });

  it("skips tracks with no cover, and falls back to the creator if none have one", () => {
    expect(cardImages({ musicArt: [track(null), track("b")], artist })).toEqual(["b"]);
    expect(cardImages({ musicArt: [track(null)], artist })).toEqual(["creator.png"]);
  });

  it("is plain when there's no image at all", () => {
    expect(cardImages({ musicArt: [], artist: { avatarUrl: null } })).toEqual([]);
  });
});
