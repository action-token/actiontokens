import { z } from "zod";

import { buildLoginChallengeXdr } from "@bandcoin/wallet/server";

const publicKey = z.string().regex(/^G[A-Z2-7]{55}$/);

/** The challenge transaction a wallet signs to sign in (never submitted). */
export async function GET(request: Request) {
  const parsed = publicKey.safeParse(new URL(request.url).searchParams.get("pubkey"));
  if (!parsed.success) return Response.json({ error: "Not a Stellar public key" }, { status: 400 });
  try {
    return Response.json({ xdr: await buildLoginChallengeXdr({ publicKey: parsed.data }) });
  } catch (error) {
    console.error("[xdr] couldn't build the login challenge", error);
    return Response.json({ error: "This wallet's account isn't on the network yet. Fund it with XLM first." }, { status: 422 });
  }
}
