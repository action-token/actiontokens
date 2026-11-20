/**
 * Dev only: a real resale on Stellar testnet through the real API.
 *
 *   pnpm --filter @actiontokens/api testnet:resale
 *
 * A throwaway artist with a classic item, a seller holding 5 copies, and a
 * buyer with BANDCOIN. The seller lists 3 copies (opening their resale storage
 * and BANDCOIN line in the same transaction), the buyer buys 1 from the resale
 * listing, the seller changes the price and takes the unsold 2 back. Every step
 * is checked on the network, then everything made is removed.
 */
import { Asset, Keypair, Operation, TransactionBuilder } from "@stellar/stellar-sdk";

import { db } from "@actiontokens/db/server";

import { createContext } from "../src/context";
import { appRouter } from "../src/root-app";
import { createChainGateway } from "../src/services/chain-gateway";
import { createCallerFactory } from "../src/trpc";

const host = new URL(process.env.DATABASE_URL ?? "postgresql://x@missing/x").hostname;
if (!host.startsWith("ep-red-sea-")) throw new Error(`Refusing to run against ${host}`);
const chain = createChainGateway(db);
if (chain.config.name !== "testnet") throw new Error("Testnet only");
const mother = chain.config.mother;
if (!mother) throw new Error("MOTHER_SECRET is needed on testnet");
const passphrase = chain.config.network.passphrase;

const friendbot = (key: string) => fetch(`https://friendbot.stellar.org/?addr=${key}`);
const issuerKeys = Keypair.random();
const sellerKeys = Keypair.random();
const buyerKeys = Keypair.random();
const artistKeys = Keypair.random();
await Promise.all(
  [issuerKeys, sellerKeys, buyerKeys, artistKeys].map((k) => friendbot(k.publicKey())),
);

const bandcoin = new Asset(chain.config.assets.bandcoin.code, chain.config.assets.bandcoin.issuer);
const stamp = Date.now().toString(36).toUpperCase().slice(-6);
const token = new Asset(`R${stamp}`, issuerKeys.publicKey());

async function run(
  source: Keypair,
  operations: ReturnType<typeof Operation.payment>[],
  extra: Keypair[] = [],
) {
  const account = await chain.loadAccount(source.publicKey());
  const builder = new TransactionBuilder(account!, { fee: "1000", networkPassphrase: passphrase });
  for (const op of operations) builder.addOperation(op);
  const tx = builder.setTimeout(60).build();
  tx.sign(source, ...extra);
  await chain.submit(tx.toXDR());
}
const balanceOf = async (key: string, asset: Asset) => {
  const account = await chain.loadAccount(key);
  const line = account?.balances.find(
    (b) =>
      "asset_code" in b && b.asset_code === asset.getCode() && b.asset_issuer === asset.getIssuer(),
  );
  return Number(line?.balance ?? 0);
};

// Setup on the network: the seller holds 5 copies; the buyer has BANDCOIN; the artist can be paid royalties.
await run(sellerKeys, [Operation.changeTrust({ asset: token })]);
await run(issuerKeys, [
  Operation.payment({ destination: sellerKeys.publicKey(), asset: token, amount: "5" }),
]);
await run(buyerKeys, [Operation.changeTrust({ asset: bandcoin })]);
await run(artistKeys, [Operation.changeTrust({ asset: bandcoin })]);
{
  const sender = await chain.loadAccount(mother);
  const send = new TransactionBuilder(sender!, { fee: "1000", networkPassphrase: passphrase })
    .addOperation(
      Operation.payment({ destination: buyerKeys.publicKey(), asset: bandcoin, amount: "100" }),
    )
    .setTimeout(60)
    .build();
  await chain.submit(await chain.signWithServerKeys(send.toXDR(), [mother]));
}

const mkUser = (key: Keypair, name: string) =>
  db.user.create({
    data: {
      walletAddress: key.publicKey(),
      signUpMethod: "frieghter",
      username: `${name}_${stamp.toLowerCase()}`,
    },
  });
const [artistUser, sellerUser, buyerUser] = await Promise.all([
  mkUser(artistKeys, "rs_artist"),
  mkUser(sellerKeys, "rs_seller"),
  mkUser(buyerKeys, "rs_buyer"),
]);
const artist = await db.organization.create({
  data: {
    userId: artistUser.id,
    name: "Resale Test",
    slug: `resale-test-${stamp.toLowerCase()}`,
    status: "APPROVED",
  },
});
const item = await db.item.create({
  data: {
    type: "IMAGE",
    chainType: "CLASSIC_TOKEN",
    title: `Resale ${stamp}`,
    slug: `resale-${stamp.toLowerCase()}`,
    coverUrl: "https://example.com/x.png",
    supply: 100,
    royaltyPercent: "10",
    organizationId: artist.id,
    createdById: artistUser.id,
    classicToken: {
      create: { code: token.getCode(), issuer: issuerKeys.publicKey(), isExternal: true },
    },
  },
});

