import { describe, expect, it } from "vitest";

import { describeNotification } from "../services/notifications/describe";

const artist = { name: "DJ Tamsin", username: "tamsin", artistSlug: "dj-tamsin" };
const fan = { name: "Ana", username: "ana", artistSlug: null };

describe("describeNotification", () => {
  it("tells a winner to claim, and links to the bounty", () => {
    expect(
      describeNotification("BOUNTY_WINNER", {
        actor: artist,
        bounty: { id: "b1", title: "Cover" },
      }),
    ).toEqual({
      text: "DJ Tamsin picked you as a winner of Cover. Claim your prize.",
      href: "/bounty/b1",
    });
  });

  it("still reads well when the bounty is gone", () => {
    expect(describeNotification("BOUNTY_WINNER", { actor: artist, bounty: null })).toEqual({
      text: "DJ Tamsin picked you as a bounty winner.",
      href: null,
    });
  });

  it("sends a new post, and a reply to your comment, to the feed", () => {
    expect(describeNotification("POST", { actor: artist })).toEqual({
      text: "DJ Tamsin shared a new post.",
      href: "/feed",
    });
    expect(describeNotification("REPLY", { actor: fan }).href).toBe("/feed");
  });

  it("links a release to its item, and a fan to their profile", () => {
    expect(
      describeNotification("NEW_ITEM", { actor: artist, item: { slug: "vip", title: "VIP pass" } })
        .href,
    ).toBe("/item/vip");
    expect(describeNotification("FOLLOW", { actor: fan }).href).toBe("/u/ana");
  });

  it("has wording for every type", () => {
    const types = [
      "LIKE",
      "COMMENT",
      "REPLY",
      "FOLLOW",
      "MEMBERSHIP",
      "POST",
      "NEW_ITEM",
      "PURCHASE",
      "BOUNTY",
      "BOUNTY_JOINED",
      "BOUNTY_SUBMISSION",
      "BOUNTY_WINNER",
      "BOUNTY_COMMENT",
    ] as const;
    for (const type of types)
      expect(describeNotification(type, { actor: fan }).text).toMatch(/^Ana /);
  });
});
