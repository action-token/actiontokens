/**
 * Custom domains (plan 32): a request for a host that isn't Action Tokens' own is
 * an artist's domain. Its home shows the artist's page; every other path goes
 * to the same path on Action Tokens, so the page's links keep working. The API and
 * Next's own files are served here, since the artist page loads through them.
 */

/** Where the marketplace lives; links from a custom domain land here. */
export const FAN_APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.action-tokens.com";

const OWN_SUFFIXES = ["action-tokens.com", "vercel.app", "sslip.io", "localhost"];

/** "Coldplay.com:443" → "coldplay.com" */
export const bareHost = (host: string | null) =>
  (host ?? "").trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");

export function isOwnHost(rawHost: string | null, appOrigin = FAN_APP_ORIGIN) {
  const host = bareHost(rawHost);
  if (!host) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host === "[::1]") return true;
  const own = [...OWN_SUFFIXES, bareHost(new URL(appOrigin).host)];
  return own.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

/** Paths a custom domain serves itself: Next's files, the API, media and icons. */
const PASS_THROUGH = [
  /^\/_next\//,
  /^\/api\/(trpc|media)\//,
  /^\/favicon\.ico$/,
  /\.(png|jpg|jpeg|svg|webp|ico|woff2?)$/,
];

export type CustomHostRoute =
  | { kind: "own" }
  | { kind: "home"; rewrite: string }
  | { kind: "pass" }
  | { kind: "redirect"; to: string };

export function routeCustomHost(
  rawHost: string | null,
  pathname: string,
  search: string,
  appOrigin = FAN_APP_ORIGIN,
): CustomHostRoute {
  if (isOwnHost(rawHost, appOrigin)) return { kind: "own" };
  if (pathname === "/")
    return { kind: "home", rewrite: `/domain-site/${encodeURIComponent(bareHost(rawHost))}` };
  if (PASS_THROUGH.some((pattern) => pattern.test(pathname))) return { kind: "pass" };
  return { kind: "redirect", to: `${appOrigin.replace(/\/$/, "")}${pathname}${search}` };
}
