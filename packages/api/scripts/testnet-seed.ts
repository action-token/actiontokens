/**
 * Dev only: fills the dev database with ActionTokens demo organizations, fans, drops, pins,
 * events, bounties and murals that are REAL on Stellar testnet.
 *
 *   pnpm --filter @actiontokens/api testnet:seed
 *
 * - Every org and fan gets its own testnet wallet funded by Friendbot.
 * - Each org opens its own issuer (the production builder; the org pays) and trusts ACTION and
 *   USDC. Its token and items are classic assets of that issuer, so buying and pin claims work
 *   for real. The issuer secret is stored encrypted (CHAIN_ACCOUNT_KEY), as the app does.
 * - The ACTION treasury (MOTHER_SECRET) sends ACTION to orgs and fans.
 * - Fans trust some org tokens and items and really receive them from the issuer, so ownership
 *   in the database matches the chain.
 * - Bounties go through the real org API: created, token set up for escrow, funded on chain.
 *
 * Wallet secrets (testnet only) go to `.local/testnet-accounts.md` at the repo root, which git
 * ignores, so you can sign in with Freighter or Albedo on testnet.
 *
 * Refuses anything but the local `actiontokens_dev` database and testnet, and refuses to run
 * twice (an org slug already present stops it before anything is written).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Account, Asset, Keypair, Operation, TransactionBuilder } from "@stellar/stellar-sdk";

import { buildIssuerSetup, finish, startTransaction } from "@actiontokens/chain";
import { addSignatures, chainConfig, encryptSecret, submit } from "@actiontokens/chain/server";
import { db } from "@actiontokens/db/server";

import { assertWritable, dbParts } from "../../db/scripts/guard";
import { banner, cover, nudge } from "../../db/scripts/seed/demo-data";
import { createContext } from "../src/context";
import { portalRouter } from "../src/root-portal";
import { createChainGateway } from "../src/services/chain-gateway";
import { createCallerFactory } from "../src/trpc";
import { FANS, MURALS, ORGS, type SeedOrg } from "./testnet-seed-data";

// ── Guards ───────────────────────────────────────────────────────────────────
assertWritable(process.env.DATABASE_URL, "seed testnet data");
if (dbParts(process.env.DATABASE_URL!).database !== "actiontokens_dev")
  throw new Error("Refusing: this seeds the actiontokens_dev database only.");
const config = chainConfig();
if (config.name !== "testnet") throw new Error("Refusing: testnet only.");
if (!process.env.MOTHER_SECRET)
  throw new Error("MOTHER_SECRET (the testnet ACTION treasury) is not set.");
const mother = Keypair.fromSecret(process.env.MOTHER_SECRET);

const existing = await db.organization.findMany({
  where: { slug: { in: ORGS.map((o) => o.slug) } },
  select: { slug: true },
});
if (existing.length > 0)
  throw new Error(
    `Already seeded (${existing.map((e) => e.slug).join(", ")}). Nothing was changed.`,
  );

const ACTION = new Asset(config.assets.actionToken.code, config.assets.actionToken.issuer);
const USDC = new Asset(config.assets.usdc.code, config.assets.usdc.issuer);
const DAY = 86_400_000;
const daysFromNow = (d: number) => new Date(Date.now() + d * DAY);
const usd = (action: number) => Math.round(action * 0.01 * 100) / 100;

// ── Chain helpers ────────────────────────────────────────────────────────────
async function friendbot(publicKey: string) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const response = await fetch(`https://friendbot.stellar.org/?addr=${publicKey}`);
    if (response.ok) return;
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
  throw new Error(`Friendbot failed for ${publicKey}`);
}

async function accountOf(publicKey: string) {
  const response = await fetch(`${config.horizonUrl}/accounts/${publicKey}`);
  if (!response.ok) throw new Error(`No testnet account ${publicKey}`);
  const body = (await response.json()) as { sequence: string };
  return new Account(publicKey, body.sequence);
}

/** Builds, signs and submits one transaction from `source` with `ops` (≤ 100). */
async function send(
  source: Keypair,
  ops: ReturnType<typeof Operation.payment>[],
  extraSigners: Keypair[] = [],
) {
  if (ops.length === 0) return null;
  const builder = startTransaction(await accountOf(source.publicKey()), config.network);
  for (const op of ops) builder.addOperation(op);
  const { xdr } = finish(builder);
  const { hash } = await submit(
    addSignatures(
      xdr,
      [source, ...extraSigners].map((k) => k.secret()),
    ),
  );
  return hash;
}

const trust = (asset: Asset) => Operation.changeTrust({ asset });
const pay = (destination: string, asset: Asset, amount: number, source?: string) =>
  Operation.payment({ destination, asset, amount: amount.toFixed(7), source });

