import { describe, expect, it } from "vitest";

import { describeForArtist, describeNotification } from "../services/notifications/describe";

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

  it("opens the post itself when it knows which one", () => {
    expect(describeNotification("POST", { actor: artist, postId: "p1" }).href).toBe("/feed/p1");
    expect(describeNotification("REPLY", { actor: fan, postId: "p1" }).href).toBe("/feed/p1");
  });

  it("links a release to its item, and a fan to their profile", () => {
    expect(
      describeNotification("NEW_ITEM", { actor: artist, item: { slug: "vip", title: "VIP pass" } })
        .href,
    ).toBe("/item/vip");
    expect(describeNotification("FOLLOW", { actor: fan }).href).toBe("/u/ana");
  });

  it("says an artist shared a story and opens their page", () => {
    expect(describeNotification("STORY", { actor: artist })).toEqual({
      text: "DJ Tamsin shared a story.",
      href: "/artist/dj-tamsin",
    });
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
      "STORY",
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

describe("describeForArtist", () => {
  it("names the post, item or bounty and opens it in the portal", () => {
    expect(
      describeForArtist("LIKE", { actor: fan, post: { id: "p1", title: "Tour diary" } }),
    ).toEqual({ text: "Ana liked your post “Tour diary”.", href: "/posts/p1" });
    expect(
      describeForArtist("PURCHASE", {
        actor: fan,
        item: { id: "i1", slug: "circle-line", title: "Circle Line", type: "TRACK" },
      }),
    ).toEqual({ text: "Ana bought Circle Line.", href: "/music/i1" });
    expect(
      describeForArtist("PURCHASE", {
        actor: fan,
        item: { id: "i2", slug: "vip-pass", title: "VIP pass", type: "NFT" },
      }).href,
    ).toBe("/items/i2");
    expect(
      describeForArtist("BOUNTY_SUBMISSION", { actor: fan, bounty: { id: "b1", title: "Cover" } }),
    ).toEqual({ text: "Ana sent a submission to Cover.", href: "/bounties/b1" });
  });

  it("reads well when the thing is gone, and for follows and memberships", () => {
    expect(describeForArtist("COMMENT", { actor: fan, post: null })).toEqual({
      text: "Ana commented on your post.",
      href: "/posts",
    });
    expect(describeForArtist("FOLLOW", { actor: fan })).toEqual({
      text: "Ana started following you.",
      href: null,
    });
    expect(describeForArtist("MEMBERSHIP", { actor: fan }).href).toBe("/memberships");
  });
});
