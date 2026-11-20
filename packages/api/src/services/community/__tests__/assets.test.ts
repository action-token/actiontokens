import { describe, expect, it, vi } from "vitest";

import { searchAssets } from "../assets";

const reply = (body: unknown, ok = true) =>
  vi.fn().mockResolvedValue({ ok, json: () => Promise.resolve(body) }) as unknown as typeof fetch;

describe("searchAssets", () => {
  it("maps explorer records and drops ones without an issuer", async () => {
    const hits = await searchAssets(
      "luna",
      reply({
        _embedded: {
          records: [
            {
              asset: "LUNA-GISSUER",
              tomlInfo: { image: "https://x.test/l.png", name: "Luna" },
              trustlines: { funded: 7 },
            },
            { asset: "XLM" },
          ],
        },
      }),
    );
    expect(hits).toEqual([
      {
        assetCode: "LUNA",
        assetIssuer: "GISSUER",
        assetImageUrl: "https://x.test/l.png",
        name: "Luna",
        org: null,
        trustlines: 7,
      },
    ]);
  });

  it("returns nothing when the explorer is down", async () => {
    expect(await searchAssets("x", reply({}, false))).toEqual([]);
    expect(
      await searchAssets(
        "x",
        vi.fn().mockRejectedValue(new Error("down")) as unknown as typeof fetch,
      ),
    ).toEqual([]);
  });
});
