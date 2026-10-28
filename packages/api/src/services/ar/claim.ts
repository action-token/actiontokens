import { Account, Asset, type Transaction, TransactionBuilder } from "@stellar/stellar-sdk";

import { buildClassicPurchase, memoText, networkFeeXlm, toAmount, toStroops } from "@bandcoin/chain";
import { spendableXlm, trusts } from "@bandcoin/chain/server";
import { AppError, ErrorCodes } from "@bandcoin/errors";

import { type Context, isCustodial, type SessionUser } from "../../context";
import { minterOf, planDelivery } from "../purchase/sale";

type ServiceCtx = Pick<Context, "db" | "chain" | "activity">;

/**
 * "Claim to wallet": delivering a collected pin's reward on Stellar.
 *
 * Collecting only records that the fan found the pin. Claiming sends one copy
 * of the reward (an item, or the artist's fan token) to the fan's wallet:
 * from the artist's storage stock first, minted by the artist's issuer when
 * the stock is gone. The fan is the source and pays only the network fee,
 * plus the trustline reserve if they don't hold the token yet. No platform fee.
 *
 *   quote   → what it costs and whether it will go through
 *   prepare → the transaction to sign (custodial accounts get the countdown)
 *   submit  → checks it is this claim, co-signs, submits, records it
 */

/** One copy per claim, as on the old Bandcoin. */
export const CLAIM_AMOUNT = "1";
/** Stellar's base reserve: what a new trustline locks in the fan's wallet. */
const TRUSTLINE_RESERVE_XLM = "0.5";

const claimInclude = {
  spot: {
    select: {
      pin: {
        select: {
          id: true,
          title: true,
          rewardsFanToken: true,
          rewardItem: { include: { classicToken: { include: { issuerAccount: { select: { publicKey: true } } } } } },
          artist: {
            select: {
              name: true,
              issuerAccount: { select: { publicKey: true, activatedAt: true } },
              storageAccount: { select: { publicKey: true } },
              fanTokenItem: { include: { classicToken: { include: { issuerAccount: { select: { publicKey: true } } } } } },
            },
          },
        },
      },
    },
  },
} as const;

/** The fan's own claim and the reward it carries (null for a pin with nothing to deliver). */
async function loadClaim(ctx: ServiceCtx, userId: string, claimId: string) {
  const claim = await ctx.db.pinClaim.findFirst({ where: { id: claimId, userId }, include: claimInclude });
  if (!claim) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "You haven't collected this pin." });
  const { pin } = claim.spot;
  const item = pin.rewardItem ?? (pin.rewardsFanToken ? pin.artist.fanTokenItem : null);
  const token = item?.chainType === "CLASSIC_TOKEN" ? item.classicToken : null;
  const reward =
    item && token
      ? {
          itemId: item.id,
          name: item.title,
          imageUrl: item.coverUrl,
          asset: new Asset(token.code, token.issuer),
          stockAccount: pin.artist.storageAccount?.publicKey ?? null,
          minter: token.isExternal ? null : minterOf(token, pin.artist.issuerAccount),
        }
      : null;
  return { claim, pin, item, reward };
}

type Loaded = Awaited<ReturnType<typeof loadClaim>>;
type Reward = NonNullable<Loaded["reward"]>;

/** The fan's claim on this spot (or any spot of the pin), for the card page. */
export async function claimOverview(ctx: ServiceCtx, userId: string, spotId: string) {
  const spot = await ctx.db.pinSpot.findUnique({ where: { id: spotId }, select: { pinId: true, pin: { select: { isMultiSpot: true } } } });
  if (!spot) return null;
  const row = await ctx.db.pinClaim.findFirst({
    where: spot.pin.isMultiSpot ? { userId, spotId } : { userId, spot: { pinId: spot.pinId } },
    select: { id: true },
  });
  if (!row) return null;
  const { claim, item, reward } = await loadClaim(ctx, userId, row.id);
  if (!reward) {
    // A contract-NFT reward can't be claimed here yet; say so rather than hide it.
    return { claimId: claim.id, state: item ? ("unsupported" as const) : ("none" as const), reward: null };
  }
  return {
    claimId: claim.id,
    state: claim.tokenClaimedAt ? ("delivered" as const) : ("available" as const),
    reward: { name: reward.name, code: reward.asset.getCode(), imageUrl: reward.imageUrl },
  };
}

