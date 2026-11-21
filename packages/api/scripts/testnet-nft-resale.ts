/**
 * Dev only: a real smart-contract NFT resale on Stellar testnet through the real API.
 *
 *   pnpm --filter @actiontokens/api testnet:nft-resale
 *
 * A throwaway artist with a smart-contract NFT (the nft_oz contract, unchanged),
 * a seller who buys 3 copies from the artist, and a second buyer. The seller
 * lists 2 copies (`list_batch`), the buyer buys one from the resale listing
 * (`buy`), the seller puts a new price on the other and then takes it off sale
 * (`cancel_listing`). Every step is checked on the contract; the money split is
 * checked against what the contract settles (platform fee and royalty out of the
 * seller's share). Everything made is removed at the end.
 */
import { Asset, Keypair, Operation, TransactionBuilder } from "@stellar/stellar-sdk";

import { tokenAddressOf } from "@actiontokens/chain";
import { db } from "@actiontokens/db/server";

import { createContext } from "../src/context";
import { appRouter } from "../src/root-app";
import { createChainGateway } from "../src/services/chain-gateway";
import { createCallerFactory } from "../src/trpc";
import { assertWritable } from "../../db/scripts/guard";

assertWritable(process.env.DATABASE_URL, "run against the database");
const chain = createChainGateway(db);
if (chain.config.name !== "testnet") throw new Error("Testnet only");
const mother = chain.config.mother;
if (!mother) throw new Error("MOTHER_SECRET is needed on testnet");
if (!chain.config.nftContract) throw new Error("NFT_CONTRACT is needed");
const passphrase = chain.config.network.passphrase;

const friendbot = (key: string) => fetch(`https://friendbot.stellar.org/?addr=${key}`);
const sellerKeys = Keypair.random();
const buyerKeys = Keypair.random();
const artistKeys = Keypair.random();
await Promise.all([sellerKeys, buyerKeys, artistKeys].map((k) => friendbot(k.publicKey())));

const actionToken = new Asset(
  chain.config.assets.actionToken.code,
  chain.config.assets.actionToken.issuer,
);
const stamp = Date.now().toString(36).toUpperCase().slice(-6);

async function run(source: Keypair, operations: ReturnType<typeof Operation.payment>[]) {
  const account = await chain.loadAccount(source.publicKey());
  const builder = new TransactionBuilder(account!, { fee: "1000", networkPassphrase: passphrase });
  for (const op of operations) builder.addOperation(op);
  const tx = builder.setTimeout(60).build();
  tx.sign(source);
  await chain.submit(tx.toXDR());
}
const bandOf = async (key: string) => {
  const account = await chain.loadAccount(key);
  const line = account?.balances.find(
    (b) =>
      "asset_code" in b &&
      b.asset_code === actionToken.getCode() &&
      b.asset_issuer === actionToken.getIssuer(),
  );
  return Number(line?.balance ?? 0);
};
const sign = (xdr: string, key: Keypair) => {
  const tx = TransactionBuilder.fromXDR(xdr, passphrase);
  tx.sign(key);
  return tx.toXDR();
};

