import type { Prisma, UserRole } from "@actiontokens/db";
import { AppError, ErrorCodes } from "@actiontokens/errors";

import type { Context, SessionUser } from "../../context";

/**
 * What an admin does with people: find them, suspend or unsuspend them, and
 * make or remove admins (any admin can, as in bandfan; never on themselves).
 * A suspended user keeps everything but can't sign in or act (see
 * `liveSession` and `authedProcedure`). Every change is a mutation, so it is
 * in the activity log with the person as the target.
 */
type ServiceCtx = Pick<Context, "db" | "activity">;

export const USERS_PAGE = 50;

export type UserFilter = {
  search?: string;
  role?: UserRole;
  status?: "active" | "suspended";
  cursor?: string;
};

function whereOf(input: UserFilter): Prisma.UserWhereInput {
  const q = input.search?.trim();
  return {
    ...(input.role ? { role: input.role } : {}),
    ...(input.status === "suspended"
      ? { suspendedAt: { not: null } }
      : input.status === "active"
        ? { suspendedAt: null }
        : {}),
    ...(q
      ? {
          OR: [
            { id: q },
            { walletAddress: { startsWith: q.toUpperCase() } },
            { email: { contains: q, mode: "insensitive" } },
            { username: { contains: q.replace(/^@/, ""), mode: "insensitive" } },
            { displayName: { contains: q, mode: "insensitive" } },
            { artist: { name: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
}

/** One page of people, newest first, with when each last did something. */
export async function listUsers(ctx: Pick<Context, "db">, input: UserFilter) {
  const rows = await ctx.db.user.findMany({
    where: whereOf(input),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: USERS_PAGE + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
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
      artist: { select: { id: true, name: true, status: true } },
      _count: { select: { pinClaims: true, ownerships: true } },
    },
  });
  const page = rows.slice(0, USERS_PAGE);
  const seen = page.length
    ? await ctx.db.activityLog.groupBy({
        by: ["actorId"],
        where: { actorId: { in: page.map((row) => row.id) } },
        _max: { createdAt: true },
      })
    : [];
  const lastActive = new Map(seen.map((entry) => [entry.actorId, entry._max.createdAt]));
  return {
    users: page.map((row) => ({
      id: row.id,
      name: row.artist?.name ?? row.displayName ?? row.username,
      username: row.username,
      avatarUrl: row.avatarUrl,
      email: row.email,
      walletAddress: row.walletAddress,
      signUpMethod: row.signUpMethod,
      role: row.role,
      createdAt: row.createdAt,
      suspended: row.suspendedAt !== null,
      artist: row.artist,
      collected: row._count.pinClaims,
      owned: row._count.ownerships,
      lastActiveAt: lastActive.get(row.id) ?? null,
    })),
    nextCursor: rows.length > USERS_PAGE ? (page.at(-1)?.id ?? null) : null,
  };
}

/** How many people there are in each role and how many are suspended, for the filter chips. */
export async function userCounts(ctx: Pick<Context, "db">) {
  const [roles, suspended] = await Promise.all([
    ctx.db.user.groupBy({ by: ["role"], _count: { _all: true } }),
    ctx.db.user.count({ where: { suspendedAt: { not: null } } }),
  ]);
  const byRole = Object.fromEntries(roles.map((entry) => [entry.role, entry._count._all]));
  return {
    all: roles.reduce((total, entry) => total + entry._count._all, 0),
    FAN: byRole.FAN ?? 0,
    ARTIST: byRole.ARTIST ?? 0,
    ADMIN: byRole.ADMIN ?? 0,
    suspended,
  };
}

async function loadPerson(ctx: ServiceCtx, userId: string) {
  const user = await ctx.db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      suspendedAt: true,
      artist: { select: { status: true } },
    },
  });
  if (!user) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "User not found" });
  ctx.activity.set({ targetType: "User", targetId: user.id });
  return user;
}

const notYourself = (admin: Pick<SessionUser, "id">, userId: string, what: string) => {
  if (admin.id === userId)
    throw new AppError(ErrorCodes.AUTH_FORBIDDEN, { message: `You can't ${what} yourself.` });
};

export async function suspendUser(
  ctx: ServiceCtx,
  admin: Pick<SessionUser, "id">,
  input: { userId: string; reason: string },
) {
  notYourself(admin, input.userId, "suspend");
  const user = await loadPerson(ctx, input.userId);
  if (user.suspendedAt)
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
      message: "This account is already suspended.",
    });
  await ctx.db.user.update({
    where: { id: user.id },
    data: { suspendedAt: new Date(), suspendedReason: input.reason.trim() },
  });
  return { userId: user.id, suspended: true };
}

export async function unsuspendUser(ctx: ServiceCtx, input: { userId: string }) {
  const user = await loadPerson(ctx, input.userId);
  if (!user.suspendedAt)
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, { message: "This account isn't suspended." });
  await ctx.db.user.update({
    where: { id: user.id },
    data: { suspendedAt: null, suspendedReason: null },
  });
  return { userId: user.id, suspended: false };
}

/** Makes someone an admin, or takes it away (they go back to artist or fan). */
export async function setAdmin(
  ctx: ServiceCtx,
  admin: Pick<SessionUser, "id">,
  input: { userId: string; admin: boolean },
) {
  if (!input.admin) notYourself(admin, input.userId, "remove admin from");
  const user = await loadPerson(ctx, input.userId);
  const role: UserRole = input.admin
    ? "ADMIN"
    : user.artist?.status === "APPROVED"
      ? "ARTIST"
      : "FAN";
  if (user.role === role) return { userId: user.id, role };
  if (input.admin && user.suspendedAt)
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
      message: "Unsuspend this account before making it an admin.",
    });
  await ctx.db.user.update({ where: { id: user.id }, data: { role } });
  return { userId: user.id, role };
}

/** Admins › Add admin: finds the account by its Stellar wallet or email, then makes it an admin. */
export async function addAdmin(
  ctx: ServiceCtx,
  admin: Pick<SessionUser, "id">,
  input: { who: string },
) {
  const who = input.who.trim();
  const user = await ctx.db.user.findFirst({
    where: /^G[A-Z2-7]{55}$/i.test(who)
      ? { walletAddress: who.toUpperCase() }
      : { email: { equals: who, mode: "insensitive" } },
    select: { id: true },
  });
  if (!user)
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, {
      message: "No account with that wallet or email. Ask them to sign in once first.",
    });
  return setAdmin(ctx, admin, { userId: user.id, admin: true });
}
