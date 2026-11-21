/** Top-level routes and names that could be mistaken for the platform. */
const RESERVED = new Set([
  "admin",
  "administrator",
  "api",
  "app",
  "artist",
  "artists",
  "about",
  "album",
  "actiontokens",
  "bounty",
  "bounties",
  "collection",
  "collections",
  "creator",
  "creators",
  "design",
  "domain",
  "drop",
  "embed",
  "explore",
  "feed",
  "gifts",
  "help",
  "item",
  "items",
  "library",
  "login",
  "logout",
  "market",
  "marketplace",
  "me",
  "moderator",
  "music",
  "notification",
  "notifications",
  "pin",
  "pins",
  "playlist",
  "playlists",
  "posts",
  "privacy",
  "recharge",
  "redeem",
  "root",
  "settings",
  "staff",
  "stem-lab",
  "studio",
  "support",
  "system",
  "terms",
  "u",
  "wallet",
]);

export const isReservedName = (name: string) => RESERVED.has(name);

const MIN = 3;
const MAX = 40;

/** "Luna Vale" → "luna-vale": what we suggest while the artist types their name. */
export function slugFromName(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX)
    .replace(/-+$/g, "");
}

/** null when valid, otherwise what to tell the artist. */
export function validateSlug(slug: string): string | null {
  if (slug.length < MIN) return `Use at least ${MIN} characters`;
  if (slug.length > MAX) return `Use at most ${MAX} characters`;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug))
    return "Use lowercase letters, numbers and single hyphens";
  if (isReservedName(slug)) return "That address is reserved";
  return null;
}
