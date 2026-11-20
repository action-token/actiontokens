import { Account } from "@stellar/stellar-sdk";

import { buildIssuerRefund } from "@actiontokens/chain";
import { type ArtistStatus, Prisma } from "@actiontokens/db";
import { AppError, ErrorCodes, isAppError } from "@actiontokens/errors";

import type { Context } from "../../context";
import { createFanToken } from "../artist/fan-token";
import type { PendingFanToken } from "../artist/onboarding";
import { openStorage } from "../artist/storage-account";

/**
 * What an admin does with artists: review an application (approve or reject),
 * ban, or unban. Every call is a mutation, so it lands in the activity log with the
 * admin as the actor; `ctx.activity.set` names the artist it was about.
 *
 * Rejecting gives the artist their XLM back (the issuer account closes into
 * their wallet). Banning an approved artist does not: they already used it.
 */
type ServiceCtx = Pick<Context, "db" | "chain" | "activity">;

const ORDER: Record<ArtistStatus, number> = { PENDING: 0, APPROVED: 1, REJECTED: 2, BANNED: 3 };

export async function listApplications(ctx: Pick<Context, "db">, input: { status?: ArtistStatus }) {
  const rows = await ctx.db.artist.findMany({
    where: input.status ? { status: input.status } : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      name: true,
      slug: true,
      bio: true,
      avatarUrl: true,
      status: true,
      rejectionReason: true,
      createdAt: true,
      issuerAccount: { select: { publicKey: true } },
      fanTokenItem: { select: { classicToken: { select: { code: true } } } },
      _count: { select: { pins: true, followers: true } },
      user: { select: { id: true, username: true, displayName: true, walletAddress: true } },
    },
  });
  // Waiting applications first; within a status the newest stays on top (the query order).
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => ORDER[a.row.status] - ORDER[b.row.status] || a.index - b.index)
    .map(({ row }) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      bio: row.bio,
      avatarUrl: row.avatarUrl,
      status: row.status,
      rejectionReason: row.rejectionReason,
      createdAt: row.createdAt,
      /** The issuer account is open: they paid the 1.5 XLM */
      paid: row.issuerAccount !== null,
      issuer: row.issuerAccount?.publicKey ?? null,
      fanToken: row.fanTokenItem?.classicToken?.code ?? null,
      pins: row._count.pins,
      followers: row._count.followers,
      owner: {
        id: row.user.id,
        name: row.user.displayName ?? row.user.username,
        username: row.user.username,
        walletAddress: row.user.walletAddress,
      },
    }));
}

async function loadArtist(ctx: Pick<ServiceCtx, "db">, artistId: string) {
  const artist = await ctx.db.artist.findUnique({
    where: { id: artistId },
    select: {
      id: true,
      userId: true,
      name: true,
      slug: true,
      status: true,
      issuerAccountId: true,
      fanTokenItemId: true,
      pendingFanToken: true,
      issuerAccount: { select: { id: true, publicKey: true } },
      user: { select: { id: true, role: true, walletAddress: true } },
    },
  });
  if (!artist) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Artist not found" });
  return artist;
}

function mustBeWaiting(status: ArtistStatus) {
  if (status !== "PENDING")
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
      message: "This application isn't waiting for review.",
    });
}

export async function approveArtist(ctx: ServiceCtx, artistId: string) {
  const artist = await loadArtist(ctx, artistId);
  ctx.activity.set({ targetType: "Artist", targetId: artist.id });
  mustBeWaiting(artist.status);
  if (!artist.issuerAccountId) {
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
      message: "They haven't opened their artist account yet.",
    });
  }
  await ctx.db.$transaction(async (tx) => {
    await tx.artist.update({
      where: { id: artist.id },
      data: { status: "APPROVED", rejectionReason: null },
    });
    // An admin keeps admin; everyone else becomes an artist.
    if (artist.user.role !== "ADMIN")
      await tx.user.update({ where: { id: artist.userId }, data: { role: "ARTIST" } });
  });
  const fanToken = await createChosenFanToken(ctx, artist);
  const storage = await openStorageOnApproval(ctx, artist.id);
  ctx.activity.set({ targetType: "Artist", targetId: artist.id });
  return { artistId: artist.id, status: "APPROVED" as const, fanToken, storage };
}

/**
 * The platform opens the artist's storage account and issues their starting
 * fan tokens into it. Like the fan token, approval never fails because of it:
 * the artist can open it from Settings later.
 */
