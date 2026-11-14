import { describe, expect, it, vi } from "vitest";

vi.mock("@bandcoin/storage", () => ({
  fetchPublicFile: vi.fn(),
  renderOutlinePng: vi.fn().mockResolvedValue(Buffer.from("outline")),
}));

import type { AiModel } from "../services/ai/model";
import {
  decodeDataUrl,
  enhancePrompt,
  enhanceSilhouette,
  generateSilhouette,
  pagePreviewImage,
  silhouettePrompt,
} from "../services/ai/silhouette";

const fakeModel = (png: Buffer | null = Buffer.from("png")): AiModel => ({
  fill: vi.fn(),
  write: vi.fn(),
  image: vi.fn().mockResolvedValue(png),
  edit: vi.fn().mockResolvedValue(png),
});

describe("reference images from the browser", () => {
  it("reads a PNG data URL", () => {
    const reference = decodeDataUrl(
      `data:image/png;base64,${Buffer.from("png").toString("base64")}`,
    );
    expect(reference.type).toBe("image/png");
    expect(reference.bytes.toString()).toBe("png");
  });

  it.each([
    "data:image/svg+xml;base64,PHN2Zz4=",
    "data:text/html;base64,PGh0bWw+",
    "not a data url",
  ])("refuses %s", (bad) => {
    expect(() => decodeDataUrl(bad)).toThrow(/PNG, JPG or WebP/);
  });

  it("refuses one over 8 MB", () => {
    const big = Buffer.alloc(8 * 1024 * 1024 + 1).toString("base64");
    expect(() => decodeDataUrl(`data:image/png;base64,${big}`)).toThrow(/over 8 MB/);
  });
});

describe("reference links to web pages", () => {
  it("uses the page's preview image, resolved against the page", () => {
    const html = `<head><meta name="description" content="x"><meta property="og:image" content="/img/a.png?a=1&amp;b=2"></head>`;
    expect(pagePreviewImage(html, "https://example.com/page")).toBe(
      "https://example.com/img/a.png?a=1&b=2",
    );
  });

  it("falls back to the Twitter card image, and finds nothing on a bare page", () => {
    expect(
      pagePreviewImage(
        `<meta content="https://cdn.example.com/c.jpg" name="twitter:image">`,
        "https://example.com",
      ),
    ).toBe("https://cdn.example.com/c.jpg");
    expect(pagePreviewImage("<html><body>hi</body></html>", "https://example.com")).toBeNull();
  });
});

describe("the prompts", () => {
  it("asks for one solid original shape, or follows the reference", () => {
    const plain = silhouettePrompt("a guitar", false);
    expect(plain).toMatch(/a guitar/);
    expect(plain).toMatch(/ONE solid black filled shape/);
    expect(plain).toMatch(/original design/);
    expect(silhouettePrompt("our mascot", true)).toMatch(/shape of the reference image/);
  });

  it("asks for the same subject, cleaned up, with the artist's own words added", () => {
    expect(enhancePrompt()).toMatch(/same subject/);
    expect(enhancePrompt("make it rounder")).toMatch(/Also: make it rounder/);
  });
});

describe("making a silhouette", () => {
  it("draws from the description alone, or edits the references", async () => {
    const model = fakeModel();
    const plain = await generateSilhouette(model, "a note", []);
    expect(plain).toBe(`data:image/png;base64,${Buffer.from("png").toString("base64")}`);
    expect(model.image).toHaveBeenCalledWith(expect.objectContaining({ size: "1024x1024" }));
    await generateSilhouette(model, "our mascot", [{ bytes: Buffer.from("x"), type: "image/png" }]);
    expect(model.edit).toHaveBeenCalledTimes(1);
  });

  it("redraws an outline the server drew itself", async () => {
    const model = fakeModel();
    await enhanceSilhouette(model, "M10 10 L90 10 L50 90 Z", "smoother");
    expect(model.edit).toHaveBeenCalledWith(
      expect.objectContaining({ images: [{ bytes: Buffer.from("outline"), type: "image/png" }] }),
    );
  });

  it("says so when no image came back", async () => {
    await expect(generateSilhouette(fakeModel(null), "a note", [])).rejects.toThrow(
      /No image came back/,
    );
  });
});