const as = (user: { id: string }, key: Keypair) =>
  createCallerFactory(appRouter)(
    createContext({
      db,
      chain,
      app: "app",
      session: {
        user: { id: user.id, role: "FAN", walletAddress: key.publicKey(), walletType: "frieghter" },
      },
    }),
  );
const seller = as(sellerUser, sellerKeys);
const buyer = as(buyerUser, buyerKeys);
const sign = (xdr: string, key: Keypair) => {
  const tx = TransactionBuilder.fromXDR(xdr, passphrase);
  tx.sign(key);
  return tx.toXDR();
};

try {
  const listing = { itemId: item.id, amount: 3, priceBandcoin: "10", priceUsd: "1" };
  const quote = await seller.resale.quoteList(listing);
  console.log(
    "list quote",
    quote.ok ? "ok" : quote.problems,
    "pay",
    quote.total,
    "XLM; you get",
    quote.net.bandcoin.net,
    "BANDCOIN per copy after",
    quote.net.royaltyPercent + "% royalty",
  );
  const started = await seller.resale.startList(listing);
  const listedRaw = await seller.resale.submitList({
    orderId: started.orderId,
    xdr: sign(started.xdr, sellerKeys),
  });
  if (!listedRaw.listingId) throw new Error("The listing wasn't recorded");
  const listed = { ...listedRaw, listingId: listedRaw.listingId };
  console.log("listed", listed.status, "listing", listed.listingId);
  const storage = await db.chainAccount.findFirstOrThrow({
    where: { ownerId: sellerUser.id, kind: "RESALE_STORAGE" },
  });
  console.log(
    "storage holds",
    await balanceOf(storage.publicKey, token),
    "| seller wallet holds",
    await balanceOf(sellerKeys.publicKey(), token),
    "| seller BANDCOIN line opened:",
    (await chain.loadAccount(sellerKeys.publicKey()))?.balances.some(
      (b) => "asset_code" in b && b.asset_code === "BANDCOIN",
    ),
  );

  // A buyer buys one from the resale listing.
  const [sellerBand0, artistBand0] = await Promise.all([
    balanceOf(sellerKeys.publicKey(), bandcoin),
    balanceOf(artistKeys.publicKey(), bandcoin),
  ]);
  const buy = { listingId: listed.listingId, quantity: 1, currency: "BANDCOIN" as const };
  const bq = await buyer.order.quote(buy);
  console.log(
    "buyer quote",
    bq.ok ? "ok" : bq.problems,
    bq.totals.map((t) => `${t.amount} ${t.currency}`).join(" + "),
  );
  const bs = await buyer.order.start(buy);
  const bd = await buyer.order.submit({ orderId: bs.orderId, xdr: sign(bs.xdr, buyerKeys) });
  console.log(
    "buy",
    bd.status,
    "| buyer holds",
    await balanceOf(buyerKeys.publicKey(), token),
    "copy",
  );
  console.log(
    "seller BANDCOIN +",
    ((await balanceOf(sellerKeys.publicKey(), bandcoin)) - sellerBand0).toFixed(7),
    "| artist royalty +",
    ((await balanceOf(artistKeys.publicKey(), bandcoin)) - artistBand0).toFixed(7),
    "| storage now holds",
    await balanceOf(storage.publicKey, token),
  );

  // Change the price, then take the unsold copies back.
  await seller.resale.setPrice({
    listingId: listed.listingId,
    priceBandcoin: "12",
    priceUsd: "1.2",
  });
  console.log(
    "new price",
    (await seller.resale.mine())[0]?.priceBandcoin,
    "| left",
    (await seller.resale.mine())[0]?.left,
  );
  const cq = await seller.resale.quoteCancel({ listingId: listed.listingId });
  console.log("cancel quote", cq.ok ? "ok" : cq.problems, "copies back:", cq.copies);
  const cs = await seller.resale.startCancel({ listingId: listed.listingId });
  if (cs.closed) throw new Error("Expected a transaction");
  const cd = await seller.resale.submitCancel({
    orderId: cs.orderId,
    xdr: sign(cs.xdr, sellerKeys),
  });
  console.log(
    "cancel",
    cd.status,
    "| seller wallet holds",
    await balanceOf(sellerKeys.publicKey(), token),
    "| storage holds",
    await balanceOf(storage.publicKey, token),
  );
  console.log(
    "listing status",
    (await seller.resale.mine())[0]?.status,
    "| sold history:",
    JSON.stringify(
      (await seller.resale.sold()).map((s) => ({ qty: s.quantity, price: s.unitPrice })),
    ),
  );
} finally {
  const users = [artistUser.id, sellerUser.id, buyerUser.id];
  await db.activityLog.deleteMany({ where: { actorId: { in: users } } });
  await db.order.deleteMany({ where: { OR: [{ buyerId: { in: users } }, { itemId: item.id }] } });
  await db.listing.deleteMany({ where: { itemId: item.id } });
  await db.item.delete({ where: { id: item.id } });
  await db.organization.delete({ where: { id: artist.id } });
  await db.chainAccount.deleteMany({ where: { ownerId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
}
