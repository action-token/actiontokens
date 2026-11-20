import { fetchPublicFile } from "@actiontokens/storage";

import type { Context } from "../../context";

/** stellar.toml files are small; anything bigger isn't one. */
const MAX_TOML_BYTES = 100 * 1024;

const value = (block: string, key: string) =>
  new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"`, "m").exec(block)?.[1] ?? null;

/**
 * The image an issuer published for its asset in stellar.toml (the
 * [[CURRENCIES]] entry with this code and issuer), or null. Only https images.
 */
export function imageFromToml(toml: string, code: string, issuer: string): string | null {
  for (const block of toml.split(/^\s*\[\[CURRENCIES\]\]\s*$/m).slice(1)) {
    const body = block.split(/^\s*\[/m)[0] ?? "";
    if (value(body, "code") === code && value(body, "issuer") === issuer) {
      const image = value(body, "image");
      return image?.startsWith("https://") ? image : null;
    }
  }
  return null;
}

/**
 * The image a token already on Stellar shows in wallets, read from its
 * issuer's stellar.toml. The fetch goes through the public-URL guard (the
 * issuer controls the domain). Null when there's none or it can't be read.
 */
export async function existingTokenImage(
  ctx: Pick<Context, "chain">,
  token: { code: string; issuer: string },
): Promise<string | null> {
  try {
    const url = await ctx.chain.assetTomlUrl(token.code, token.issuer);
    if (!url) return null;
    const { bytes } = await fetchPublicFile(url, { maxBytes: MAX_TOML_BYTES });
    return imageFromToml(bytes.toString("utf8"), token.code, token.issuer);
  } catch {
    return null;
  }
}
