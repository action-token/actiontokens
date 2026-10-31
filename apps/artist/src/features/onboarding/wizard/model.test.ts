import { describe, expect, it } from "vitest";

import { codeProblem, EMPTY_DRAFT, fanTokenOf, stepReady, tokenPicture } from "./model";

const issuer = `G${"A".repeat(55)}`;
const live = { slugOk: true, tokenOk: true };

describe("onboarding wizard", () => {
  it("needs a profile picture and a name on the first step", () => {
    const photo = { ...EMPTY_DRAFT, avatarUrl: "https://cdn/x.jpg" };
    expect(stepReady(0, EMPTY_DRAFT, live)).toBe(false);
    expect(stepReady(0, photo, live)).toBe(false);
    expect(stepReady(0, { ...photo, name: " L " }, live)).toBe(false);
    expect(stepReady(0, { ...photo, name: "Luna" }, live)).toBe(true);
    expect(stepReady(0, { ...EMPTY_DRAFT, name: "Luna" }, live)).toBe(false);
  });

  it("takes a 4 to 12 character code for a new token, with an image", () => {
    expect(codeProblem("LV")).toMatch(/4 to 12/);
    expect(codeProblem("LUNA-VALE")).toBeTruthy();
    expect(codeProblem("XLM")).toBeTruthy();
    expect(codeProblem("luna")).toBeNull();
    const token = { ...EMPTY_DRAFT, code: "LUNA", tokenImage: "https://cdn/t.png" };
    expect(stepReady(1, token, live)).toBe(true);
    expect(stepReady(1, { ...token, tokenImage: "" }, live)).toBe(false);
  });

  it("only goes on with an existing token once Stellar confirms it", () => {
    const draft = {
      ...EMPTY_DRAFT,
      tokenMode: "EXISTING" as const,
      existingCode: "LUNA",
      issuer,
      tokenImage: "https://cdn/t.png",
    };
    expect(stepReady(1, draft, live)).toBe(true);
    expect(stepReady(1, draft, { ...live, tokenOk: false })).toBe(false);
    expect(stepReady(1, { ...draft, issuer: "GBAD" }, live)).toBe(false);
  });

  it("doesn't ask for an image for a token already on Stellar, and shows the best one it has", () => {
    const draft = {
      ...EMPTY_DRAFT,
      tokenMode: "EXISTING" as const,
      existingCode: "LUNA",
      issuer,
      avatarUrl: "me.jpg",
    };
    expect(stepReady(1, draft, live)).toBe(true);
    expect(fanTokenOf(draft)).toEqual({ mode: "EXISTING", code: "LUNA", issuer });
    expect(tokenPicture(draft)).toBe("me.jpg");
    expect(tokenPicture({ ...draft, stellarImage: "stellar.png" })).toBe("stellar.png");
    expect(tokenPicture({ ...draft, stellarImage: "stellar.png", tokenImage: "mine.png" })).toBe(
      "mine.png",
    );
    expect(tokenPicture({ ...draft, tokenMode: "NEW" })).toBe("");
  });

  it("needs a free, well-formed page address", () => {
    expect(stepReady(2, { ...EMPTY_DRAFT, slug: "luna-vale" }, live)).toBe(true);
    expect(stepReady(2, { ...EMPTY_DRAFT, slug: "luna-vale" }, { ...live, slugOk: false })).toBe(
      false,
    );
    expect(stepReady(2, { ...EMPTY_DRAFT, slug: "Luna Vale" }, live)).toBe(false);
  });

  it("sends the token the way the server takes it", () => {
    expect(fanTokenOf({ ...EMPTY_DRAFT, code: "luna", tokenImage: "i" })).toEqual({
      mode: "NEW",
      code: "LUNA",
      coverUrl: "i",
    });
    expect(
      fanTokenOf({
        ...EMPTY_DRAFT,
        tokenMode: "EXISTING",
        existingCode: "luna",
        issuer: ` ${issuer} `,
        tokenImage: "i",
      }),
    ).toEqual({ mode: "EXISTING", code: "LUNA", issuer, coverUrl: "i" });
  });
});
