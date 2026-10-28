import { type NextRequest, NextResponse } from "next/server";

import { clearLegacySessionCookie } from "@bandcoin/auth";

/**
 * One login across bandcoin.io and every *.bandcoin.io app: the session cookie
 * is shared (AUTH_COOKIE_DOMAIN), and the old host-only bandfan cookie is
 * cleared so it can't shadow the shared one.
 */
export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  clearLegacySessionCookie(request, response);
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|webp|ico)$).*)"] };
