import { describe, expect, it, vi } from "vitest";

import type { ChainGateway } from "../services/chain-gateway";
import { existingTokenImage, imageFromToml } from "../services/artist/token-image";

const fetchPublicFile = vi.hoisted(() => vi.fn());
vi.mock("@bandcoin/storage", () => ({ fetchPublicFile }));

const ISSUER = `G${"A".repeat(55)}`;
const TOML = `
VERSION="2.0.0"

[DOCUMENTATION]
ORG_NAME="Luna Records"

[[CURRENCIES]]
code="OTHER"
issuer="${ISSUER}"
image="https://luna.example/other.png"

[[CURRENCIES]]
code = "LUNA"
issuer = "${ISSUER}"
name = "Luna fan token"
image = "https://luna.example/luna.png"
`;

describe("token images from stellar.toml", () => {
  it("finds the image of the right code and issuer", () => {
    expect(imageFromToml(TOML, "LUNA", ISSUER)).toBe("https://luna.example/luna.png");
    expect(imageFromToml(TOML, "LUNA", `G${"B".repeat(55)}`)).toBeNull();
    expect(imageFromToml(TOML, "NOPE", ISSUER)).toBeNull();
  });

  it("only takes https images", () => {
    const plain = TOML.replace("https://luna.example/luna.png", "http://luna.example/luna.png");
    expect(imageFromToml(plain, "LUNA", ISSUER)).toBeNull();
  });

  it("reads the issuer's toml through the guarded fetch, and gives null when anything fails", async () => {
    const chain = {
      assetTomlUrl: vi.fn().mockResolvedValue("https://luna.example/.well-known/stellar.toml"),
    };
    const ctx = { chain: chain as unknown as ChainGateway };
    fetchPublicFile.mockResolvedValueOnce({ bytes: Buffer.from(TOML), contentType: "text/plain" });
    await expect(existingTokenImage(ctx, { code: "LUNA", issuer: ISSUER })).resolves.toBe(
      "https://luna.example/luna.png",
    );
    expect(fetchPublicFile).toHaveBeenCalledWith("https://luna.example/.well-known/stellar.toml", {
      maxBytes: 100 * 1024,
    });
    fetchPublicFile.mockRejectedValueOnce(new Error("private address"));
    await expect(existingTokenImage(ctx, { code: "LUNA", issuer: ISSUER })).resolves.toBeNull();
    chain.assetTomlUrl.mockResolvedValueOnce(null);
    await expect(existingTokenImage(ctx, { code: "LUNA", issuer: ISSUER })).resolves.toBeNull();
  });
});
