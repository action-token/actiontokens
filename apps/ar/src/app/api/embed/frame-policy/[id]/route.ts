import { NextResponse } from "next/server";

import { frameAncestors } from "@bandcoin/ar-core/embed/config";
import { db } from "@bandcoin/db/server";

/** The CSP `frame-ancestors` value for one saved embed (read by `src/proxy.ts`). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const row = id
    ? await db.mapEmbed.findUnique({
        where: { id },
        select: { isEnabled: true, allowedDomains: true },
      })
    : null;
  // A turned-off or unknown embed shows "Map unavailable", which may sit in any frame.
  const policy = row?.isEnabled ? frameAncestors(row.allowedDomains) : "frame-ancestors *";
  return NextResponse.json(
    { policy, live: Boolean(row?.isEnabled) },
    { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=300" } },
  );
}
