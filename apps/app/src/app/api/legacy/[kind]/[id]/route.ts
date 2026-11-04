import { NextResponse } from "next/server";

import { resolveLegacyLink } from "@bandcoin/api";
import { db } from "@bandcoin/db/server";

/** An old shared link: sent to the same thing's new page, or to a "moved" page. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const { kind, id } = await params;
  const path = await resolveLegacyLink(db, kind, decodeURIComponent(id)).catch(() => null);
  return NextResponse.redirect(new URL(path ?? "/moved", request.url), 307);
}
