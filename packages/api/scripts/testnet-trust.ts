/**
 * Dev only: one real fan-token offer on Stellar testnet through the real API.
 *
 *   pnpm --filter @bandcoin/api testnet:trust
 *
 * Makes a throwaway artist with a fan token (its own Friendbot issuer) and a
 * throwaway fan with some BANDCOIN from the mother account. The fan then
 * quotes, starts, signs locally (as Freighter would) and submits the offer:
 * BANDCOIN for exactly the 0.5 XLM a trustline locks, and the line opens in the
 * same transaction. Checks the chain and removes everything it made.
 */
import { Asset, Keypair, Operation, TransactionBuilder } from "@stellar/stellar-sdk";

import { db } from "@bandcoin/db/server";

import { createContext } from "../src/context";
import { appRouter } from "../src/root-app";
import { createChainGateway } from "../src/services/chain-gateway";
import { createCallerFactory } from "../src/trpc";

const host = new URL(process.env.DATABASE_URL ?? "postgresql://x@missing/x").hostname;
if (!host.startsWith("ep-shy-leaf-")) throw new Error(`Refusing to run against ${host}`);
const chain = createChainGateway(db);
if (chain.config.name !== "testnet") throw new Error("Testnet only");
const mother = chain.config.mother;
if (!mother || !process.env.MOTHER_SECRET) throw new Error("MOTHER_SECRET is needed on testnet");

const friendbot = (key: string) => fetch(`https://friendbot.stellar.org/?addr=${key}`);
const issuerKeys = Keypair.random();
const fanKeys = Keypair.random();
await Promise.all([friendbot(issuerKeys.publicKey()), friendbot(fanKeys.publicKey())]);

const bandcoin = new Asset(chain.config.assets.bandcoin.code, chain.config.assets.bandcoin.issuer);
const balanceOf = async (key: string, asset?: Asset) => {
  const account = await chain.loadAccount(key);
  const line = account?.balances.find((b) =>
    asset
      ? "asset_code" in b &&
        b.asset_code === asset.getCode() &&
        b.asset_issuer === asset.getIssuer()
      : b.asset_type === "native",
  );
  return Number(line?.balance ?? 0);
};

// The fan opens a BANDCOIN line, and the mother account sends some BANDCOIN.
const horizonAccount = async (key: string) => (await chain.loadAccount(key))!;
{
  const fan = await horizonAccount(fanKeys.publicKey());
  const open = new TransactionBuilder(fan, {
    fee: "1000",
    networkPassphrase: chain.config.network.passphrase,
  })
    .addOperation(Operation.changeTrust({ asset: bandcoin }))
    .setTimeout(60)
    .build();
  open.sign(fanKeys);
  await chain.submit(open.toXDR());
  const sender = await horizonAccount(mother);
  const send = new TransactionBuilder(sender, {
    fee: "1000",
    networkPassphrase: chain.config.network.passphrase,
  })
    .addOperation(
      Operation.payment({ destination: fanKeys.publicKey(), asset: bandcoin, amount: "100" }),
    )
    .setTimeout(60)
    .build();
  await chain.submit(await chain.signWithServerKeys(send.toXDR(), [mother]));
}

const stamp = Date.now().toString(36).toUpperCase().slice(-6);
const code = `T${stamp}`;
const owner = await db.user.create({
  data: { walletAddress: Keypair.random().publicKey(), signUpMethod: "frieghter" },
});
const fanUser = await db.user.create({
  data: { walletAddress: fanKeys.publicKey(), signUpMethod: "frieghter" },
});
const artist = await db.artist.create({
  data: {
    userId: owner.id,
    name: "Trust Test",
    slug: `trust-test-${stamp.toLowerCase()}`,
    status: "APPROVED",
  },
});
const item = await db.item.create({
  data: {
    type: "FAN_TOKEN",
    chainType: "CLASSIC_TOKEN",
    title: code,
    slug: `trust-${stamp.toLowerCase()}`,
    coverUrl: "https://example.com/x.png",
    artistId: artist.id,
    createdById: owner.id,
    classicToken: { create: { code, issuer: issuerKeys.publicKey(), isExternal: true } },
  },
});
await db.artist.update({ where: { id: artist.id }, data: { fanTokenItemId: item.id } });

const caller = createCallerFactory(appRouter)(
  createContext({
    db,
    chain,
    app: "app",
    session: {
      user: {
        id: fanUser.id,
        role: "FAN",
        walletAddress: fanKeys.publicKey(),
        walletType: "frieghter",
      },
    },
  }),
);

try {
  const token = new Asset(code, issuerKeys.publicKey());
  const input = { kind: "TOKEN_TRUST" as const, artistId: artist.id };
  const [bandBefore, xlmBefore, motherBefore] = await Promise.all([
    balanceOf(fanKeys.publicKey(), bandcoin),
    balanceOf(fanKeys.publicKey()),
    balanceOf(mother, bandcoin),
  ]);
  const quote = await caller.recharge.quote(input);
  if (quote.kind !== "TOKEN_TRUST") throw new Error("Expected a fan-token quote");
  console.log(
    "quote",
    quote.ok ? "ok" : quote.problems,
    "pay",
    quote.total,
    "BANDCOIN for",
    quote.receiveXlm,
    "XLM",
  );
  const started = await caller.recharge.start(input);
  const tx = TransactionBuilder.fromXDR(started.xdr, chain.config.network.passphrase);
  tx.sign(fanKeys);
  const done = await caller.recharge.submit({ orderId: started.orderId, xdr: tx.toXDR() });
  const order = await db.order.findUniqueOrThrow({ where: { id: started.orderId } });
  console.log("order", done.status, order.kind, "tx", order.txHash);

  const [bandAfter, xlmAfter, motherAfter, held] = await Promise.all([
    balanceOf(fanKeys.publicKey(), bandcoin),
    balanceOf(fanKeys.publicKey()),
    balanceOf(mother, bandcoin),
    chain
      .loadAccount(fanKeys.publicKey())
      .then((a) =>
        a?.balances.some(
          (b) =>
            "asset_code" in b &&
            b.asset_code === token.getCode() &&
            b.asset_issuer === token.getIssuer(),
        ),
      ),
  ]);
  console.log(
    `fan BANDCOIN ${bandBefore} → ${bandAfter} (paid ${(bandBefore - bandAfter).toFixed(7)})`,
  );
  console.log(`platform BANDCOIN +${(motherAfter - motherBefore).toFixed(7)}`);
  console.log(
    `fan XLM ${xlmBefore} → ${xlmAfter} (net ${(xlmAfter - xlmBefore).toFixed(7)}: received 0.5 less the fee; the 0.5 is now the line's locked reserve)`,
  );
  console.log("fan holds the trustline:", held);

  // A second offer for the same token must be refused, with no order made.
  const again = await caller.recharge.start(input).then(
    () => "STARTED (bad)",
    (error: Error) => error.message,
  );
  console.log("second offer:", again);
} finally {
  await db.activityLog.deleteMany({ where: { actorId: fanUser.id } });
  await db.order.deleteMany({ where: { buyerId: fanUser.id } });
  await db.artist.update({ where: { id: artist.id }, data: { fanTokenItemId: null } });
  await db.item.delete({ where: { id: item.id } });
  await db.artist.delete({ where: { id: artist.id } });
  await db.user.deleteMany({ where: { id: { in: [owner.id, fanUser.id] } } });
  await db.$disconnect();
}
