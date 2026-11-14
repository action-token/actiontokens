import { Account, Asset, type Transaction, TransactionBuilder } from "@stellar/stellar-sdk";

import { buildClaimGift, networkFeeXlm, toAmount, toDisplay, toStroops } from "@bandcoin/chain";
import { TRUSTLINE_RESERVE_XLM } from "@bandcoin/chain/quote";
import { type ClaimableToken, fundsOf } from "@bandcoin/chain/server";
import { AppError, ErrorCodes } from "@bandcoin/errors";

import { type Context, isCustodial, type SessionUser } from "../../context";
import { declinedBy, forgetDeclined } from "./decline";

/**
 * A fan accepts a gift waiting as a claimable balance (they didn't hold the
 * token yet): an artist's gift from storage, or a token someone sent them: the fan's own transaction opens the
 * trustline (0.5 XLM of their reserve) and claims it, as on the old Bandcoin.
 * The fan pays that reserve and the network fee, shown before they confirm.
 *
 *   list    → what's waiting, with who sent it and what claiming costs
 *   prepare → the transaction to sign (custodial accounts get the countdown)
 *   submit  → checks it's exactly that claim, signs for custodial, sends it,
 *             and records the fan's new tokens
 */
export type ServiceCtx = Pick<Context, "db" | "chain" | "activity">;

export const holds = (
  account: Awaited<ReturnType<ServiceCtx["chain"]["loadAccount"]>>,
  code: string,
  issuer: string,
) =>
  Boolean(
    account?.balances.some(
      (line) => "asset_code" in line && line.asset_code === code && line.asset_issuer === issuer,
    ),
  );

/** The cost of claiming: the network fee, plus the trustline reserve when the fan doesn't hold the token yet. */
export function costOf(ctx: ServiceCtx, openTrustline: boolean) {
  const fee = toStroops(networkFeeXlm(openTrustline ? 2 : 1, ctx.chain.config.network.baseFee));
  const reserve = openTrustline ? toStroops(TRUSTLINE_RESERVE_XLM) : 0n;
  return {
    total: toAmount(fee + reserve),
    lines: [
      ...(openTrustline
        ? [
            {
              key: "reserve",
              label: "Lets your wallet hold it",
              currency: "XLM" as const,
              amount: toDisplay(reserve),
            },
          ]
        : []),
      { key: "networkFee", label: "Network fee", currency: "XLM" as const, amount: toDisplay(fee) },
      {
        key: "total",
        label: "You pay",
        currency: "XLM" as const,
        amount: toDisplay(fee + reserve),
      },
    ],
  };
}

/**
 * Every balance the wallet can claim is either for them (someone else made it)
 * or one they sent that nobody accepted yet (see ./take-back).
 */
export const sentBy = (gift: Pick<ClaimableToken, "sponsor">, address: string) =>
  gift.sponsor === address;

/** Gifts waiting for the fan: tokens Bandcoin knows (an artist's fan token or item), newest first. */
export async function listGifts(ctx: ServiceCtx, user: Pick<SessionUser, "id" | "walletAddress">) {
  if (!user.walletAddress) return [];
  const [claimable, account] = await Promise.all([
    ctx.chain.claimableFor(user.walletAddress),
    ctx.chain.loadAccount(user.walletAddress),
  ]);
  const waiting = claimable.filter((gift) => !sentBy(gift, user.walletAddress));
  if (waiting.length === 0) return [];
  const [tokens, senders, declined] = await Promise.all([
    ctx.db.classicToken.findMany({
      where: { OR: waiting.map((gift) => ({ code: gift.code, issuer: gift.issuer })) },
      select: {
        code: true,
        issuer: true,
        item: { select: { id: true, title: true, artist: { select: { name: true, slug: true } } } },
      },
    }),
    ctx.db.user.findMany({
      where: { walletAddress: { in: [...new Set(waiting.map((gift) => gift.sponsor))] } },
      select: { walletAddress: true, username: true, displayName: true },
    }),
    declinedBy(
      ctx,
      user.id,
      waiting.map((gift) => gift.id),
    ),
  ]);
  return waiting.map((gift) => {
    const token = tokens.find((row) => row.code === gift.code && row.issuer === gift.issuer);
    const sender = senders.find((row) => row.walletAddress === gift.sponsor);
    return {
      balanceId: gift.id,
      code: gift.code,
      amount: gift.amount,
      title: token?.item?.title ?? gift.code,
      /** The artist whose item this is; null for any other token */
      artist: token?.item?.artist ?? null,
      /** Who sent it (the account that made the balance), named when they're on Bandcoin */
      from: {
        address: gift.sponsor,
        username: sender?.username ?? null,
        name: sender?.displayName ?? null,
      },
      cost: costOf(ctx, !holds(account, gift.code, gift.issuer)),
      /** The fan said no to it (see ./decline); they can still accept it or put it back */
      declined: declined.has(gift.id),
    };
  });
}

