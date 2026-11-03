import { describe, expect, it } from "vitest";

import { postLock } from "../services/feed/gate";

const tier = { name: "Insider", requiredTokens: "50" };
const token = { code: "TAMSIN" };

describe("postLock", () => {
  it("leaves public posts open", () => {
    expect(postLock({ tier: null, token, held: 0, isOwner: false })).toBeNull();
  });

  it("opens a tier post for fans holding enough fan tokens", () => {
    expect(postLock({ tier, token, held: 50, isOwner: false })).toBeNull();
  });

  it("says what opens it, and what the fan holds, when they hold too few", () => {
    expect(postLock({ tier, token, held: 12, isOwner: false })).toEqual({
      tierName: "Insider",
      needed: "50",
      code: "TAMSIN",
      have: "12",
    });
  });

  it("keeps it locked while the artist has no fan token yet", () => {
    expect(postLock({ tier, token: null, held: 0, isOwner: false })?.code).toBeNull();
  });

  it("always opens the artist's own posts", () => {
    expect(postLock({ tier, token: null, held: 0, isOwner: true })).toBeNull();
  });
});
