import { describe, expect, it } from "vitest";

import { pinScanUrl } from "../ar/qr";

describe("pinScanUrl", () => {
  it("points at the AR scan screen with the spot id", () => {
    const url = new URL(pinScanUrl("cabc123"));
    expect(url.pathname).toBe("/scan");
    expect(url.searchParams.get("pin")).toBe("cabc123");
  });
});