/** The waiting gift, checked against the network: never trusted from the request. */
async function waitingGift(ctx: ServiceCtx, user: SessionUser, balanceId: string) {
  const gift = (await ctx.chain.claimableFor(user.walletAddress)).find(
    (entry) => entry.id === balanceId && !sentBy(entry, user.walletAddress),
  );
  if (!gift)
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, {
      message: "This gift isn't waiting for you any more.",
    });
  return gift;
}

export async function prepareGiftClaim(ctx: ServiceCtx, user: SessionUser, balanceId: string) {
  return prepareClaim(ctx, user, await waitingGift(ctx, user, balanceId), "claim this");
}

/** The transaction that claims a balance into the user's wallet (a gift, or their own send coming back). */
export async function prepareClaim(
  ctx: ServiceCtx,
  user: SessionUser,
  gift: ClaimableToken,
  purpose: string,
) {
  const account = await ctx.chain.loadAccount(user.walletAddress);
  if (!account)
    throw new AppError(ErrorCodes.WALLET_NEEDS_SETUP, {
      message: `Your wallet needs a little XLM before it can ${purpose}.`,
    });
  const openTrustline = !holds(account, gift.code, gift.issuer);
  const cost = costOf(ctx, openTrustline);
  const have = toStroops(fundsOf(account, ctx.chain.config.assets).XLM);
  if (have < toStroops(cost.total))
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
      message: `You need ${toDisplay(toStroops(cost.total) - have)} more XLM to ${purpose}.`,
    });

  const built = buildClaimGift({
    receiver: new Account(account.accountId(), account.sequenceNumber()),
    network: ctx.chain.config.network,
    balanceId: gift.id,
    asset: new Asset(gift.code, gift.issuer),
    openTrustline,
  });
  return {
    xdr: built.xdr,
    cost,
    signer: isCustodial(user) ? ("custodial" as const) : ("wallet" as const),
  };
}

/** The claim may hold only: optionally the trustline for this token, then claiming this balance, from the fan. */
function assertIsClaim(
  xdr: string,
  passphrase: string,
  source: string,
  gift: { id: string; code: string; issuer: string },
) {
  let tx: Transaction;
  try {
    tx = TransactionBuilder.fromXDR(xdr, passphrase) as Transaction;
  } catch {
    throw new AppError(ErrorCodes.STELLAR_TX_REJECTED, {
      message: "That isn't a valid transaction.",
    });
  }
  const ops = tx.operations;
  const claim = ops.at(-1);
  const trust = ops.length === 2 ? (ops[0] ?? null) : null;
  const asset = new Asset(gift.code, gift.issuer);
  const ok =
    tx.source === source &&
    ops.length >= 1 &&
    ops.length <= 2 &&
    ops.every((op) => !op.source || op.source === source) &&
    claim?.type === "claimClaimableBalance" &&
    claim.balanceId === gift.id &&
    (trust === null ||
      (trust.type === "changeTrust" && "code" in trust.line && trust.line.equals(asset)));
  if (!ok)
    throw new AppError(ErrorCodes.STELLAR_TX_REJECTED, {
      message: "That transaction isn't the one we prepared.",
    });
}

/** Checks the transaction is exactly the prepared claim, signs for custodial accounts and sends it. */
export async function sendClaim(
  ctx: ServiceCtx,
  user: SessionUser,
  gift: Pick<ClaimableToken, "id" | "code" | "issuer">,
  signedXdr: string,
) {
  assertIsClaim(signedXdr, ctx.chain.config.network.passphrase, user.walletAddress, gift);
  let xdr = signedXdr;
  if (isCustodial(user)) {
    if (!user.email) throw new AppError(ErrorCodes.WALLET_NOT_CONNECTED);
    xdr = await ctx.chain.signForCustodialUser(xdr, user.email);
  }
  return (await ctx.chain.submit(xdr)).hash;
}

export async function submitGiftClaim(
  ctx: ServiceCtx,
  user: SessionUser,
  input: { balanceId: string; xdr: string },
) {
  const gift = await waitingGift(ctx, user, input.balanceId);
  const hash = await sendClaim(ctx, user, gift, input.xdr);

  const token = await ctx.db.classicToken.findUnique({
    where: { code_issuer: { code: gift.code, issuer: gift.issuer } },
    select: { itemId: true },
  });
  ctx.activity.set({
    targetType: token ? "Item" : "ClaimableBalance",
    targetId: token?.itemId ?? gift.id,
    txHash: hash,
  });
  if (token?.itemId)
    await ctx.db.ownership.upsert({
      where: { userId_itemId: { userId: user.id, itemId: token.itemId } },
      create: {
        userId: user.id,
        itemId: token.itemId,
        quantity: Math.floor(Number(gift.amount)),
        source: "GIFT",
      },
      update: { quantity: { increment: Math.floor(Number(gift.amount)) } },
    });
  await forgetDeclined(ctx, gift.id);
  return { txHash: hash, code: gift.code, amount: gift.amount };
}
