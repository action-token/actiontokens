import { describe, expect, it } from "vitest";

import { postGate, postLock } from "../services/feed/gate";

const tier = { name: "Insider", requiredTokens: "50" };
const token = { code: "TAMSIN" };
const fan = { token, held: 0, trusts: false, follows: false, isOwner: false };

describe("postLock", () => {
  it("leaves posts for everyone open", () => {
    expect(postLock({ audience: "EVERYONE", tier: null, ...fan })).toBeNull();
  });

  it("opens a members post for fans holding enough fan tokens", () => {
    expect(postLock({ audience: "MEMBERS", tier, ...fan, held: 50 })).toBeNull();
  });

  it("says what opens a members post, and what the fan holds, when they hold too few", () => {
    expect(postLock({ audience: "MEMBERS", tier, ...fan, held: 12 })).toEqual({
      kind: "TIER",
      tierName: "Insider",
      needed: "50",
      code: "TAMSIN",
      have: "12",
    });
  });

  it("keeps a members post locked while the artist has no fan token yet", () => {
    const lock = postLock({ audience: "MEMBERS", tier, ...fan, token: null });
    expect(lock).toMatchObject({ kind: "TIER", code: null });
  });

  it("opens a followers post once the fan follows", () => {
    expect(postLock({ audience: "FOLLOWERS", tier: null, ...fan })).toEqual({ kind: "FOLLOW" });
    expect(postLock({ audience: "FOLLOWERS", tier: null, ...fan, follows: true })).toBeNull();
  });

  it("opens a subscribers post once the fan has the token's trustline, whatever they hold or follow", () => {
    const lock = postLock({ audience: "SUBSCRIBERS", tier: null, ...fan });
    expect(lock).toEqual({ kind: "SUBSCRIBE", code: "TAMSIN" });
    expect(postLock({ audience: "SUBSCRIBERS", tier: null, ...fan, trusts: true })).toBeNull();
    expect(postLock({ audience: "SUBSCRIBERS", tier: null, ...fan, isOwner: true })).toBeNull();
  });

  it("keeps a subscribers post locked while the artist has no fan token yet", () => {
    expect(postLock({ audience: "SUBSCRIBERS", tier: null, ...fan, token: null })).toEqual({
      kind: "SUBSCRIBE",
      code: null,
    });
  });

  it("opens a members post whose tier was deleted, and always the artist's own posts", () => {
    expect(postLock({ audience: "MEMBERS", tier: null, ...fan })).toBeNull();
    expect(postLock({ audience: "FOLLOWERS", tier, ...fan, isOwner: true })).toBeNull();
  });
});

describe("postGate", () => {
  const open = { tier: null, viewLocked: false, ...fan };

  it("lets everyone who can open the post comment or collect by default", () => {
    expect(postGate({ access: "VIEWERS", ...open })).toEqual({ open: true });
    expect(postGate({ access: "VIEWERS", ...open, viewLocked: true })).toEqual({
      open: false,
      reason: "LOCKED",
    });
  });

  it("turns it off for everyone, the artist too", () => {
    expect(postGate({ access: "NOBODY", ...open, isOwner: true })).toEqual({
      open: false,
      reason: "OFF",
    });
  });

  it("asks fans to follow, or to hold the tier, when the artist chose that", () => {
    expect(postGate({ access: "FOLLOWERS", ...open })).toEqual({ open: false, reason: "FOLLOW" });
    expect(postGate({ access: "FOLLOWERS", ...open, follows: true })).toEqual({ open: true });
    expect(postGate({ access: "MEMBERS", ...open, tier, held: 10 })).toMatchObject({
      open: false,
      reason: "TIER",
      needed: "50",
      have: "10",
    });
    expect(postGate({ access: "MEMBERS", ...open, tier, held: 60 })).toEqual({ open: true });
  });

  it("always lets the artist in unless it's off", () => {
    expect(postGate({ access: "MEMBERS", ...open, tier, isOwner: true })).toEqual({ open: true });
  });
});
