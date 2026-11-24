import { describe, expect, it } from "vitest";

import { contextPanelFor } from "./panel-rule";

describe("contextPanelFor", () => {
  it("is empty until a song is loaded, then shows now playing", () => {
    expect(contextPanelFor("/music", false)).toBeNull();
    expect(contextPanelFor("/music", true)).toBe("music");
  });

  it("never shows on the home page: what's playing lives in the notch there", () => {
    expect(contextPanelFor("/", false)).toBeNull();
    expect(contextPanelFor("/", true)).toBeNull();
  });

  it("shows now playing on every page while a song is loaded", () => {
    for (const path of [
      "/album/x",
      "/playlist/abc",
      "/playlists",
      "/item/x",
      "/artist/dj",
      "/collection",
      "/marketplace",
      "/bounty/abc",
    ]) {
      expect(contextPanelFor(path, true)).toBe("music");
      expect(contextPanelFor(path, false)).toBeNull();
    }
  });

  it("gives the bounties list its own panel, song or no song", () => {
    expect(contextPanelFor("/bounties", false)).toBe("bounties");
    expect(contextPanelFor("/bounties", true)).toBe("bounties");
  });
});
