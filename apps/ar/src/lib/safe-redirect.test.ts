import { describe, expect, it } from "vitest";

import { backTo } from "./safe-redirect";

describe("backTo", () => {
  it("keeps local paths and swaps the result flag", () => {
    expect(backTo("/bounty/b1?lastfm=connected&tab=reports", "/bounty", ["error", "denied"])).toBe(
      "/bounty/b1?tab=reports&error=denied",
    );
  });

  it("never leaves the site", () => {
    expect(backTo("https://evil.example/x", "/bounty")).toBe("/bounty");
    expect(backTo("//evil.example/x", "/bounty")).toBe("/bounty");
    expect(backTo(null, "/bounty")).toBe("/bounty");
  });
});
