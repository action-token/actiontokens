import { createChainGateway, createContext, receiveWebhook } from "@actiontokens/api";
import { db } from "@actiontokens/db/server";

/** Meta's check that this address is ours: it sends our verify token and expects its challenge back. */
export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const expected = process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN;
  if (
    expected &&
    params.get("hub.mode") === "subscribe" &&
    params.get("hub.verify_token") === expected
  )
    return new Response(params.get("hub.challenge") ?? "", { status: 200 });
  return new Response("Forbidden", { status: 403 });
}

/** New posts on connected pages: checked against Meta's signature and queued for the worker. */
export async function POST(request: Request) {
  const raw = await request.text();
  const ctx = createContext({
    db,
    chain: createChainGateway(db),
    app: "artist",
    session: null,
    headers: request.headers,
  });
  const result = await receiveWebhook(ctx, raw, request.headers.get("x-hub-signature-256"));
  if (!result.ok)
    return new Response(result.status === 401 ? "Invalid signature" : "Invalid JSON", {
      status: result.status,
    });
  return Response.json({ received: true, queued: result.queued });
}
