import { describe, expect, it } from "vitest";

import { composerTarget } from "./composer-target";

describe("composerTarget", () => {
  it("asks visitors to sign in", () => {
    expect(composerTarget(false, null, null)).toMatchObject({ href: null, action: "Sign in" });
  });

  it("opens a new post in the portal for an approved artist, by name", () => {
    const target = composerTarget(true, { name: "DJ Tamsin", status: "APPROVED" }, "Tam");
    expect(target.href).toMatch(/\/posts\/new$/);
    expect(target.prompt).toBe("What's on your mind, DJ Tamsin?");
  });

  it("explains the wait while the artist page is in review", () => {
    expect(composerTarget(true, { name: "New", status: "PENDING" }, null).action).toBe(
      "Organization portal",
    );
  });

  it("invites a fan to become an artist", () => {
    expect(composerTarget(true, null, "Ana")).toMatchObject({
      prompt: "What's on your mind, Ana? Become an organization to post.",
      action: "Become an organization",
    });
  });
});
