import { type NextRequest, NextResponse } from "next/server";

import { clearLegacySessionCookie } from "@bandcoin/auth";

import { routeCustomHost } from "./lib/custom-host";

/**
 * One login across bandcoin.io and every *.bandcoin.io app: the session cookie
 * is shared (AUTH_COOKIE_DOMAIN), and the old host-only bandfan cookie is
 * cleared so it can't shadow the shared one.
 *
 * An artist's custom domain (plan 32) shows their artist page at its home;
 * other paths go to the same page on Bandcoin (see lib/custom-host).
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const route = routeCustomHost(request.headers.get("host"), pathname, search);
  if (route.kind === "home") {
    return NextResponse.rewrite(new URL(route.rewrite, request.url));
  }
  if (route.kind === "redirect") return NextResponse.redirect(route.to, 307);
  if (route.kind === "pass") return NextResponse.next();

  const response = NextResponse.next();
  clearLegacySessionCookie(request, response);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|webp|ico)$).*)"],
};
