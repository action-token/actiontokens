import { type NextRequest, NextResponse } from "next/server";

import { lastFmSession } from "@bandcoin/api";
import { db } from "@bandcoin/db/server";

import { backTo } from "~/lib/safe-redirect";
import { getSession } from "~/server/auth";

/** Step 2: Last.fm sends the fan back with a token; trade it for a session and save the account. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const redirect = backTo(params.get("redirect"), "/bounties");
  const back = (flag: [string, string]) =>
    NextResponse.redirect(new URL(backTo(redirect, "/bounties", flag), request.url));

  const user = (await getSession())?.user;
  const userId = user?.id;
  const token = params.get("token");
  if (!userId) return NextResponse.redirect(new URL(redirect, request.url));
  if (!token) return back(["error", "missing_token"]);

  try {
    const account = await lastFmSession(token);
    const data = { ...account, isConnected: true };
    await db.lastFmAccount.upsert({ where: { userId }, create: { userId, ...data }, update: data });
    await db.activityLog.create({
      data: {
        actorId: userId,
        actorRole: user?.role ?? "FAN",
        action: "lastfm.connect",
        targetType: "LastFmAccount",
        targetId: userId,
        status: "SUCCESS",
        app: "app",
      },
    });
    return back(["lastfm", "connected"]);
  } catch {
    return back(["error", "lastfm_failed"]);
  }
}
