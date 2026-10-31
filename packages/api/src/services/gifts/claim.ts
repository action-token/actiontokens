import { Account, Asset, type Transaction, TransactionBuilder } from "@stellar/stellar-sdk";

import { buildClaimGift, networkFeeXlm, toAmount, toDisplay, toStroops } from "@bandcoin/chain";
import { TRUSTLINE_RESERVE_XLM } from "@bandcoin/chain/quote";
import { fundsOf } from "@bandcoin/chain/server";
import { AppError, ErrorCodes } from "@bandcoin/errors";

import { type Context, isCustodial, type SessionUser } from "../../context";

/**
 * A fan accepts a gift an artist sent from storage as a claimable balance
 * (they didn't hold the token yet): the fan's own transaction opens the
 * trustline (0.5 XLM of their reserve) and claims it, as on the old Bandcoin.
 * The fan pays that reserve and the network fee, shown before they confirm.
 *
 *   list    → what's waiting, with who sent it and what claiming costs
 *   prepare → the transaction to sign (custodial accounts get the countdown)
 *   submit  → checks it's exactly that claim, signs for custodial, sends it,
 *             and records the fan's new tokens
 */
type ServiceCtx = Pick<Context, "db" | "chain" | "activity">;

const holds = (
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
function costOf(ctx: ServiceCtx, openTrustline: boolean) {
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

/** Gifts waiting for the fan: tokens Bandcoin knows (an artist's fan token or item), newest first. */
export async function listGifts(ctx: ServiceCtx, user: Pick<SessionUser, "walletAddress">) {
  if (!user.walletAddress) return [];
  const [waiting, account] = await Promise.all([
    ctx.chain.claimableFor(user.walletAddress),
    ctx.chain.loadAccount(user.walletAddress),
  ]);
  if (waiting.length === 0) return [];
  const tokens = await ctx.db.classicToken.findMany({
    where: { OR: waiting.map((gift) => ({ code: gift.code, issuer: gift.issuer })) },
    select: {
      code: true,
      issuer: true,
      item: { select: { id: true, title: true, artist: { select: { name: true, slug: true } } } },
    },
  });
  return waiting.flatMap((gift) => {
    const token = tokens.find((row) => row.code === gift.code && row.issuer === gift.issuer);
    if (!token?.item) return [];
    const openTrustline = !holds(account, gift.code, gift.issuer);
    return [
      {
        balanceId: gift.id,
        code: gift.code,
        amount: gift.amount,
        title: token.item.title,
        artist: token.item.artist,
        cost: costOf(ctx, openTrustline),
      },
    ];
  });
}

/** The waiting gift, checked against the network: never trusted from the request. */
async function waitingGift(ctx: ServiceCtx, user: SessionUser, balanceId: string) {
  const gift = (await ctx.chain.claimableFor(user.walletAddress)).find(
    (entry) => entry.id === balanceId,
  );
  if (!gift)
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, {
      message: "This gift isn't waiting for you any more.",
    });
  return gift;
}

export async function prepareGiftClaim(ctx: ServiceCtx, user: SessionUser, balanceId: string) {
  const gift = await waitingGift(ctx, user, balanceId);
  const account = await ctx.chain.loadAccount(user.walletAddress);
  if (!account)
    throw new AppError(ErrorCodes.WALLET_NEEDS_SETUP, {
      message: "Your wallet needs a little XLM before it can claim.",
    });
  const openTrustline = !holds(account, gift.code, gift.issuer);
  const cost = costOf(ctx, openTrustline);
  const have = toStroops(fundsOf(account, ctx.chain.config.assets).XLM);
  if (have < toStroops(cost.total))
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
      message: `You need ${toDisplay(toStroops(cost.total) - have)} more XLM to claim this.`,
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

export async function submitGiftClaim(
  ctx: ServiceCtx,
  user: SessionUser,
  input: { balanceId: string; xdr: string },
) {
  const gift = await waitingGift(ctx, user, input.balanceId);
  const { passphrase } = ctx.chain.config.network;
  assertIsClaim(input.xdr, passphrase, user.walletAddress, gift);
  let xdr = input.xdr;
  if (isCustodial(user)) {
    if (!user.email) throw new AppError(ErrorCodes.WALLET_NOT_CONNECTED);
    xdr = await ctx.chain.signForCustodialUser(xdr, user.email);
  }
  const { hash } = await ctx.chain.submit(xdr);

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
  return { txHash: hash, code: gift.code, amount: gift.amount };
}
