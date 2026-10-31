import { describe, expect, it } from "vitest";

import { codeProblem, EMPTY_DRAFT, fanTokenOf, stepReady } from "./model";

const issuer = `G${"A".repeat(55)}`;
const live = { slugOk: true, tokenOk: true };

describe("onboarding wizard", () => {
  it("needs a profile picture, then a name", () => {
    expect(stepReady(0, EMPTY_DRAFT, live)).toBe(false);
    expect(stepReady(0, { ...EMPTY_DRAFT, avatarUrl: "https://cdn/x.jpg" }, live)).toBe(true);
    expect(stepReady(1, { ...EMPTY_DRAFT, name: " L " }, live)).toBe(false);
    expect(stepReady(1, { ...EMPTY_DRAFT, name: "Luna" }, live)).toBe(true);
  });

  it("takes a 4 to 12 character code for a new token, with an image", () => {
    expect(codeProblem("LV")).toMatch(/4 to 12/);
    expect(codeProblem("LUNA-VALE")).toBeTruthy();
    expect(codeProblem("XLM")).toBeTruthy();
    expect(codeProblem("luna")).toBeNull();
    const token = { ...EMPTY_DRAFT, code: "LUNA", tokenImage: "https://cdn/t.png" };
    expect(stepReady(2, token, live)).toBe(true);
    expect(stepReady(2, { ...token, tokenImage: "" }, live)).toBe(false);
  });

  it("only goes on with an existing token once Stellar confirms it", () => {
    const draft = {
      ...EMPTY_DRAFT,
      tokenMode: "EXISTING" as const,
      existingCode: "LUNA",
      issuer,
      tokenImage: "https://cdn/t.png",
    };
    expect(stepReady(2, draft, live)).toBe(true);
    expect(stepReady(2, draft, { ...live, tokenOk: false })).toBe(false);
    expect(stepReady(2, { ...draft, issuer: "GBAD" }, live)).toBe(false);
  });

  it("needs a free, well-formed page address", () => {
    expect(stepReady(3, { ...EMPTY_DRAFT, slug: "luna-vale" }, live)).toBe(true);
    expect(stepReady(3, { ...EMPTY_DRAFT, slug: "luna-vale" }, { ...live, slugOk: false })).toBe(
      false,
    );
    expect(stepReady(3, { ...EMPTY_DRAFT, slug: "Luna Vale" }, live)).toBe(false);
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