// ── People ───────────────────────────────────────────────────────────────────
type Wallet = { name: string; role: string; keys: Keypair; note: string };
const wallets: Wallet[] = [];

console.log("Funding fan wallets with Friendbot…");
const fans = [];
for (const fan of FANS) {
  const keys = Keypair.random();
  await friendbot(keys.publicKey());
  // Every fan trusts ACTION and gets 5,000 from the treasury.
  await send(keys, [trust(ACTION)]);
  const user = await db.user.create({
    data: {
      username: fan.username,
      displayName: fan.displayName,
      walletAddress: keys.publicKey(),
      signUpMethod: "frieghter",
      avatarUrl: cover(`fan-${fan.username}`, 200),
    },
  });
  fans.push({ ...fan, keys, user });
  wallets.push({ name: fan.displayName, role: "Fan", keys, note: `@${fan.username}` });
}
await send(
  mother,
  fans.map((f) => pay(f.keys.publicKey(), ACTION, 5000)),
);
console.log(`  ${fans.length} fans, 5,000 ACTION each`);

// ── Organizations ────────────────────────────────────────────────────────────
type Built = {
  seed: SeedOrg;
  orgId: string;
  userId: string;
  wallet: Keypair;
  issuer: Keypair;
  tokenAsset: Asset;
  tokenItemId: string;
  items: { id: string; asset: Asset }[];
};
const built: Built[] = [];

