/**
 * AR shows the marketplace but doesn't sell: buying happens in the fan app, which has the wallet and
 * checkout. These build the links over there and write prices (plan 49).
 */
const fanApp = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");

/** The item's page in the fan app. */
export const marketItemUrl = (slug: string) => `${fanApp}/item/${encodeURIComponent(slug)}`;

export const marketplaceUrl = `${fanApp}/marketplace`;

/** The type chips, in the fan app marketplace's order. `type` is the browse filter. */
export const MARKET_TYPES = [
  { id: "ALL", label: "All" },
  { id: "TRACK", label: "Music" },
  { id: "IMAGE", label: "Artwork" },
  { id: "VIDEO", label: "Video" },
  { id: "TICKET", label: "Tickets" },
  { id: "FAN_TOKEN", label: "Fan tokens" },
  { id: "MERCH", label: "Merch" },
  { id: "ROYALTY", label: "Royalties" },
  { id: "LOCKED", label: "Locked content" },
] as const;

export type MarketTypeId = (typeof MARKET_TYPES)[number]["id"];

export const TYPE_LABEL: Record<string, string> = {
  TRACK: "Music",
  VIDEO: "Video",
  IMAGE: "Artwork",
  MODEL_3D: "3D",
  DOCUMENT: "Document",
  ROYALTY: "Royalty",
  TICKET: "Ticket",
  MERCH: "Merch",
  FAN_TOKEN: "Fan token",
};

/** The browse input for a chip. */
export function browseFilter(id: MarketTypeId) {
  if (id === "ALL") return {};
  if (id === "LOCKED") return { locked: true };
  return { type: id } as const;
}

/** "1250.5" → "1,250.5"; from 100,000 up "18.2M", so prices fit a two-column card. Null if unreadable. */
export function formatPrice(price: string | number | null | undefined): string | null {
  const n = Number(price);
  if (price === null || price === undefined || price === "" || !Number.isFinite(n)) return null;
  const big = n >= 100_000;
  return n.toLocaleString("en-US", {
    notation: big ? "compact" : "standard",
    maximumFractionDigits: big ? 1 : 2,
  });
}

export function formatUsd(price: string | number | null | undefined): string | null {
  const text = formatPrice(price);
  return text ? `≈ $${text}` : null;
}

/**
 * The platform token's code as users see it ("ACTION"), from the configured Stellar asset.
 * The stored currency value is `ACTION` too; a deployment may set a different asset code.
 */
export const TOKEN_CODE = (process.env.NEXT_PUBLIC_ASSET_CODE || "ACTION").toUpperCase();

/** A currency as users read it: the stored platform value `ACTION` shows as the token's code. */
export const currencyLabel = (currency: string) => (currency === "ACTION" ? TOKEN_CODE : currency);
