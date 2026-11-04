/**
 * Dev only: makes one demo artist really buyable on Stellar testnet.
 *
 *   pnpm --filter @bandcoin/api testnet:demo [artist-slug]   (default lumen-avenue)
 *
 * Gives the artist a funded testnet wallet (Friendbot), has that wallet open
 * the artist's one issuer (the artist pays, as in production), adds BANDCOIN
 * and USDC trustlines so the artist can be paid in them, and points the
 * artist's items at the new issuer. The issuer secret is stored encrypted
 * (CHAIN_ACCOUNT_KEY); the artist wallet's secret is thrown away.
 * Prints public keys only. Refuses to run outside the dev database and testnet.
 */
import { Account, Asset, Keypair, Operation } from "@stellar/stellar-sdk";

import { buildIssuerSetup, finish, startTransaction } from "@bandcoin/chain";
import { addSignatures, chainConfig, encryptSecret, submit } from "@bandcoin/chain/server";
import { db } from "@bandcoin/db/server";

const host = new URL(process.env.DATABASE_URL ?? "postgresql://x@missing/x").hostname;
if (!host.startsWith("ep-red-sea-")) throw new Error(`Refusing to run against ${host}`);
const config = chainConfig();
if (config.name !== "testnet") throw new Error("Testnet only");

const slug = process.argv[2] ?? "lumen-avenue";

async function friendbot(publicKey: string) {
  const response = await fetch(`https://friendbot.stellar.org/?addr=${publicKey}`);
  if (!response.ok) throw new Error(`Friendbot failed for ${publicKey}: ${response.status}`);
}

async function sequenceOf(publicKey: string) {
  const response = await fetch(`${config.horizonUrl}/accounts/${publicKey}`);
  const body = (await response.json()) as { sequence: string };
  return new Account(publicKey, body.sequence);
}

const artist = await db.artist.findUniqueOrThrow({
  where: { slug },
  select: { id: true, name: true, userId: true, issuerAccountId: true },
});

const wallet = Keypair.random();
const issuer = Keypair.random();
await friendbot(wallet.publicKey());

// The artist opens their issuer (the production builder), then trusts BANDCOIN and USDC. The artist pays both.
const setup = buildIssuerSetup({
  artist: await sequenceOf(wallet.publicKey()),
  network: config.network,
  issuer: issuer.publicKey(),
});
const { hash } = await submit(addSignatures(setup.xdr, [wallet.secret()]));
const trust = startTransaction(await sequenceOf(wallet.publicKey()), config.network);
for (const asset of [config.assets.bandcoin, config.assets.usdc]) {
  trust.addOperation(Operation.changeTrust({ asset: new Asset(asset.code, asset.issuer) }));
}
await submit(addSignatures(finish(trust).xdr, [wallet.secret()]));

await db.$transaction(async (tx) => {
  await tx.user.update({
    where: { id: artist.userId },
    data: { walletAddress: wallet.publicKey() },
  });
  const data = {
    publicKey: issuer.publicKey(),
    secretEncrypted: encryptSecret(issuer.secret()),
    activatedAt: new Date(),
  };
  const account = artist.issuerAccountId
    ? await tx.chainAccount.update({ where: { id: artist.issuerAccountId }, data })
    : await tx.chainAccount.create({ data: { ...data, kind: "ISSUER", ownerId: artist.userId } });
  await tx.artist.update({ where: { id: artist.id }, data: { issuerAccountId: account.id } });
  await tx.classicToken.updateMany({
    where: { item: { artistId: artist.id } },
    data: { issuer: issuer.publicKey(), issuerAccountId: null },
  });
});

console.log(`${artist.name} is live on testnet`);
console.log(`  artist wallet  ${wallet.publicKey()}`);
console.log(`  issuer         ${issuer.publicKey()}`);
console.log(`  setup tx       ${hash}`);
await db.$disconnect();
