import { fundsOf } from "@actiontokens/chain/server";
import { AppError, ErrorCodes } from "@actiontokens/errors";

import type { Context } from "../../context";

/**
 * One person for /admin/users/[id]: who they are, their wallet and what's in
 * it, what they did (counts), their artist profile if any, latest orders and
 * what they own. The timeline comes from the activity log separately.
 */
type ServiceCtx = Pick<Context, "db" | "chain">;

const RECENT = 10;

export async function getPerson(ctx: ServiceCtx, userId: string) {
  const { db } = ctx;
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      email: true,
      walletAddress: true,
      signUpMethod: true,
      role: true,
      createdAt: true,
      suspendedAt: true,
      suspendedReason: true,
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          createdAt: true,
          issuerAccount: { select: { publicKey: true } },
          storageAccount: { select: { publicKey: true } },
          _count: { select: { items: true, pins: true, followers: true } },
        },
      },
      _count: {
        select: {
          ownerships: true,
          pinClaims: true,
          redeemClaims: true,
          follows: true,
          orders: true,
        },
      },
    },
  });
  if (!user) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "User not found" });

  const [orders, owned, pinClaims, redeemed, account, lastActive] = await Promise.all(
    [
      db.order.findMany({
        where: { buyerId: user.id },
        orderBy: { createdAt: "desc" },
        take: RECENT,
        select: {
          id: true,
          kind: true,
          status: true,
          total: true,
          currency: true,
          quantity: true,
          txHash: true,
          createdAt: true,
          item: { select: { id: true, title: true } },
        },
      }),
      db.ownership.findMany({
        where: { userId: user.id },
        orderBy: { acquiredAt: "desc" },
        take: RECENT,
        select: {
          quantity: true,
          source: true,
          acquiredAt: true,
          item: { select: { id: true, title: true, coverUrl: true } },
        },
      }),
      db.pinClaim.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: RECENT,
        select: {
          id: true,
          isRedeemed: true,
          claimedAt: true,
          createdAt: true,
          spot: {
            select: {
              pin: {
                select: {
                  id: true,
                  title: true,
                  type: true,
                  imageUrl: true,
                  organization: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      }),
      db.redeemClaim.findMany({
        where: { userId: user.id },
        orderBy: { claimedAt: "desc" },
        take: RECENT,
        select: {
          id: true,
          code: true,
          claimedAt: true,
          redeem: { select: { item: { select: { id: true, title: true } } } },
        },
      }),
      // A slow or missing network shouldn't stop the page: balances just don't show.
      user.walletAddress ? ctx.chain.loadAccount(user.walletAddress).catch(() => null) : null,
      db.activityLog.findFirst({
        where: { actorId: user.id },
        orderBy: { id: "desc" },
        select: { createdAt: true },
      }),
    ],
  );

  return {
    id: user.id,
    name: user.organization?.name ?? user.displayName ?? user.username,
    username: user.username,
    avatarUrl: user.avatarUrl,
    email: user.email,
    walletAddress: user.walletAddress,
    signUpMethod: user.signUpMethod,
    role: user.role,
    createdAt: user.createdAt,
    lastActiveAt: lastActive?.createdAt ?? null,
    suspended: user.suspendedAt ? { at: user.suspendedAt, reason: user.suspendedReason } : null,
    /** Spendable balances; null when the wallet isn't on the network (or couldn't be read) */
    balances: account ? fundsOf(account, ctx.chain.config.assets) : null,
    counts: {
      owned: user._count.ownerships,
      pinsCollected: user._count.pinClaims,
      redeemed: user._count.redeemClaims,
      following: user._count.follows,
      orders: user._count.orders,
    },
    artist: user.organization
      ? {
          id: user.organization.id,
          name: user.organization.name,
          slug: user.organization.slug,
          status: user.organization.status,
          appliedAt: user.organization.createdAt,
          issuer: user.organization.issuerAccount?.publicKey ?? null,
          storage: user.organization.storageAccount?.publicKey ?? null,
          counts: user.organization._count,
        }
      : null,
    orders: orders.map((order) => ({ ...order, total: order.total.toString() })),
    owned: owned.map((row) => ({ ...row, quantity: row.quantity.toString() })),
    pinsCollected: pinClaims.map((claim) => ({
      id: claim.id,
      redeemed: claim.isRedeemed,
      at: claim.claimedAt ?? claim.createdAt,
      pin: claim.spot.pin,
    })),
    redeemed: redeemed.map((claim) => ({
      id: claim.id,
      code: claim.code,
      at: claim.claimedAt,
      item: claim.redeem.item,
    })),
  };
}
