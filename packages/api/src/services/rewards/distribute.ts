import { Account, Asset } from "@stellar/stellar-sdk";

import { buildRewardBatch, MAX_OPERATIONS_PER_TX, type RewardLine } from "@actiontokens/chain";
import { AppError, ErrorCodes } from "@actiontokens/errors";

import type { Context } from "../../context";
import { fromStroops, originShares, quarterShares, type Share, toStroops } from "./shares";

type ServiceCtx = Pick<Context, "db" | "chain">;

export type RoundKind = "origin" | "quarter";

/** How long a batch can still land after it was sent. Past this, a batch never found never will be. */
export const BATCH_TIMEOUT_SECONDS = 5 * 60;

type Round = {
  id: string;
  data: unknown;
  isDistributed: boolean;
  completedUsers: string[];
  pendingTx: string | null;
  pendingUsers: string[];
  pendingUntil: Date | null;
  totalBalance?: { toString(): string };
};

const fail = (message: string) => new AppError(ErrorCodes.PRECONDITION_NOT_MET, { message });

async function loadRound(ctx: ServiceCtx, kind: RoundKind, id: string): Promise<Round> {
  const found =
    kind === "origin"
      ? await ctx.db.originReward.findUnique({ where: { id } })
      : await ctx.db.quarterReward.findUnique({ where: { id } });
  if (!found)
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, {
      message: "This reward round doesn't exist.",
    });
  return found as Round;
}

/** What each wallet is owed for a round, blocked wallets left out. */
export async function sharesFor(ctx: ServiceCtx, kind: RoundKind, round: Round): Promise<Share[]> {
  const rows =
    kind === "origin"
      ? await ctx.db.originBlockedUser.findMany({ select: { walletAddress: true } })
      : await ctx.db.quarterBlockedUser.findMany({ select: { walletAddress: true } });
  const blocked = new Set(rows.map((row) => row.walletAddress));
  const data = Array.isArray(round.data) ? round.data : [];
  return kind === "origin"
    ? originShares(
        data as Parameters<typeof originShares>[0],
        blocked,
        toStroops(round.totalBalance?.toString() ?? "0"),
      )
    : quarterShares(data as Parameters<typeof quarterShares>[0], blocked);
}

const hasTrustline = (
  account: {
    balances: { asset_type: string; asset_code?: string; asset_issuer?: string }[];
  } | null,
  asset: Asset,
) =>
  Boolean(
    account?.balances.some(
      (b) => b.asset_code === asset.getCode() && b.asset_issuer === asset.getIssuer(),
    ),
  );

/**
 * What became of a batch sent earlier whose answer was lost. Landed: those wallets are paid.
 * Not found yet but could still land: wait (the job retries later). Not found and expired: it
 * never will, so those wallets are unpaid again. This is what stops a crash from paying twice.
 */
async function settlePending(ctx: ServiceCtx, kind: RoundKind, round: Round): Promise<Round> {
  if (!round.pendingTx) return round;
  const found = await ctx.chain.findTransaction(round.pendingTx);
  const completedUsers = found?.successful
    ? [...new Set([...round.completedUsers, ...round.pendingUsers])]
    : round.completedUsers;
  if (!found && round.pendingUntil && round.pendingUntil.getTime() > Date.now())
    throw fail("An earlier batch may still land; checking again shortly.");
  const clear = { completedUsers, pendingTx: null, pendingUsers: [], pendingUntil: null };
  if (kind === "origin") await ctx.db.originReward.update({ where: { id: round.id }, data: clear });
  else await ctx.db.quarterReward.update({ where: { id: round.id }, data: clear });
  return { ...round, ...clear };
}

/**
 * Pays a round, 100 wallets to a transaction, from the platform's mother account. Safe to run
 * again after any failure: wallets already paid are skipped, and a batch of unknown outcome is
 * looked up before anything is resent.
 */
export async function distributeRound(ctx: ServiceCtx, kind: RoundKind, id: string) {
  let round = await loadRound(ctx, kind, id);
  if (round.isDistributed) return { paid: 0, alreadyDone: true };
  const payerKey = ctx.chain.config.mother;
  if (!payerKey) throw fail("The platform's payout account isn't set up (MOTHER_SECRET).");
  const { code, issuer } = ctx.chain.config.assets.bandcoin;
  const asset = new Asset(code, issuer);

  round = await settlePending(ctx, kind, round);
  const owed = (await sharesFor(ctx, kind, round)).filter((share) => share.stroops > 0n);
  const done = new Set(round.completedUsers);
  let todo = owed.filter((share) => !done.has(share.pubkey));

  const save = (data: object) =>
    kind === "origin"
      ? ctx.db.originReward.update({ where: { id }, data: { ...data, lastUpdatedAt: new Date() } })
      : ctx.db.quarterReward.update({
          where: { id },
          data: { ...data, lastUpdatedAt: new Date() },
        });

  let paid = 0;
  while (todo.length > 0) {
    const batch = todo.slice(0, MAX_OPERATIONS_PER_TX);
    const payer = await ctx.chain.loadAccount(payerKey);
    if (!payer) throw fail("The payout account doesn't exist on the network.");
    const lines: RewardLine[] = [];
    for (const share of batch)
      lines.push({
        to: share.pubkey,
        amount: fromStroops(share.stroops),
        claimable: !hasTrustline(await ctx.chain.loadAccount(share.pubkey), asset),
      });
    const built = buildRewardBatch({
      payer: new Account(payer.accountId(), payer.sequenceNumber()),
      network: ctx.chain.config.network,
      asset,
      lines,
      memo: id,
      timeoutSeconds: BATCH_TIMEOUT_SECONDS,
    });
    const signed = await ctx.chain.signWithServerKeys(built.xdr, [payerKey]);
    // Written before sending: if we die between send and save, the next run finds this batch.
    await save({
      pendingTx: built.hash,
      pendingUsers: batch.map((share) => share.pubkey),
      pendingUntil: new Date(Date.now() + (BATCH_TIMEOUT_SECONDS + 30) * 1000),
    });
    try {
      await ctx.chain.submit(signed);
    } catch (error) {
      await save({
        lastError: { at: new Date().toISOString(), batch: batch.length, message: String(error) },
      });
      throw error;
    }
    batch.forEach((share) => done.add(share.pubkey));
    paid += batch.length;
    await save({
      completedUsers: [...done],
      pendingTx: null,
      pendingUsers: [],
      pendingUntil: null,
      lastError: null as never,
    });
    todo = todo.slice(batch.length);
  }

  const distributed = owed.reduce((sum, share) => sum + share.stroops, 0n);
  await save({
    isDistributed: true,
    rewardedAt: new Date(),
    distributedAmount: fromStroops(distributed),
  });
  return { paid, alreadyDone: false };
}