async function openStorageOnApproval(
  ctx: ServiceCtx,
  artistId: string,
): Promise<{ status: "OPENED"; supply: string | null } | { status: "FAILED"; message: string }> {
  try {
    // Read again: the fan token was just made.
    const artist = await ctx.db.artist.findUniqueOrThrow({
      where: { id: artistId },
      select: {
        id: true,
        userId: true,
        status: true,
        storageAccountId: true,
        fanTokenItemId: true,
        issuerAccountId: true,
      },
    });
    const { supply } = await openStorage(ctx, artist);
    return { status: "OPENED", supply };
  } catch (error) {
    return {
      status: "FAILED",
      message: isAppError(error) ? error.message : "The storage account couldn't be opened.",
    };
  }
}

/**
 * Makes the fan token the artist chose while applying. Approval never fails
 * because of it: if the token can't be made now (the code was taken
 * meanwhile, the asset is gone), the artist sets it up in Memberships.
 */
async function createChosenFanToken(
  ctx: ServiceCtx,
  artist: Awaited<ReturnType<typeof loadArtist>>,
): Promise<
  { status: "CREATED"; code: string } | { status: "NONE" } | { status: "FAILED"; message: string }
> {
  const chosen = artist.pendingFanToken as PendingFanToken | null;
  if (!chosen || artist.fanTokenItemId) return { status: "NONE" };
  try {
    const { code } = await createFanToken(
      ctx,
      artist,
      { id: artist.userId },
      chosen.mode === "NEW"
        ? { mode: "CUSTOM", code: chosen.code, coverUrl: chosen.coverUrl }
        : { mode: "EXISTING", code: chosen.code, issuer: chosen.issuer, coverUrl: chosen.coverUrl },
    );
    await ctx.db.artist.update({
      where: { id: artist.id },
      data: { pendingFanToken: Prisma.DbNull },
    });
    return { status: "CREATED", code };
  } catch (error) {
    return {
      status: "FAILED",
      message: isAppError(error) ? error.message : "The fan token couldn't be made.",
    };
  }
}

export async function rejectArtist(ctx: ServiceCtx, input: { artistId: string; reason: string }) {
  const artist = await loadArtist(ctx, input.artistId);
  ctx.activity.set({ targetType: "Artist", targetId: artist.id });
  mustBeWaiting(artist.status);

  // Money first: nothing changes in the database unless the XLM is on its way back.
  let refundTxHash: string | null = null;
  if (artist.issuerAccount) {
    const onChain = await ctx.chain.loadAccount(artist.issuerAccount.publicKey);
    if (onChain) {
      const wallet = artist.user.walletAddress;
      if (!wallet)
        throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
          message: "This artist has no wallet to send the XLM back to.",
        });
      const refund = buildIssuerRefund({
        issuer: new Account(onChain.accountId(), onChain.sequenceNumber()),
        network: ctx.chain.config.network,
        artist: wallet,
      });
      const signed = await ctx.chain.signWithServerKeys(refund.xdr, refund.serverSigners);
      ({ hash: refundTxHash } = await ctx.chain.submit(signed));
      ctx.activity.set({ txHash: refundTxHash });
    }
  }

  const issuerId = artist.issuerAccount?.id;
  await ctx.db.$transaction(async (tx) => {
    await tx.artist.update({
      where: { id: artist.id },
      data: { status: "REJECTED", rejectionReason: input.reason, issuerAccountId: null },
    });
    // The account no longer exists on the network, so its key is no use to anyone.
    if (issuerId) await tx.chainAccount.delete({ where: { id: issuerId } });
  });
  return { artistId: artist.id, status: "REJECTED" as const, refundTxHash };
}

export async function banArtist(ctx: ServiceCtx, artistId: string) {
  const artist = await loadArtist(ctx, artistId);
  ctx.activity.set({ targetType: "Artist", targetId: artist.id });
  if (artist.status === "BANNED")
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, { message: "They are already banned." });
  await ctx.db.artist.update({ where: { id: artist.id }, data: { status: "BANNED" } });
  return { artistId: artist.id, status: "BANNED" as const };
}

/** Undoes a ban. Someone who had opened their artist account is approved again; otherwise they're back to waiting. */
export async function unbanArtist(ctx: ServiceCtx, artistId: string) {
  const artist = await loadArtist(ctx, artistId);
  ctx.activity.set({ targetType: "Artist", targetId: artist.id });
  if (artist.status !== "BANNED")
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, { message: "They aren't banned." });
  const status = artist.issuerAccountId ? ("APPROVED" as const) : ("PENDING" as const);
  await ctx.db.artist.update({ where: { id: artist.id }, data: { status } });
  return { artistId: artist.id, status };
}
