import { beforeEach, describe, expect, it } from "vitest";

import { usePlayer } from "./player-store";

const track = (id: string) => ({
  id,
  slug: id,
  title: id,
  artistName: "A",
  coverUrl: "https://example.com/c.jpg",
});

beforeEach(() => usePlayer.setState({ queue: [], index: 0, playing: false, fullOpen: false }));

describe("full player sheet", () => {
  it("starts closed and opens and closes", () => {
    expect(usePlayer.getState().fullOpen).toBe(false);
    usePlayer.getState().setFullOpen(true);
    expect(usePlayer.getState().fullOpen).toBe(true);
    usePlayer.getState().setFullOpen(false);
    expect(usePlayer.getState().fullOpen).toBe(false);
  });

  it("stays open while the song changes", () => {
    usePlayer.getState().playQueue([track("a"), track("b")], 0);
    usePlayer.getState().setFullOpen(true);
    usePlayer.getState().next();
    expect(usePlayer.getState().index).toBe(1);
    expect(usePlayer.getState().fullOpen).toBe(true);
  });
});
