import type { NextRequest, NextResponse } from "next/server";

/**
 * Single sign-on across action-tokens.com and every *.action-tokens.com app (app, artist, ar, studio): when AUTH_COOKIE_DOMAIN is set (".action-tokens.com" in
 * production only), the NextAuth session cookie is written for the whole domain, so every
 * Action Tokens app on a subdomain reads the same login. All of them must share NEXTAUTH_SECRET:
 * an app that can't decrypt the cookie deletes it, which signs the user out everywhere.
 * Unset (Vercel previews) everything behaves as NextAuth's defaults; local dev uses its own cookie name (below).
 *
 * The cookie keeps NextAuth's default name, so `getToken({ req })` and existing clients
 * keep working unchanged.
 */
// `||`, not `??`: an empty value (AUTH_COOKIE_DOMAIN="") means unset too.
// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
export const AUTH_COOKIE_DOMAIN = process.env.AUTH_COOKIE_DOMAIN || undefined;

/** NextAuth's default session cookie name over https. */
export const SESSION_COOKIE = "__Secure-next-auth.session-token";

/**
 * On localhost every project shares one cookie jar (cookies ignore ports) and NextAuth's
 * default cookie name, so another app's login (a different secret) overwrote this one, or
 * failed to decrypt here and was deleted: an intermittent sign-out. Locally the cookie gets
 * Action Tokens' own name. The four Action Tokens apps still share it, so one login covers them all.
 */
export const DEV_SESSION_COOKIE = "action-tokens.session-token";

/** `cookies` option for NextAuth: only the session token is shared, the rest stay per site. */
export const sharedSessionCookie = AUTH_COOKIE_DOMAIN
  ? {
      sessionToken: {
        name: SESSION_COOKIE,
        options: {
          httpOnly: true,
          sameSite: "lax" as const,
          path: "/",
          secure: true,
          domain: AUTH_COOKIE_DOMAIN,
        },
      },
    }
  : process.env.NODE_ENV === "development"
    ? {
        sessionToken: {
          name: DEV_SESSION_COOKIE,
          options: { httpOnly: true, sameSite: "lax" as const, path: "/", secure: false },
        },
      }
    : undefined;

/**
 * Clears the old single-site session cookie (bandfan's, on action-tokens.com) left from before the login became shared. A browser
 * would send both copies and the stale one would win, so signing out elsewhere would not sign the
 * user out here. The expiry has no Domain, so it only touches that old host-only copy; the shared
 * cookie is left alone. Safe to delete once every old cookie has expired (30 days after
 * AUTH_COOKIE_DOMAIN goes live).
 */
export function clearLegacySessionCookie(req: NextRequest, res: NextResponse) {
  if (!AUTH_COOKIE_DOMAIN) return;
  for (const { name } of req.cookies.getAll()) {
    if (name === SESSION_COOKIE || name.startsWith(`${SESSION_COOKIE}.`)) {
      res.headers.append(
        "Set-Cookie",
        `${name}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax`,
      );
    }
  }
}
