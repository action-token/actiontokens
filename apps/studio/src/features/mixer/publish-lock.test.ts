import { describe, expect, it } from "vitest";

import { publishLock } from "./publish-button";

describe("publishing from the mixer", () => {
  it("is open to approved artists only", () => {
    expect(publishLock("APPROVED")).toBeNull();
  });

  it("offers Join as Artist to people without an artist page", () => {
    expect(publishLock(null)).toMatchObject({ action: "Join as Artist" });
  });

  it("explains a page in review, or one that isn't approved", () => {
    expect(publishLock("PENDING")?.title).toMatch(/in review/);
    expect(publishLock("REJECTED")?.title).toMatch(/isn't approved/);
    expect(publishLock("BANNED")?.title).toMatch(/isn't approved/);
  });
});