for (const seed of ORGS) {
  console.log(`${seed.name}…`);
  const wallet = Keypair.random();
  const issuer = Keypair.random();
  await friendbot(wallet.publicKey());

  // The org opens its issuer (production builder, the org pays), then trusts ACTION and USDC.
  const setup = buildIssuerSetup({
    artist: await accountOf(wallet.publicKey()),
    network: config.network,
    issuer: issuer.publicKey(),
  });
  await submit(addSignatures(setup.xdr, [wallet.secret()]));
  await send(wallet, [trust(ACTION), trust(USDC)]);
  // Enough ACTION to fund its bounty, with some left over.
  await send(mother, [pay(wallet.publicKey(), ACTION, seed.bounty.prize + 10_000)]);

  const user = await db.user.create({
    data: {
      username: seed.slug,
      displayName: seed.name,
      email: `${seed.slug}@demo.action-tokens.com`,
      role: "ARTIST",
      walletAddress: wallet.publicKey(),
      signUpMethod: "frieghter",
      avatarUrl: cover(`${seed.slug}-avatar`, 200),
    },
  });
  const issuerAccount = await db.chainAccount.create({
    data: {
      kind: "ISSUER",
      publicKey: issuer.publicKey(),
      secretEncrypted: encryptSecret(issuer.secret()),
      ownerId: user.id,
      activatedAt: new Date(),
    },
  });
  const org = await db.organization.create({
    data: {
      userId: user.id,
      issuerAccountId: issuerAccount.id,
      name: seed.name,
      slug: seed.slug,
      bio: `${seed.kind} · ${seed.area}, ${seed.city}. ${seed.bio}`,
      website: seed.website,
      status: "APPROVED",
      avatarUrl: cover(`${seed.slug}-avatar`, 400),
      coverUrl: banner(`${seed.slug}-cover`),
    },
  });

  // Org token ("action token") and its holder tiers.
  const tokenAsset = new Asset(seed.token, issuer.publicKey());
  const tokenItem = await db.item.create({
    data: {
      type: "FAN_TOKEN",
      chainType: "CLASSIC_TOKEN",
      title: `$${seed.token}`,
      slug: `${seed.slug}-token`,
      description: `${seed.name}'s action token.`,
      coverUrl: cover(`${seed.slug}-token`),
      organizationId: org.id,
      createdById: user.id,
      classicToken: { create: { code: seed.token, issuer: issuer.publicKey() } },
      listings: {
        create: {
          sellerId: user.id,
          priceActionToken: seed.tokenPrice,
          priceUsd: usd(seed.tokenPrice),
        },
      },
    },
  });
  await db.organization.update({ where: { id: org.id }, data: { fanTokenItemId: tokenItem.id } });
  const [, insider] = await Promise.all([
    db.membershipTier.create({
      data: {
        organizationId: org.id,
        name: "Supporter",
        description: `Hold 10 $${seed.token}.`,
        features: ["Member posts", "Early drops"],
        requiredTokens: 10,
        sortOrder: 0,
      },
    }),
    db.membershipTier.create({
      data: {
        organizationId: org.id,
        name: "Insider",
        description: `Hold 50 $${seed.token}.`,
        features: ["Everything in Supporter", "Hidden pins", "Event priority"],
        requiredTokens: 50,
        isPopular: true,
        sortOrder: 1,
      },
    }),
  ]);

  const items = [];
  for (const [i, spec] of seed.items.entries()) {
    const asset = new Asset(spec.code, issuer.publicKey());
    const item = await db.item.create({
      data: {
        type: spec.type,
        chainType: "CLASSIC_TOKEN",
        title: spec.title,
        slug: `${seed.slug}-${spec.code.toLowerCase()}`,
        description: spec.description,
        coverUrl: cover(`${seed.slug}-${i}`),
        supply: spec.supply,
        organizationId: org.id,
        createdById: user.id,
        classicToken: { create: { code: spec.code, issuer: issuer.publicKey() } },
        listings: {
          create: { sellerId: user.id, priceActionToken: spec.price, priceUsd: usd(spec.price) },
        },
      },
    });
    items.push({ id: item.id, asset });
  }

  // Posts, event, pins, announcement.
  for (const [i, post] of seed.posts.entries()) {
    await db.post.create({
      data: {
        organizationId: org.id,
        title: post.title,
        body: post.body,
        ...(i === 1 ? { audience: "MEMBERS" as const, tierId: insider.id } : {}),
        media: { create: { type: "IMAGE", url: cover(`${seed.slug}-post-${i}`) } },
      },
    });
  }
  const event = await db.event.create({
    data: {
      organizationId: org.id,
      title: seed.event.title,
      description: seed.event.description,
      coverUrl: cover(`${seed.slug}-event`),
      startsAt: daysFromNow(seed.event.inDays),
      endsAt: daysFromNow(seed.event.inDays + 0.2),
      venueName: seed.event.venue,
      ...nudge(seed.lat, seed.lng, 100, -60),
      capacity: 200,
    },
  });
  for (const spec of seed.pins) {
    const at = nudge(seed.lat, seed.lng, spec.north, spec.east);
    await db.pin.create({
      data: {
        organizationId: org.id,
        title: spec.title,
        type: spec.type,
        description: spec.description,
        imageUrl: cover(`${seed.slug}-${spec.title}`),
        ...at,
        radiusMeters: 60,
        claimLimit: 200,
        claimsLeft: 200,
        startsAt: daysFromNow(-1),
        endsAt: daysFromNow(45),
        approval: "APPROVED",
        rewardsFanToken: spec.tokenReward !== null,
        rewardAmount: spec.tokenReward ?? 0,
        rewardItemId: spec.tokenReward === null ? items[0]!.id : null,
        eventId: spec.type === "EVENT" ? event.id : null,
        spots: { create: [{ ...at }] },
      },
    });
  }
  await db.announcement.create({
    data: {
      organizationId: org.id,
      title: "New drops on the map",
      body: `${seed.pins.length} drops around ${seed.area} this month.`,
      isPinned: true,
      ctaLabel: "Open the map",
      ctaUrl: "/map",
    },
  });

  built.push({
    seed,
    orgId: org.id,
    userId: user.id,
    wallet,
    issuer,
    tokenAsset,
    tokenItemId: tokenItem.id,
    items,
  });
  wallets.push({
    name: seed.name,
    role: `Organization (${seed.kind})`,
    keys: wallet,
    note: `org: ${seed.slug}`,
  });
}

// ── Fans hold real tokens ────────────────────────────────────────────────────
console.log("Sending org tokens and items to fans…");
// Each fan holds the tokens of three orgs (rotating) and the first item of the first one.
const holdings = fans.map((fan, f) => ({
  fan,
  orgs: [0, 1, 2].map((k) => built[(f + k) % built.length]!),
}));
for (const { fan, orgs } of holdings) {
  await send(fan.keys, [...orgs.map((o) => trust(o.tokenAsset)), trust(orgs[0]!.items[0]!.asset)]);
}
for (const org of built) {
  const ops = [];
  const rows: { userId: string; itemId: string; quantity: number }[] = [];
  for (const { fan, orgs } of holdings) {
    const position = orgs.indexOf(org);
    if (position < 0) continue;
    const amount = position === 0 ? 60 : 15; // first org: enough for the Insider tier
    ops.push(pay(fan.keys.publicKey(), org.tokenAsset, amount, org.issuer.publicKey()));
    rows.push({ userId: fan.user.id, itemId: org.tokenItemId, quantity: amount });
    if (position === 0) {
      ops.push(pay(fan.keys.publicKey(), org.items[0]!.asset, 1, org.issuer.publicKey()));
      rows.push({ userId: fan.user.id, itemId: org.items[0]!.id, quantity: 1 });
    }
  }
  // The org wallet pays the fee; the issuer authorises its own payments.
  await send(org.wallet, ops, [org.issuer]);
  for (const row of rows) await db.ownership.create({ data: { ...row, source: "GIFT" } });
}

