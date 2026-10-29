import { describe, expect, it } from "vitest";

import { statusLabel, statusTone } from "./wallet";

describe("wallet history status", () => {
  it("says done, working, failed and refunded in plain words", () => {
    expect([statusLabel("DELIVERED"), statusLabel("CONFIRMED"), statusLabel("SUBMITTED"), statusLabel("FAILED"), statusLabel("REFUNDED")]).toEqual([
      "Done",
      "Done",
      "Sending",
      "Failed",
      "Refunded",
    ]);
  });

  it("colours failures red and in-flight orders as a warning", () => {
    expect(statusTone("DELIVERED")).toBe("success");
    expect(statusTone("SUBMITTED")).toBe("warning");
    expect(statusTone("FAILED")).toBe("danger");
    expect(statusTone("REFUNDED")).toBe("neutral");
  });
});
