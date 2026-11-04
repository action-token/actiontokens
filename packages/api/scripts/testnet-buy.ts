/**
 * Dev only: one real purchase on Stellar testnet through the real API.
 *
 *   pnpm --filter @bandcoin/api testnet:buy [item-slug] [currency]   (default lumen-avenue-night-drive XLM)
 *
 * A fresh Friendbot buyer signs in as a wallet user, quotes, starts, signs
 * locally (as Freighter would) and submits. Then it checks the copy is on
 * the buyer's Stellar account and removes the buyer again. Run
 * `testnet:demo` for the item's artist first.
 */
import { Asset, Keypair, TransactionBuilder } from "@stellar/stellar-sdk";

import { db } from "@bandcoin/db/server";

import { createContext } from "../src/context";
import { appRouter } from "../src/root-app";
import { createChainGateway } from "../src/services/chain-gateway";
import { createCallerFactory } from "../src/trpc";

const host = new URL(process.env.DATABASE_URL ?? "postgresql://x@missing/x").hostname;
if (!host.startsWith("ep-red-sea-")) throw new Error(`Refusing to run against ${host}`);

const slug = process.argv[2] ?? "lumen-avenue-night-drive";
const currency = (process.argv[3] ?? "XLM") as "BANDCOIN" | "XLM" | "USDC";

const chain = createChainGateway(db);
if (chain.config.name !== "testnet") throw new Error("Testnet only");

const buyerKeys = Keypair.random();
await fetch(`https://friendbot.stellar.org/?addr=${buyerKeys.publicKey()}`);
const buyer = await db.user.create({
  data: { walletAddress: buyerKeys.publicKey(), signUpMethod: "frieghter" },
});

const item = await db.item.findUniqueOrThrow({
  where: { slug },
  select: {
    id: true,
    title: true,
    classicToken: true,
    listings: { where: { status: "ACTIVE" }, take: 1 },
  },
});
const listing = item.listings[0];
if (!listing || !item.classicToken) throw new Error(`${slug} has no active classic listing`);

const caller = createCallerFactory(appRouter)(
  createContext({
    db,
    chain,
    app: "app",
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
  const quote = await caller.order.quote({ listingId: listing.id, quantity: 1, currency });
  console.log(
    "quote",
    quote.totals.map((total) => `${total.amount} ${total.currency}`).join(" + "),
    quote.ok ? "ok" : quote.problems,
  );
  const started = await caller.order.start({ listingId: listing.id, quantity: 1, currency });
  const tx = TransactionBuilder.fromXDR(started.xdr, chain.config.network.passphrase);
  tx.sign(buyerKeys);
  const done = await caller.order.submit({ orderId: started.orderId, xdr: tx.toXDR() });
  const order = await db.order.findUniqueOrThrow({ where: { id: started.orderId } });
  console.log("order", done.status, "tx", order.txHash);

  const account = await chain.loadAccount(buyerKeys.publicKey());
  const asset = new Asset(item.classicToken.code, item.classicToken.issuer);
  const line = account?.balances.find(
    (balance) =>
      "asset_code" in balance &&
      balance.asset_code === asset.getCode() &&
      balance.asset_issuer === asset.getIssuer(),
  );
  console.log(`on chain: buyer holds ${line?.balance ?? 0} ${asset.getCode()}`);
} finally {
  const orders = await db.order.findMany({
    where: { buyerId: buyer.id },
    select: { quantity: true, status: true },
  });
  const sold = orders
    .filter((order) => order.status === "DELIVERED")
    .reduce((sum, order) => sum + order.quantity, 0);
  if (sold > 0)
    await db.listing.update({
      where: { id: listing.id },
      data: { quantitySold: { decrement: sold }, status: "ACTIVE" },
    });
  await db.activityLog.deleteMany({ where: { actorId: buyer.id } });
  await db.order.deleteMany({ where: { buyerId: buyer.id } });
  await db.user.delete({ where: { id: buyer.id } });
  await db.$disconnect();
}
