import { describe, expect, it } from "vitest";

import {
  approval,
  artistStatus,
  dec,
  finishedJobStatus,
  itemType,
  listingStatus,
  mediaType,
  mimeMedia,
  newId,
  notificationType,
  orderCurrency,
  orderStatus,
  prize,
  slugify,
  uniqueSlug,
  visibility,
} from "./map";

describe("old values to new", () => {
  it("keeps money at Stellar's 7 places", () => {
    expect(dec(1.5)).toBe("1.5000000");
    expect(dec(null)).toBe("0.0000000");
  });

  it("never lets an old job run on the new worker", () => {
    expect(finishedJobStatus("completed")).toBe("SUCCEEDED");
    expect(finishedJobStatus("failed")).toBe("FAILED");
    expect(finishedJobStatus("pending")).toBe("CANCELED");
    expect(finishedJobStatus("processing")).toBe("CANCELED");
  });

  it("turns an unfinished purchase into a failed order, not one to pick up", () => {
    expect(orderStatus("CONFIRMED")).toBe("DELIVERED");
    expect(orderStatus("PENDING")).toBe("FAILED");
  });

  it("maps payment tokens and refuses unknown ones", () => {
    expect(orderCurrency("asset")).toBe("BANDCOIN");
    expect(orderCurrency("usd")).toBe("USD");
    expect(() => orderCurrency("doge")).toThrow(/needs a rule/);
  });

  it("keeps other prize assets as a classic asset", () => {
    expect(prize("ACTION", "GABC")).toEqual({
      prizeCurrency: null,
      prizeAssetCode: "ACTION",
      prizeAssetIssuer: "GABC",
    });
    expect(prize("native", null).prizeCurrency).toBe("XLM");
    expect(prize("BANDCOIN", "GX").prizeAssetIssuer).toBeNull();
  });

  it("pauses a sale missing either price, since both are required now", () => {
    expect(listingStatus({ bandcoin: 5, usd: 1 })).toBe("ACTIVE");
    expect(listingStatus({ bandcoin: 5, usd: null })).toBe("PAUSED");
    expect(listingStatus({ bandcoin: 0, usd: 1 })).toBe("PAUSED");
    expect(listingStatus({ bandcoin: 5, usd: 1, soldOut: true })).toBe("SOLD_OUT");
  });

  it("maps statuses", () => {
    expect(artistStatus(true)).toBe("APPROVED");
    expect(artistStatus(false)).toBe("BANNED");
    expect(artistStatus(null)).toBe("PENDING");
    expect(approval(false)).toBe("REJECTED");
    expect(visibility("FOR_SALE")).toBe("PUBLIC");
    expect(visibility("FOLLOWER")).toBe("FOLLOWERS");
    expect(visibility("PRIVATE")).toBe("DRAFT");
  });

  it("maps media, and stops on anything unknown rather than guessing", () => {
    expect(itemType("MUSIC")).toBe("TRACK");
    expect(mediaType("THREE_D")).toBe("MODEL_3D");
    expect(mimeMedia("image/png")).toEqual({ item: "IMAGE", media: "IMAGE" });
    expect(() => mimeMedia("model/gltf")).toThrow(/needs a rule/);
    expect(() => notificationType("NEW_THING")).toThrow(/needs a rule/);
  });

  it("folds removed notification kinds into what exists now", () => {
    expect(notificationType("MEMBER")).toBe("MEMBERSHIP");
    expect(notificationType("BOUNTY_PARTICIPANT")).toBe("BOUNTY_JOINED");
    expect(notificationType("BOUNTY_DOUBT_REPLY")).toBe("BOUNTY_COMMENT");
    expect(notificationType("COMMUNITY_REACTION")).toBe("COMMUNITY_REACTION");
  });

  it("makes clean, unique slugs", () => {
    expect(slugify("  3 Years Hollow! ")).toBe("3-years-hollow");
    expect(slugify("!!!")).toBe("untitled");
    const taken = new Set<string>();
    expect(uniqueSlug(taken, "Band")).toBe("band");
    expect(uniqueSlug(taken, "band")).toBe("band-2");
  });

  it("makes ids that look like the new schema's", () => {
    expect(newId()).toMatch(/^c[a-z0-9]{24}$/);
    expect(newId()).not.toBe(newId());
  });
});