export type ClaimLine = { key: string; label: string; hint?: string; amount: string; currency: "XLM"; inTotal: boolean };
export type ClaimProblem = { code: string; message: string };

async function stockBalance(ctx: ServiceCtx, reward: Reward) {
  if (!reward.stockAccount) return "0";
  const account = await ctx.chain.loadAccount(reward.stockAccount);
  const line = account?.balances.find(
    (balance) => "asset_code" in balance && balance.asset_code === reward.asset.getCode() && balance.asset_issuer === reward.asset.getIssuer(),
  );
  return line?.balance ?? "0";
}

/** Everything quote and prepare agree on: the delivery plan, the costs and what stands in the way. */
async function plan(ctx: ServiceCtx, user: SessionUser, loaded: Loaded) {
  const { claim, reward } = loaded;
  const problems: ClaimProblem[] = [];
  if (!reward) {
    return { reward: null, fan: null, delivery: null, openTrustline: false, lines: [] as ClaimLine[], total: "0", problems: [{ code: "NO_REWARD", message: "This pin has no reward to claim." }] };
  }
  if (claim.tokenClaimedAt) problems.push({ code: "ALREADY_CLAIMED", message: "This reward is already in your wallet." });

  const [fan, stock] = await Promise.all([ctx.chain.loadAccount(user.walletAddress), stockBalance(ctx, reward)]);
  if (!fan) problems.push({ code: "ACCOUNT_INACTIVE", message: "Your wallet isn't active on Stellar yet. Add a little XLM to activate it." });

  let delivery: ReturnType<typeof planDelivery> | null = null;
  try {
    delivery = planDelivery({ kind: "PRIMARY", quantity: Number(CLAIM_AMOUNT), stockAccount: reward.stockAccount, stockBalance: stock, minter: reward.minter });
  } catch {
    problems.push({ code: "NOT_STOCKED", message: `${loaded.pin.artist.name} hasn't stocked this reward yet, so it can't be sent. Your collect is safe; try again later.` });
  }

  const openTrustline = fan ? !trusts(fan, reward.asset) : true;
  const operations = Number(openTrustline) + Number(Boolean(delivery?.fromStock)) + Number(Boolean(delivery?.mint));
  const fee = networkFeeXlm(Math.max(1, operations), ctx.chain.config.network.baseFee);
  const lines: ClaimLine[] = [{ key: "network", label: "Network fee", hint: "Paid to Stellar", amount: fee, currency: "XLM", inTotal: true }];
  if (openTrustline) {
    lines.push({
      key: "reserve",
      label: "Trustline reserve",
      hint: `Lets your wallet hold ${reward.asset.getCode()}. Stays in your wallet.`,
      amount: TRUSTLINE_RESERVE_XLM,
      currency: "XLM",
      inTotal: true,
    });
  }
  const total = toAmount(lines.filter((line) => line.inTotal).reduce((sum, line) => sum + toStroops(line.amount), 0n));
  if (fan && toStroops(spendableXlm(fan)) < toStroops(total)) {
    problems.push({ code: "NOT_ENOUGH_XLM", message: `You need ${total} XLM free in your wallet to claim this.` });
  }
  return { reward, fan, delivery, openTrustline, lines, total, problems };
}

export async function quoteClaim(ctx: ServiceCtx, user: SessionUser, claimId: string) {
  const p = await plan(ctx, user, await loadClaim(ctx, user.id, claimId));
  return {
    ok: p.problems.length === 0,
    currency: "XLM" as const,
    lines: p.lines,
    total: p.total,
    source: p.delivery?.mint ? ("mint" as const) : p.delivery?.fromStock ? ("stock" as const) : null,
    problems: p.problems,
  };
}

