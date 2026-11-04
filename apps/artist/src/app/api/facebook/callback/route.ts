import { NextResponse } from "next/server";

import { readState, sealToken, userTokenFor } from "@bandcoin/api";

/** Where Facebook sends the artist back: checks the state, keeps the user token sealed for 15 minutes. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const read = readState(state);
  const back = (query: string) =>
    NextResponse.redirect(new URL(`${read?.redirect ?? "/settings"}?${query}`, request.url), 302);

  const cookie = request.headers.get("cookie")?.match(/(?:^|;\s*)fb_oauth_state=([^;]+)/)?.[1];
  if (!read || !state || !cookie || decodeURIComponent(cookie) !== state)
    return back("facebook=state_mismatch");
  if (url.searchParams.get("error") || !code) return back("facebook=denied");

  try {
    const sealed = sealToken(await userTokenFor(code));
    const response = back("facebook=pages");
    const options = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
    };
    response.cookies.set("fb_user_token", sealed, { ...options, maxAge: 900 });
    response.cookies.set("fb_oauth_state", "", { ...options, maxAge: 0 });
    return response;
  } catch (error) {
    console.error("[facebook] sign-in failed", error);
    return back("facebook=failed");
  }
}
