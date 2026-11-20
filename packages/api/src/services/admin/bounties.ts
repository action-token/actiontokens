import type { Prisma } from "@actiontokens/db";
import { AppError, ErrorCodes } from "@actiontokens/errors";

import type { Context } from "../../context";
import { prizeView } from "../bounty/prize";
import { ADMIN_PAGE } from "./pins";

/**
 * Every bounty for /admin/bounties, with where its prize is: a draft (not
 * funded), held in escrow, or paid out. The admin can hide one from fans
 * (with a reason) and show it again; the escrow is never touched here.
 */
type ServiceCtx = Pick<Context, "db" | "activity">;

export type BountyFilter = {
  search?: string;
  status?: "draft" | "running" | "paused" | "completed" | "hidden";
  cursor?: string;
};

const STATUS_WHERE: Record<NonNullable<BountyFilter["status"]>, Prisma.BountyWhereInput> = {
  draft: { fundTxHash: null },
  running: { fundTxHash: { not: null }, status: "RUNNING", hiddenAt: null },
  paused: { fundTxHash: { not: null }, status: "PAUSED", hiddenAt: null },
  completed: { status: "COMPLETED" },
  hidden: { hiddenAt: { not: null } },
};

export async function listBounties(ctx: Pick<Context, "db" | "chain">, input: BountyFilter) {
  const q = input.search?.trim();
  const rows = await ctx.db.bounty.findMany({
    where: {
      ...(input.status ? STATUS_WHERE[input.status] : {}),
      ...(q
        ? {
            OR: [
              { id: q },
              { title: { contains: q, mode: "insensitive" } },
              { organization: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: ADMIN_PAGE + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      title: true,
      prizeAmount: true,
      prizeCurrency: true,
      prizeAssetCode: true,
      prizeAssetIssuer: true,
      maxWinners: true,
      status: true,
      fundTxHash: true,
      fundedFromStorage: true,
      hiddenAt: true,
      hiddenReason: true,
      createdAt: true,
      organization: { select: { id: true, name: true, userId: true } },
      _count: { select: { participants: true, submissions: true, winners: true } },
    },
  });
  const page = rows.slice(0, ADMIN_PAGE);
  return {
    bounties: page.map((row) => ({
      id: row.id,
      title: row.title,
      artist: row.organization,
      prize: prizeView(row, ctx.chain.config),
      maxWinners: row.maxWinners,
      /** Where the prize is: not funded yet, held by the escrow, or all paid out */
      escrow: !row.fundTxHash
        ? ("draft" as const)
        : row.status === "COMPLETED"
          ? ("paid" as const)
          : ("held" as const),
      status: row.status,
      fundTxHash: row.fundTxHash,
      fundedFromStorage: row.fundedFromStorage,
      hidden: row.hiddenAt ? { at: row.hiddenAt, reason: row.hiddenReason } : null,
      counts: row._count,
      createdAt: row.createdAt,
    })),
    nextCursor: rows.length > ADMIN_PAGE ? (page.at(-1)?.id ?? null) : null,
  };
}

export async function setBountyHidden(
  ctx: ServiceCtx,
  input: { bountyId: string; hidden: boolean; reason?: string },
) {
  const bounty = await ctx.db.bounty.findUnique({
    where: { id: input.bountyId },
    select: { id: true },
  });
  if (!bounty) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Bounty not found" });
  ctx.activity.set({ targetType: "Bounty", targetId: bounty.id });
  await ctx.db.bounty.update({
    where: { id: bounty.id },
    data: input.hidden
      ? { hiddenAt: new Date(), hiddenReason: input.reason?.trim() || null }
      : { hiddenAt: null, hiddenReason: null },
  });
  return { bountyId: bounty.id, hidden: input.hidden };
}