export async function prepareClaim(ctx: ServiceCtx, user: SessionUser, claimId: string) {
  const loaded = await loadClaim(ctx, user.id, claimId);
  const p = await plan(ctx, user, loaded);
  const first = p.problems[0];
  if (first || !p.reward || !p.fan || !p.delivery) {
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, { message: first?.message ?? "This reward can't be claimed right now." });
  }
  const built = buildClassicPurchase({
    buyer: new Account(p.fan.accountId(), p.fan.sequenceNumber()),
    network: ctx.chain.config.network,
    orderId: loaded.claim.id,
    item: p.reward.asset,
    payment: null,
    delivery: p.delivery,
    openTrustline: p.openTrustline,
  });
  return { xdr: built.xdr, signer: isCustodial(user) ? ("custodial" as const) : ("wallet" as const) };
}

/**
 * The claim may only open a trustline to the reward and move copies of it to
 * the fan from the artist's stock or issuer, adding up to one copy. Returns
 * the platform keys that must co-sign (taken from the database, not the XDR).
 */
export function assertIsClaim(xdr: string, passphrase: string, expected: { fan: string; memo: string; reward: Reward }) {
  let tx: Transaction;
  try {
    tx = TransactionBuilder.fromXDR(xdr, passphrase) as Transaction;
  } catch {
    throw new AppError(ErrorCodes.STELLAR_TX_REJECTED, { message: "That isn't a valid transaction." });
  }
  const { fan, reward } = expected;
  const senders = new Set([reward.stockAccount, reward.minter].filter((key): key is string => Boolean(key)));
  let delivered = 0n;
  let ok = tx.source === fan && memoText(tx) === expected.memo && tx.operations.length > 0;
  for (const op of tx.operations) {
    const source = op.source ?? tx.source;
    if (op.type === "changeTrust" && source === fan && "code" in op.line && reward.asset.equals(op.line as Asset)) continue;
    if (op.type === "payment" && op.destination === fan && op.asset.equals(reward.asset) && senders.has(source)) {
      delivered += toStroops(op.amount);
      continue;
    }
    ok = false;
  }
  if (!ok || delivered !== toStroops(CLAIM_AMOUNT)) {
    throw new AppError(ErrorCodes.STELLAR_TX_REJECTED, { message: "That transaction isn't this reward claim." });
  }
  return [...new Set(tx.operations.map((op) => op.source).filter((key): key is string => Boolean(key) && key !== fan))];
}

export async function submitClaim(ctx: ServiceCtx, user: SessionUser, claimId: string, xdr: string) {
  const { claim, reward } = await loadClaim(ctx, user.id, claimId);
  if (!reward) throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, { message: "This pin has no reward to claim." });
  ctx.activity.set({ targetType: "PinClaim", targetId: claim.id });
  const serverSigners = assertIsClaim(xdr, ctx.chain.config.network.passphrase, { fan: user.walletAddress, memo: claim.id, reward });

  let signed = xdr;
  if (isCustodial(user)) {
    if (!user.email) throw new AppError(ErrorCodes.WALLET_NOT_CONNECTED);
    signed = await ctx.chain.signForCustodialUser(signed, user.email);
  }
  signed = await ctx.chain.signWithServerKeys(signed, serverSigners);

  // Taken before submitting, so two submits can't both deliver a copy.
  const taken = await ctx.db.pinClaim.updateMany({ where: { id: claim.id, tokenClaimedAt: null }, data: { tokenClaimedAt: new Date() } });
  if (taken.count === 0) throw new AppError(ErrorCodes.RESOURCE_CONFLICT, { message: "This reward is already in your wallet." });

  let hash: string;
  try {
    ({ hash } = await ctx.chain.submit(signed));
  } catch (error) {
    await ctx.db.pinClaim.update({ where: { id: claim.id }, data: { tokenClaimedAt: null } });
    throw error;
  }
  ctx.activity.set({ txHash: hash, amount: CLAIM_AMOUNT });
  await ctx.db.ownership.upsert({
    where: { userId_itemId: { userId: user.id, itemId: reward.itemId } },
    create: { userId: user.id, itemId: reward.itemId, quantity: CLAIM_AMOUNT, source: "PIN_CLAIM" },
    update: { quantity: { increment: CLAIM_AMOUNT } },
  });
  return { txHash: hash };
}
