import { db } from "@bandcoin/db/server";
import { stellarToml } from "@bandcoin/api";

/** SEP-1: wallets read this to show each token's name and image. */
export async function GET() {
  const body = await stellarToml(db);
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // Wallets fetch it from the browser, so it must allow any origin.
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300",
    },
  });
}