// Follows and RSVPs: fans follow the orgs they hold, and RSVP to the first one's event.
for (const { fan, orgs } of holdings) {
  for (const org of orgs)
    await db.follow.create({ data: { userId: fan.user.id, organizationId: org.orgId } });
  const event = await db.event.findFirst({
    where: { organizationId: orgs[0]!.orgId },
    select: { id: true },
  });
  if (event) await db.eventRsvp.create({ data: { eventId: event.id, userId: fan.user.id } });
}

// ── Bounties, through the real org API, funded into escrow on chain ──────────
const chain = createChainGateway(db);
const bounties: string[] = [];
if (!chain.config.escrowContract) {
  console.warn("ESCROW_CONTRACT is not set: bounties skipped.");
} else {
  console.log("Creating and funding bounties…");
  for (const org of built) {
    const caller = createCallerFactory(portalRouter)(
      createContext({
        db,
        chain,
        app: "org",
        session: {
          user: {
            id: org.userId,
            role: "ARTIST",
            walletAddress: org.wallet.publicKey(),
            walletType: "frieghter",
          },
        },
      }),
    );
    const signed = (xdr: string) => {
      const tx = TransactionBuilder.fromXDR(xdr, config.network.passphrase);
      tx.sign(org.wallet);
      return tx.toXDR();
    };
    try {
      const b = org.seed.bounty;
      const { bountyId, tokenSetup } = await caller.bounties.create({
        title: b.title,
        summary: b.summary,
        description: b.description,
        instructions: b.instructions,
        requiresActionCam: false,
        prizeAmount: String(b.prize),
        prizeCurrency: "ACTION",
        maxWinners: b.winners,
        fundedFromStorage: false,
      });
      if (tokenSetup) {
        const setup = await caller.bounties.prepareTokenSetup({ bountyId });
        await caller.bounties.submitTokenSetup({ bountyId, xdr: signed(setup.xdr) });
      }
      const fund = await caller.bounties.prepareFunding({ bountyId });
      const { txHash } = await caller.bounties.submitFunding({ bountyId, xdr: signed(fund.xdr) });
      bounties.push(`${org.seed.name}: ${b.prize} ACTION, tx ${txHash}`);
    } catch (error) {
      console.warn(`  bounty for ${org.seed.name} failed:`, (error as Error).message);
    }
  }
}

// ── Murals (off chain: AR coins) ─────────────────────────────────────────────
const finder = fans[0]!;
for (const [i, m] of MURALS.entries()) {
  const mural = await db.mural.create({
    data: {
      autoTitle: m.title,
      title: m.title,
      coverUrl: cover(`mural-${i}`),
      latitude: m.lat,
      longitude: m.lng,
      status: "APPROVED",
      discovererId: finder.user.id,
      distinctScanners: 3,
      scanCount: 4 + i,
    },
  });
  await db.coinLedgerEntry.create({
    data: { userId: finder.user.id, amount: 60, reason: "MURAL_DISCOVERY", muralId: mural.id },
  });
}
await db.coinBalance.upsert({
  where: { userId: finder.user.id },
  create: { userId: finder.user.id, balance: 60 * MURALS.length },
  update: { balance: { increment: 60 * MURALS.length } },
});

// ── Save the wallets (testnet secrets) where git won't see them ──────────────
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const out = resolve(root, ".local/testnet-accounts.md");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  [
    "# ActionTokens testnet demo accounts",
    "",
    `Created ${new Date().toISOString()} by packages/api/scripts/testnet-seed.ts. TESTNET ONLY.`,
    "Sign in: add the secret to Freighter (switch it to Testnet) or Albedo, then use that wallet",
    "in the connect dialog. Org accounts open the org portal as that organization.",
    "",
    "| Who | Role | Public key | Secret (password) |",
    "|---|---|---|---|",
    ...wallets.map(
      (w) =>
        `| ${w.name} (${w.note}) | ${w.role} | \`${w.keys.publicKey()}\` | \`${w.keys.secret()}\` |`,
    ),
    "",
    "## Bounties funded",
    ...bounties.map((b) => `- ${b}`),
    "",
  ].join("\n"),
);

console.log(
  `Done: ${built.length} orgs, ${fans.length} fans, ${built.reduce((n, o) => n + o.items.length + 1, 0)} items, ` +
    `${ORGS.reduce((n, o) => n + o.pins.length, 0)} pins, ${bounties.length} funded bounties, ${MURALS.length} murals.`,
);
console.log(`Wallets and secrets: ${out}`);
await db.$disconnect();
