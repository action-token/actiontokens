import type { Prisma } from "@actiontokens/db";

import type { Context } from "../../context";

const ROLE_NAME: Record<string, string> = { GUEST: "Guest", SYSTEM: "System" };

export const ACTIVITY_KINDS = ["signIn", "money", "claims", "uploads", "bounties"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

const startsWithAny = (prefixes: string[]): Prisma.ActivityLogWhereInput[] =>
  prefixes.map((prefix) => ({ action: { startsWith: prefix } }));

/** Which log rows each timeline filter covers, by procedure name (or a payment on the row). */
const KIND_WHERE: Record<ActivityKind, Prisma.ActivityLogWhereInput> = {
  signIn: { action: { startsWith: "auth." } },
  money: {
    OR: [
      { amount: { not: null } },
      { txHash: { not: null } },
      ...startsWithAny(["purchase.", "order.", "recharge.", "vanity.", "gifts.", "royalty."]),
    ],
  },
  claims: { OR: startsWithAny(["pin.", "claim.", "redeem."]) },
  uploads: { action: { contains: "upload", mode: "insensitive" } },
  bounties: { OR: startsWithAny(["bounty.", "bounties."]) },
};

/**
 * The activity log for /admin/activity and a person's timeline: every
 * mutation, newest first, paged by id. Ids are 64-bit, so they travel as
 * strings.
 */
export async function listActivity(
  ctx: Pick<Context, "db">,
  input: {
    limit: number;
    cursor?: string;
    failedOnly?: boolean;
    actorId?: string;
    kind?: ActivityKind;
  },
) {
  const where: Prisma.ActivityLogWhereInput = {
    ...(input.cursor ? { id: { lt: BigInt(input.cursor) } } : {}),
    ...(input.failedOnly ? { status: "FAILED" as const } : {}),
    ...(input.actorId ? { actorId: input.actorId } : {}),
    ...(input.kind ? { AND: [KIND_WHERE[input.kind]] } : {}),
  };
  const rows = await ctx.db.activityLog.findMany({
    where,
    orderBy: { id: "desc" },
    // one extra row tells us whether there is a next page
    take: input.limit + 1,
    select: {
      id: true,
      action: true,
      actorRole: true,
      status: true,
      errorCode: true,
      targetType: true,
      targetId: true,
      txHash: true,
      amount: true,
      currency: true,
      app: true,
      createdAt: true,
      actor: { select: { username: true, displayName: true } },
    },
  });
  const page = rows.slice(0, input.limit);
  return {
    items: page.map((row) => ({
      id: row.id.toString(),
      action: row.action,
      actor: row.actor
        ? (row.actor.displayName ?? row.actor.username ?? row.actorRole)
        : (ROLE_NAME[row.actorRole] ?? row.actorRole),
      actorRole: row.actorRole,
      status: row.status,
      errorCode: row.errorCode,
      target: row.targetType ? `${row.targetType} ${row.targetId ?? ""}`.trim() : null,
      txHash: row.txHash,
      amount: row.amount?.toString() ?? null,
      currency: row.currency,
      app: row.app,
      createdAt: row.createdAt,
    })),
    nextCursor: rows.length > input.limit ? page[page.length - 1]!.id.toString() : null,
  };
}
