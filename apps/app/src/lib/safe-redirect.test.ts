import { describe, expect, it } from "vitest";

import { backTo } from "./safe-redirect";

describe("backTo", () => {
  it("keeps local paths and swaps the result flag", () => {
    expect(
      backTo("/bounty/b1?lastfm=connected&tab=reports", "/bounties", ["error", "denied"]),
    ).toBe("/bounty/b1?tab=reports&error=denied");
  });

  it("never leaves the site", () => {
    expect(backTo("https://evil.example/x", "/bounties")).toBe("/bounties");
    expect(backTo("//evil.example/x", "/bounties")).toBe("/bounties");
    expect(backTo(null, "/bounties")).toBe("/bounties");
  });
});
