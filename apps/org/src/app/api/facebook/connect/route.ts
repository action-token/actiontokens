import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { serverApi } from "~/server/api";

/** Connects the chosen page, then forgets the sign-in cookie. */
export async function POST(request: Request) {
  const body = z
    .object({ pageId: z.string().min(1).max(100) })
    .safeParse(await request.json().catch(() => null));
  const jar = await cookies();
  const sealed = jar.get("fb_user_token")?.value;
  if (!body.success || !sealed)
    return NextResponse.json(
      { error: "Your Facebook sign-in expired. Connect again." },
      { status: 400 },
    );
  try {
    const connected = await (
      await serverApi()
    ).facebook.connect({
      sealedUserToken: sealed,
      pageId: body.data.pageId,
    });
    jar.delete("fb_user_token");
    return NextResponse.json(connected);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Couldn't connect that page." },
      { status: 400 },
    );
  }
}
