import { Account, Keypair } from "@stellar/stellar-sdk";

import {
  type AssetRef,
  buildStorageSetup,
  networkFeeXlm,
  storageStartingXlm,
  toStroops,
} from "@bandcoin/chain";
import { encryptSecret, fundsOf } from "@bandcoin/chain/server";
import { AppError, ErrorCodes, isAppError } from "@bandcoin/errors";

import type { Context } from "../../context";

/**
 * An artist's storage account: where their fan tokens and copies wait. Sales,
 * pin claims and gifts take from it before minting more, and it can fund
 * bounties. As on the old Bandcoin, the platform opens it when an admin
 * approves the artist, and pays for it: the mother account creates it, it
 * trusts BANDCOIN, USDC and the fan token, and the artist's issuer pays the
 * starting supply of fan tokens (Admin › Settings) into it, all in one
 * transaction. Artists approved before this open it from Settings, on the
 * platform too. The key is made here and kept encrypted.
 *
 * Opening twice never pays twice: an account already on the network is only
 * linked, and a second createAccount for the same key fails on the network.
 */
type ServiceCtx = Pick<Context, "db" | "chain" | "activity">;
export type StorageArtist = {
  id: string;
  userId: string;
  status: string;
  storageAccountId: string | null;
  fanTokenItemId: string | null;
  issuerAccountId: string | null;
};

/** What storage trusts from the start: the payment assets and the artist's fan token. */
async function assetsToTrust(ctx: ServiceCtx, artist: StorageArtist) {
  const { bandcoin, usdc } = ctx.chain.config.assets;
  const fanToken = artist.fanTokenItemId
    ? await ctx.db.classicToken.findUnique({
        where: { itemId: artist.fanTokenItemId },
        select: { code: true, issuer: true },
      })
    : null;
  const trust: AssetRef[] = fanToken ? [bandcoin, usdc, fanToken] : [bandcoin, usdc];
  return { trust, fanToken };
}

/** What opening costs the platform: the XLM storage starts with, plus the network fee. */
export function storageCost(trustlines: number, baseFee: string) {
  // createAccount, one changeTrust per asset, and the supply payment
  return {
    startingXlm: storageStartingXlm(trustlines),
    networkFeeXlm: networkFeeXlm(trustlines + 2, baseFee),
  };
}

export async function openStorage(ctx: ServiceCtx, artist: StorageArtist) {
  const { db, chain } = ctx;
  if (artist.storageAccountId)
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
      message: "The storage account is already open.",
    });
  if (artist.status !== "APPROVED")
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
      message: "Storage opens once the artist page is approved.",
    });

  const storage =
    (await db.chainAccount.findFirst({
      where: { ownerId: artist.userId, kind: "STORAGE" },
      orderBy: { createdAt: "asc" },
    })) ??
    (await db.chainAccount.create({
      data: (() => {
        const keys = Keypair.random();
        return {
          kind: "STORAGE" as const,
          publicKey: keys.publicKey(),
          secretEncrypted: encryptSecret(keys.secret()),
          ownerId: artist.userId,
        };
      })(),
    }));
  ctx.activity.set({ targetType: "ChainAccount", targetId: storage.id });

  // Opened by an earlier try whose answer was lost: just link it.
  if (storage.activatedAt || (await chain.loadAccount(storage.publicKey))) {
    await link(ctx, artist, storage.id);
    return { publicKey: storage.publicKey, supply: null };
  }

  const { trust, fanToken } = await assetsToTrust(ctx, artist);
  const issuer = artist.issuerAccountId
    ? await db.chainAccount.findUnique({
        where: { id: artist.issuerAccountId },
        select: { publicKey: true, activatedAt: true },
      })
    : null;
  const settings = await db.appSetting.findUnique({
    where: { id: 1 },
    select: { fanTokenStartSupply: true },
  });
  const amount = settings?.fanTokenStartSupply.toString() ?? "1000000";
  // Only a token the artist's own issuer makes can be issued; one from elsewhere is just trusted.
  const supply =
    fanToken &&
    issuer?.activatedAt &&
    fanToken.issuer === issuer.publicKey &&
    toStroops(amount) > 0n
      ? { asset: fanToken, amount }
      : undefined;

  const { mother, network } = chain.config;
  const payer = mother ? await chain.loadAccount(mother) : null;
  if (!mother || !payer)
    throw new AppError(ErrorCodes.CONFIG_MISSING, {
      message: "The platform account isn't set up to open storage.",
    });
  const cost = storageCost(trust.length, network.baseFee);
  const need = toStroops(cost.startingXlm) + toStroops(cost.networkFeeXlm);
  if (toStroops(fundsOf(payer, chain.config.assets).XLM) < need)
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
      message: "The platform account is short of XLM to open storage. Top it up and try again.",
    });

  const built = buildStorageSetup({
    payer: new Account(payer.accountId(), payer.sequenceNumber()),
    network,
    storage: storage.publicKey,
    startingXlm: cost.startingXlm,
    trust,
    supply,
  });
  const signed = await chain.signWithServerKeys(built.xdr, [mother, ...built.serverSigners]);
  try {
    const { hash } = await chain.submit(signed);
    ctx.activity.set({ txHash: hash, amount: cost.startingXlm, currency: "XLM" });
  } catch (error) {
    // A lost answer may still have landed: the next try finds the account and links it.
    if (isAppError(error)) throw error;
    throw new AppError(ErrorCodes.STELLAR_TX_SUBMIT_FAILED);
  }
  await link(ctx, artist, storage.id);
  return { publicKey: storage.publicKey, supply: supply ? supply.amount : null };
}

async function link(ctx: ServiceCtx, artist: StorageArtist, storageId: string) {
  await ctx.db.$transaction(async (tx) => {
    await tx.chainAccount.update({ where: { id: storageId }, data: { activatedAt: new Date() } });
    await tx.artist.update({ where: { id: artist.id }, data: { storageAccountId: storageId } });
  });
}
