import { describe, expect, it } from "vitest";

import { sha256Base64 } from "./upload";

describe("sha256Base64", () => {
  it("is the checksum S3 pins an upload to", async () => {
    // sha256("hello") in base64
    const file = new File(["hello"], "hello.txt", { type: "text/plain" });
    expect(await sha256Base64(file)).toBe("LPJNul+wow4m6DsqxbninhsWHlwfp0JecwQzYpOLmCQ=");
  });
});
