import { describe, expect, it } from "vitest";

import { contextPanelFor } from "./panel-rule";

describe("contextPanelFor", () => {
  it("is empty on home until a song is loaded, then shows now playing", () => {
    expect(contextPanelFor("/", false)).toBeNull();
    expect(contextPanelFor("/", true)).toBe("music");
  });

  it("never shows on other pages, even while playing", () => {
    expect(contextPanelFor("/item/x", true)).toBeNull();
    expect(contextPanelFor("/collection", true)).toBeNull();
  });

  it("gives the bounties list its own panel, song or no song", () => {
    expect(contextPanelFor("/bounties", false)).toBe("bounties");
    expect(contextPanelFor("/bounties", true)).toBe("bounties");
  });

  it("leaves a single bounty at full width: it has its own card", () => {
    expect(contextPanelFor("/bounty/abc", false)).toBeNull();
    expect(contextPanelFor("/bounty/abc", true)).toBeNull();
  });
});
