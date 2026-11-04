import type { Context } from "../../context";

/**
 * The platform's stellar.toml (SEP-1), served at /.well-known/stellar.toml:
 * wallets and explorers read it to show each token's name, description and
 * image. Lists every classic token on the platform (items and fan tokens).
 * Text is escaped as TOML basic strings, so a quote in a title can't break the
 * file (the old app's file broke on one).
 */
type Db = Pick<Context, "db">["db"];

const HEADER = `[DOCUMENTATION]
ORG_NAME="Bandcoin"
ORG_URL="https://bandcoin.io/"
ORG_LOGO="https://raw.githubusercontent.com/Bandcoin2023/assets/refs/heads/main/public/bandcoin.png"
ORG_DESCRIPTION="Bandcoin : Collect, Connect, Listen"
ORG_TWITTER="bandcoinio"
ORG_OFFICIAL_EMAIL="support@bandcoin.io"

`;

/** A TOML basic string: backslash, quote and control characters escaped. */
export function tomlString(value: string) {
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/[\u0000-\u001f\u007f]/g, (char) => {
      const named: Record<string, string> = {
        "\n": "\\n",
        "\r": "\\r",
        "\t": "\\t",
        "\b": "\\b",
        "\f": "\\f",
      };
      return named[char] ?? `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`;
    });
  return `"${escaped}"`;
}

export type TomlCurrency = {
  code: string;
  issuer: string;
  name: string;
  description?: string | null;
  image?: string | null;
};

export function currencyToml(c: TomlCurrency) {
  const lines = [
    "[[CURRENCIES]]",
    `code=${tomlString(c.code)}`,
    `issuer=${tomlString(c.issuer)}`,
    "display_decimals=7",
    `name=${tomlString(c.name)}`,
  ];
  if (c.description) lines.push(`desc=${tomlString(c.description)}`);
  if (c.image && /^https?:\/\//i.test(c.image)) lines.push(`image=${tomlString(c.image)}`);
  return `${lines.join("\n")}\n\n`;
}

export async function stellarToml(db: Db) {
  const tokens = await db.classicToken.findMany({
    where: { item: { deletedAt: null, hiddenAt: null } },
    orderBy: { item: { createdAt: "asc" } },
    select: {
      code: true,
      issuer: true,
      item: {
        select: {
          title: true,
          description: true,
          coverUrl: true,
          type: true,
          artist: { select: { name: true } },
        },
      },
    },
  });
  const seen = new Set<string>();
  let body = HEADER;
  for (const token of tokens) {
    const key = `${token.code}:${token.issuer}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const isFanToken = token.item.type === "FAN_TOKEN";
    body += currencyToml({
      code: token.code,
      issuer: token.issuer,
      name: isFanToken ? (token.item.artist?.name ?? token.item.title) : token.item.title,
      description: isFanToken
        ? `Fan token of ${token.item.artist?.name ?? "an artist"}`
        : token.item.description,
      image: token.item.coverUrl,
    });
  }
  return body;
}
