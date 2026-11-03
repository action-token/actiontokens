import { describe, expect, it } from "vitest";

import { coinsFor } from "./studio-price";

describe("Studio card preview", () => {
  it("shows the same coins per run as the server works out", () => {
    expect(coinsFor(0.04, 30)).toBe(6);
    expect(coinsFor(0.5, 30)).toBe(65);
    expect(coinsFor(0.003, 30)).toBe(1);
    expect(coinsFor(0.1, 30)).toBe(13);
  });
});
