/**
 * Dev only: one real Studio top-up on Stellar testnet through the real API.
 *
 *   pnpm --filter @bandcoin/api testnet:studio [usd] [currency]   (default 1 XLM)
 *
 * A fresh Friendbot buyer signs in as a wallet user, quotes, starts, signs
 * locally (as Freighter would) and submits. Then it checks the coins and the
 * history, finds the payment on the network, and removes the buyer again.
 */
import { Keypair, TransactionBuilder } from "@stellar/stellar-sdk";

import { db } from "@bandcoin/db/server";

import { createContext } from "../src/context";
import { studioRouter } from "../src/root-studio";
import { createChainGateway } from "../src/services/chain-gateway";
import { createCallerFactory } from "../src/trpc";

const host = new URL(process.env.DATABASE_URL ?? "postgresql://x@missing/x").hostname;
if (!host.startsWith("ep-red-sea-")) throw new Error(`Refusing to run against ${host}`);

const usd = Number(process.argv[2] ?? "1");
const currency = (process.argv[3] ?? "XLM") as "BANDCOIN" | "XLM" | "USDC";

const chain = createChainGateway(db);
if (chain.config.name !== "testnet") throw new Error("Testnet only");

const buyerKeys = Keypair.random();
await fetch(`https://friendbot.stellar.org/?addr=${buyerKeys.publicKey()}`);
const buyer = await db.user.create({
  data: { walletAddress: buyerKeys.publicKey(), signUpMethod: "frieghter" },
});

const caller = createCallerFactory(studioRouter)(
  createContext({
    db,
    chain,
    app: "studio",
    session: {
      user: {
        id: buyer.id,
        role: "FAN",
        walletAddress: buyerKeys.publicKey(),
        walletType: "frieghter",
      },
    },
  }),
);

try {
  const quote = await caller.coins.quote({ currency, usd });
  console.log(
    "quote",
    `${quote.coins} coins for ${quote.pay} ${quote.currency}`,
    quote.ok ? "ok" : quote.problems,
  );
  const started = await caller.coins.start({ currency, usd });
  if (!started.xdr) throw new Error("Nothing to sign");
  const tx = TransactionBuilder.fromXDR(started.xdr, chain.config.network.passphrase);
  tx.sign(buyerKeys);
  const done = await caller.coins.submit({ orderId: started.orderId, xdr: tx.toXDR() });
  const order = await db.order.findUniqueOrThrow({ where: { id: started.orderId } });
  console.log("order", done.status, `+${done.coins} coins`, "tx", order.txHash);

  const balance = await caller.coins.balance();
  const ledger = await caller.coins.ledger({});
  console.log(
    "balance",
    balance.coins,
    "history",
    ledger.entries.map((e) => `${e.kind} ${e.amount} ${e.note ?? ""}`),
  );
  const found = order.txHash ? await chain.findTransaction(order.txHash) : null;
  console.log("on chain:", found?.successful ? "paid to the treasury" : "not found");
} finally {
  await db.activityLog.deleteMany({ where: { actorId: buyer.id } });
  await db.order.deleteMany({ where: { buyerId: buyer.id } });
  await db.user.delete({ where: { id: buyer.id } });
}
