import { describe, expect, it } from "vitest";

import { slugify, qrFilename } from "./print";
import { renderQr } from "./qr-codes";

describe("renderQr", () => {
  it("draws an SVG that holds the spot's scan link", async () => {
    const code = await renderQr("spot123", "svg");
    expect(code.contentType).toBe("image/svg+xml");
    expect(atob(code.base64)).toContain("<svg");
    expect(new URL(code.scanUrl).searchParams.get("pin")).toBe("spot123");
  });

  it("draws a PNG as raw base64 (no data: prefix)", async () => {
    const code = await renderQr("spot123", "png");
    expect(code.contentType).toBe("image/png");
    expect(code.base64.startsWith("iVBOR")).toBe(true);
  });
});

describe("qr file names", () => {
  it("are safe, ordered by spot number, and end in the spot's id", () => {
    expect(slugify("Secret show @ the fountain!")).toBe("secret-show-the-fountain");
    expect(qrFilename({ title: "Secret show" }, { spotId: "cabcdef123456", pinNumber: 3 }, "svg")).toBe("bandcoin-qr-secret-show-pin-03-123456.svg");
    expect(qrFilename({ title: "Secret show" }, { spotId: "cabcdef123456", pinNumber: null })).toBe("bandcoin-qr-secret-show-123456.svg");
  });
});
