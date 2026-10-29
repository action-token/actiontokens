import { describe, expect, it } from "vitest";

import { slugFromName, validateSlug } from "../slug";

describe("slugFromName", () => {
  it("turns a name into a page address", () => {
    expect(slugFromName("Luna Vale")).toBe("luna-vale");
    expect(slugFromName("  The Night-Drivers!! ")).toBe("the-night-drivers");
  });

  it("drops accents and symbols", () => {
    expect(slugFromName("Beyoncé & Co.")).toBe("beyonce-co");
  });

  it("stays within the length limit", () => {
    expect(slugFromName("a".repeat(80))).toHaveLength(40);
  });
});

describe("validateSlug", () => {
  it("accepts lowercase words joined by single hyphens", () => {
    expect(validateSlug("luna-vale")).toBeNull();
    expect(validateSlug("band2")).toBeNull();
  });

  it("explains what's wrong", () => {
    expect(validateSlug("ab")).toBe("Use at least 3 characters");
    expect(validateSlug("a".repeat(41))).toBe("Use at most 40 characters");
    expect(validateSlug("Luna Vale")).toBe("Use lowercase letters, numbers and single hyphens");
    expect(validateSlug("-luna")).toBe("Use lowercase letters, numbers and single hyphens");
    expect(validateSlug("luna--vale")).toBe("Use lowercase letters, numbers and single hyphens");
  });

  it("keeps names that look like the platform for the platform", () => {
    expect(validateSlug("admin")).toBe("That address is reserved");
    expect(validateSlug("bandcoin")).toBe("That address is reserved");
  });
});
