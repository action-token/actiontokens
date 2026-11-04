import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { serverApi } from "~/server/api";

/** The pages the artist can pick from, after signing in with Facebook. */
export async function GET() {
  const sealed = (await cookies()).get("fb_user_token")?.value;
  if (!sealed) return NextResponse.json({ pages: [] });
  try {
    return NextResponse.json({
      pages: await (await serverApi()).facebook.pages({ sealedUserToken: sealed }),
    });
  } catch (error) {
    return NextResponse.json(
      { pages: [], error: error instanceof Error ? error.message : "Couldn't read your pages." },
      { status: 400 },
    );
  }
}
