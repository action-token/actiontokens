import { describe, expect, it } from "vitest";

import { acceptFor, fileRequired, ITEM_TYPES, mediaTypeFor } from "./item-types";

describe("item types", () => {
  it("offers the seven collectible kinds, in a sensible order", () => {
    expect(ITEM_TYPES.map((entry) => entry.value)).toEqual([
      "IMAGE",
      "VIDEO",
      "MODEL_3D",
      "DOCUMENT",
      "TICKET",
      "MERCH",
      "ROYALTY",
    ]);
  });

  it("requires the file for art, video, 3D and documents only", () => {
    expect(
      ["IMAGE", "VIDEO", "MODEL_3D", "DOCUMENT"].map((type) => fileRequired(type as never)),
    ).toEqual([true, true, true, true]);
    expect(["TICKET", "MERCH", "ROYALTY"].map((type) => fileRequired(type as never))).toEqual([
      false,
      false,
      false,
    ]);
  });

  it("limits what the file picker shows to what fits the type", () => {
    expect(acceptFor("IMAGE")).toBe("image/*");
    expect(acceptFor("VIDEO")).toBe("video/*");
    expect(acceptFor("DOCUMENT")).toContain("application/pdf");
    expect(acceptFor("MODEL_3D")).toContain(".glb");
  });

  it("names the file's media type from what was picked", () => {
    expect(mediaTypeFor("image/png", "IMAGE")).toBe("IMAGE");
    expect(mediaTypeFor("video/mp4", "VIDEO")).toBe("VIDEO");
    expect(mediaTypeFor("application/pdf", "TICKET")).toBe("DOCUMENT");
    expect(mediaTypeFor("model/gltf-binary", "MODEL_3D")).toBe("MODEL_3D");
    // a 3D file often has no mime type at all: the item type decides
    expect(mediaTypeFor("", "MODEL_3D")).toBe("MODEL_3D");
    expect(mediaTypeFor("", "MERCH")).toBe("DOCUMENT");
  });
});
