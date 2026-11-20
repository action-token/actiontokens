import { type NextRequest, NextResponse } from "next/server";

import { lastFmAuthUrl, lastFmKeys } from "@actiontokens/api";

import { backTo } from "~/lib/safe-redirect";
import { getSession } from "~/server/auth";

/** Step 1 of connecting Last.fm: send the fan to Last.fm to approve Bandcoin. */
export async function GET(request: NextRequest) {
  const redirect = backTo(request.nextUrl.searchParams.get("redirect"), "/bounties");
  if (!(await getSession())) return NextResponse.redirect(new URL(redirect, request.url));

  let apiKey: string;
  try {
    apiKey = lastFmKeys().apiKey;
  } catch {
    return NextResponse.redirect(
      new URL(backTo(redirect, "/bounties", ["error", "lastfm_unavailable"]), request.url),
    );
  }
  const callback = new URL("/api/lastfm/callback", request.url);
  callback.searchParams.set("redirect", redirect);
  return NextResponse.redirect(lastFmAuthUrl(apiKey, callback.toString()));
}
