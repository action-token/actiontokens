import { NextResponse } from "next/server";

import { loginUrl, makeState } from "@bandcoin/api";
import { db } from "@bandcoin/db/server";

import { getSession } from "~/server/auth";

/** Settings › Facebook › Connect: sends the artist to Facebook to sign in. */
export async function GET(request: Request) {
  const session = await getSession();
  const artist = session?.user?.id
    ? await db.artist.findUnique({
        where: { userId: session.user.id },
        select: { id: true, status: true },
      })
    : null;
  if (!artist || artist.status !== "APPROVED")
    return NextResponse.json({ error: "Sign in as an approved artist first." }, { status: 401 });

  const asked = new URL(request.url).searchParams.get("redirect") ?? "/settings";
  // Only a path on this site: never an address someone else chose.
  const redirect = asked.startsWith("/") && !asked.startsWith("//") ? asked : "/settings";
  try {
    const state = makeState({ artistId: artist.id, redirect });
    const response = NextResponse.redirect(loginUrl(state), 302);
    response.cookies.set("fb_oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 600,
    });
    return response;
  } catch {
    return NextResponse.redirect(new URL(`${redirect}?facebook=not_set_up`, request.url), 302);
  }
}
