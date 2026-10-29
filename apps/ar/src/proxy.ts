import { type NextRequest, NextResponse } from "next/server";

import { artistPortalOrigins } from "@bandcoin/ar-core/embed/config";
import { clearLegacySessionCookie } from "@bandcoin/auth";

/**
 * One login across bandcoin.io and every *.bandcoin.io app: the session cookie
 * is shared (AUTH_COOKIE_DOMAIN), and the old host-only bandfan cookie is
 * cleared so it can't shadow the shared one.
 *
 * Framing: `/embed/[id]` may be framed by the sites its artist allows; every
 * other page only by the AR app itself, so no site can overlay the app.
 */
export async function proxy(request: NextRequest) {
  const response = /^\/embed\/[^/]+$/.test(request.nextUrl.pathname)
    ? await embedPolicy(request)
    : NextResponse.next();
  if (!response.headers.has("Content-Security-Policy"))
    response.headers.set("Content-Security-Policy", "frame-ancestors 'self'");
  clearLegacySessionCookie(request, response);
  return response;
}

/**
 * The iframe allowlist (CSP `frame-ancestors`) for one embed, set before the
 * page renders. The editor's `/embed/preview` may only be framed by the
 * artist portal.
 */
async function embedPolicy(request: NextRequest) {
  const id = request.nextUrl.pathname.split("/")[2] ?? "";
  const response = NextResponse.next();

  if (id === "preview") {
    // Otherwise it would put the map on any site with no allowlist at all.
    response.headers.set(
      "Content-Security-Policy",
      `frame-ancestors 'self' ${artistPortalOrigins().join(" ")}`,
    );
    return response;
  }

  try {
    const r = await fetch(
      new URL(`/api/embed/frame-policy/${encodeURIComponent(id)}`, request.url),
      { next: { revalidate: 30 } },
    );
    const { policy, live } = (await r.json()) as { policy: string; live: boolean };
    response.headers.set("Content-Security-Policy", policy);
    if (live)
      response.headers.set("Cache-Control", "public, s-maxage=30, stale-while-revalidate=300");
  } catch {
    // If the policy can't be read, fail closed: only our own pages may frame it.
    response.headers.set("Content-Security-Policy", "frame-ancestors 'self'");
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|webp|ico)$).*)"],
};