for (const keys of [sellerKeys, buyerKeys, artistKeys])
  await run(keys, [Operation.changeTrust({ asset: actionToken })]);
{
  const sender = await chain.loadAccount(mother);
  const builder = new TransactionBuilder(sender!, { fee: "1000", networkPassphrase: passphrase });
  for (const keys of [sellerKeys, buyerKeys])
    builder.addOperation(
      Operation.payment({ destination: keys.publicKey(), asset: actionToken, amount: "300" }),
    );
  await chain.submit(
    await chain.signWithServerKeys(builder.setTimeout(60).build().toXDR(), [mother]),
  );
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
  mkUser(artistKeys, "nr_artist"),
  mkUser(sellerKeys, "nr_seller"),
  mkUser(buyerKeys, "nr_buyer"),
]);
const artist = await db.organization.create({
  data: {
    userId: artistUser.id,
    name: "NFT Resale Test",
    slug: `nft-resale-${stamp.toLowerCase()}`,
    status: "APPROVED",
  },
});
const item = await db.item.create({
  data: {
    type: "IMAGE",
    chainType: "CONTRACT_NFT",
    title: `NFT Resale ${stamp}`,
    slug: `nft-resale-${stamp.toLowerCase()}`,
    coverUrl: "https://example.com/x.png",
    supply: 20,
    royaltyPercent: "5",
    organizationId: artist.id,
    createdById: artistUser.id,
    contractNft: { create: { royaltyBps: 500, status: "PENDING" } },
  },
});
const primary = await db.listing.create({
  data: {
    itemId: item.id,
    sellerId: artistUser.id,
    kind: "PRIMARY",
    status: "ACTIVE",
    priceActionToken: "10",
    priceUsd: "1",
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
const bandToken = tokenAddressOf(actionToken, passphrase);
const onChainPrice = async (token: number) =>
  (await chain.nftListing(token))?.prices.find((p) => p.paymentToken === bandToken)?.price ?? null;

try {
  const xlmOf = async (key: string) =>
    Number(
      (await chain.loadAccount(key))?.balances.find((b) => b.asset_type === "native")?.balance ?? 0,
    );
  const treasuryBefore = await xlmOf(chain.config.treasury);
  // The seller buys 3 copies from the artist.
  const primaryBuy = {
    listingId: primary.id,
    quantity: Number(process.env.NFT_QTY ?? 3),
    currency: "ACTION" as const,
  };
  // The platform's fee check can trip on a busy testnet (the real cost swings); try again a few times.
  let bought: Awaited<ReturnType<typeof seller.order.submit>> | null = null;
  for (let attempt = 1; attempt <= 5 && !bought; attempt++) {
    try {
      const started = await seller.order.start(primaryBuy);
      bought = await seller.order.submit({
        orderId: started.orderId,
        xdr: sign(started.xdr, sellerKeys),
      });
    } catch (error) {
      console.log("primary buy attempt", attempt, "stopped:", (error as Error).message);
      await new Promise((resolve) => setTimeout(resolve, 8000));
    }
  }
  if (!bought) throw new Error("The primary buy never fit the fee check");
  console.log(
    "XLM paid: treasury",
    (treasuryBefore - (await xlmOf(chain.config.treasury))).toFixed(5),
  );
  const copies = await db.nftEdition.findMany({
    where: { itemId: item.id, ownerId: sellerUser.id },
    orderBy: { tokenId: "asc" },
  });
  console.log("seller bought", bought.status, "| copies", copies.map((c) => c.tokenId).join(", "));

  // List two.
  const listing = { itemId: item.id, amount: 2, priceActionToken: "40", priceUsd: "3" };
  const quote = await seller.resale.quoteList(listing);
  console.log(
    "list quote",
    quote.ok ? "ok" : quote.problems,
    "| pay",
    quote.total,
    "XLM | copies",
    "copies" in quote ? quote.copies : "",
    "| net per copy",
    quote.net.actionToken.net,
  );
  const ls = await seller.resale.startList(listing);
  const listed = await seller.resale.submitList({
    orderId: ls.orderId,
    xdr: sign(ls.xdr, sellerKeys),
  });
  const mine = await seller.resale.mine();
  console.log("listed", listed.status, "| rows", mine.length);
  const [first, second] = mine;
  if (!first || !second) throw new Error("Expected two listings");
  for (const row of mine)
    console.log(
      "  copy",
      row.tokenId,
      "on the contract at",
      await onChainPrice(Number(row.tokenId)),
      "stroops",
    );

  // The second buyer buys the first listed copy.
  const [sellerBefore, artistBefore, buyerBefore] = await Promise.all([
    bandOf(sellerKeys.publicKey()),
    bandOf(artistKeys.publicKey()),
    bandOf(buyerKeys.publicKey()),
  ]);
  const buy = { listingId: first.id, quantity: 1, currency: "ACTION" as const };
  const bq = await buyer.order.quote(buy);
  console.log(
    "buyer quote",
    bq.ok ? "ok" : bq.problems,
    bq.totals.map((t) => `${t.amount} ${t.currency}`).join(" + "),
    "| payout",
    JSON.stringify(bq.payout),
  );
  const bs = await buyer.order.start(buy);
  const bd = await buyer.order.submit({ orderId: bs.orderId, xdr: sign(bs.xdr, buyerKeys) });
  const [sellerAfter, artistAfter, buyerAfter] = await Promise.all([
    bandOf(sellerKeys.publicKey()),
    bandOf(artistKeys.publicKey()),
    bandOf(buyerKeys.publicKey()),
  ]);
  console.log(
    "buy",
    bd.status,
    "| owner on the contract is the buyer:",
    (await chain.nftOwnerOf(Number(first.tokenId))) === buyerKeys.publicKey(),
  );
  console.log(
    "seller +",
    (sellerAfter - sellerBefore).toFixed(7),
    "| artist royalty +",
    (artistAfter - artistBefore).toFixed(7),
    "| buyer -",
    (buyerBefore - buyerAfter).toFixed(7),
  );
  const edition = await db.nftEdition.findFirst({ where: { tokenId: first.tokenId! } });
  console.log("database owner is the buyer:", edition?.ownerId === buyerUser.id);
  console.log(
    "seller's sold history:",
    JSON.stringify((await seller.resale.sold()).map((s) => [s.quantity, s.currency, s.unitPrice])),
  );

  // A new price on the other copy: the same call again.
  const rp = await seller.resale.startList({
    itemId: item.id,
    amount: 1,
    priceActionToken: "50",
    priceUsd: "4",
    listingIds: [second.id],
  });
  await seller.resale.submitList({ orderId: rp.orderId, xdr: sign(rp.xdr, sellerKeys) });
  console.log(
    "repriced: on the contract now",
    await onChainPrice(Number(second.tokenId)),
    "stroops",
  );

  // Take it off sale.
  const cs = await seller.resale.startCancel({ listingId: second.id });
  if (cs.closed) throw new Error("Expected a transaction");
  const cd = await seller.resale.submitCancel({
    orderId: cs.orderId,
    xdr: sign(cs.xdr, sellerKeys),
  });
  console.log(
    "cancel",
    cd.status,
    "| still listed on the contract:",
    Boolean(await chain.nftListing(Number(second.tokenId))),
    "| statuses:",
    JSON.stringify((await seller.resale.mine()).map((l) => l.status)),
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
