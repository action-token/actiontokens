import { Account } from "@stellar/stellar-sdk";

import {
  buildNftKeepUnlockedAlive,
  buildNftUnlockItemFor,
  NFT_MAX_UNLOCKED_PER_CALL,
} from "@actiontokens/chain";

import type { Prisma } from "@actiontokens/db";

import type { Context } from "../../context";

/**
 * Records unlocks on the NFT contract, as on the old Bandcoin: when an owner
 * has visited every place of a locked piece, the platform's treasury (the
 * contract's unlock authority) calls `unlock_item_for(token, piece)`, signing
 * and paying; the fan signs nothing. The app shows the content as soon as the
 * places are visited; the on-chain record follows. A failed call is logged
 * and the worker tries again (this isn't a payment).
 *
 * The worker also keeps those records from being archived
 * (`keep_unlocked_alive`), as the old keep-alive job did.
 */
type ChainCtx = Pick<Context, "db" | "chain">;

/** Unlock pins whose places are all visited but not yet recorded on the contract. */
const readyWhere = {
  unlockLockedContentId: { not: null },
  onChainUnlockedAt: null,
  spots: {
    some: { isHidden: false },
    every: { OR: [{ isHidden: true }, { claims: { some: {} } }] },
  },
} satisfies Prisma.PinWhereInput;

const UNLOCKS_PER_RUN = 20;

/** Records one unlock pin on the contract if every place is visited. Returns the hash, or null. */
export async function unlockOnChain(ctx: ChainCtx, pinId: string) {
  const { db, chain } = ctx;
  const pin = await db.pin.findFirst({
    where: { id: pinId, ...readyWhere },
    select: {
      id: true,
      unlockEdition: { select: { tokenId: true } },
      unlockLockedContent: { select: { chainIndex: true } },
    },
  });
  if (!pin?.unlockEdition || !pin.unlockLockedContent) return null;
  const contract = chain.config.nftContract;
  const treasury = await chain.loadAccount(chain.config.treasury);
  if (!contract || !treasury) return null;

  const built = buildNftUnlockItemFor({
    source: new Account(treasury.accountId(), treasury.sequenceNumber()),
    network: chain.config.network,
    contract,
    caller: chain.config.treasury,
    tokenId: Number(pin.unlockEdition.tokenId),
    mediaIndex: pin.unlockLockedContent.chainIndex,
  });
  const prepared = await chain.prepareContractCall(built.xdr, built.serverSigners);
  const { hash } = await chain.submit(
    await chain.signWithServerKeys(prepared, [chain.config.treasury]),
  );
  await db.pin.update({
    where: { id: pin.id },
    data: { onChainUnlockedAt: new Date(), onChainUnlockTxHash: hash },
  });
  return hash;
}

/** After a collect: records the unlock if that was the last place. Never fails the collect. */
export async function unlockAfterCollect(
  ctx: ChainCtx,
  pin: { id: string; unlockLockedContentId: string | null },
) {
  if (!pin.unlockLockedContentId) return;
  try {
    await unlockOnChain(ctx, pin.id);
  } catch (error) {
    console.error("[nft] on-chain unlock failed; the worker will try again", {
      pinId: pin.id,
      error,
    });
  }
}

/** The worker: records every unlock still waiting, a batch per run. One failure doesn't stop the rest. */
export async function syncUnlocks(ctx: ChainCtx) {
  const pins = await ctx.db.pin.findMany({
    where: readyWhere,
    orderBy: { updatedAt: "asc" },
    take: UNLOCKS_PER_RUN,
    select: { id: true },
  });
  let recorded = 0;
  let failed = 0;
  for (const pin of pins) {
    try {
      if (await unlockOnChain(ctx, pin.id)) recorded += 1;
    } catch (error) {
      failed += 1;
      console.error("[nft] on-chain unlock failed", { pinId: pin.id, error });
    }
  }
  return { looked: pins.length, recorded, failed };
}

/** The worker: keeps every recorded unlock from being archived, 80 per call. */
export async function keepUnlocksAlive(ctx: ChainCtx) {
  const { db, chain } = ctx;
  const contract = chain.config.nftContract;
  if (!contract) return { kept: 0 };
  const rows = await db.pin.findMany({
    where: { unlockLockedContentId: { not: null }, onChainUnlockedAt: { not: null } },
    select: {
      unlockEdition: { select: { tokenId: true } },
      unlockLockedContent: { select: { chainIndex: true } },
    },
  });
  const unlocked = rows.flatMap((row) =>
    row.unlockEdition && row.unlockLockedContent
      ? [
          {
            tokenId: Number(row.unlockEdition.tokenId),
            mediaIndex: row.unlockLockedContent.chainIndex,
          },
        ]
      : [],
  );
  let kept = 0;
  for (let start = 0; start < unlocked.length; start += NFT_MAX_UNLOCKED_PER_CALL) {
    const treasury = await chain.loadAccount(chain.config.treasury);
    if (!treasury) break;
    const batch = unlocked.slice(start, start + NFT_MAX_UNLOCKED_PER_CALL);
    const built = buildNftKeepUnlockedAlive({
      source: new Account(treasury.accountId(), treasury.sequenceNumber()),
      network: chain.config.network,
      contract,
      unlocked: batch,
    });
    const prepared = await chain.prepareContractCall(built.xdr);
    await chain.submit(await chain.signWithServerKeys(prepared, [chain.config.treasury]));
    kept += batch.length;
  }
  return { kept };
}
