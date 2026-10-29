const MIN = 3;
const MAX = 20;
const COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

/** Top-level routes and names that could be mistaken for the platform. */
const RESERVED = new Set([
  "admin", "administrator", "api", "app", "artist", "artists", "about", "bandcoin", "bounty", "bounties", "collection",
  "collections", "creator", "creators", "drop", "explore", "feed", "help", "library", "login", "logout", "market",
  "marketplace", "me", "moderator", "music", "notification", "notifications", "playlist", "playlists", "privacy", "recharge",
  "root", "settings", "staff", "studio", "support", "system", "terms", "u", "wallet",
]);

export const normalizeUsername = (raw: string) => raw.trim().replace(/^@/, "").toLowerCase();

/** null when valid, otherwise what to tell the fan. */
export function validateUsername(username: string): string | null {
  if (username.length < MIN) return `Use at least ${MIN} characters`;
  if (username.length > MAX) return `Use at most ${MAX} characters`;
  if (!/^[a-z0-9_]+$/.test(username)) return "Use only lowercase letters, numbers and underscores";
  if (!/^[a-z0-9]/.test(username)) return "Start with a letter or number";
  if (RESERVED.has(username)) return "That name is reserved";
  return null;
}

/** When the username can change again; null if it never changed (the first one is free). */
export const usernameChangeOpensAt = (changedAt: Date | null) => (changedAt ? new Date(changedAt.getTime() + COOLDOWN_MS) : null);
