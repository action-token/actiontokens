import { createHash, randomBytes } from "node:crypto";

import { AppError, ErrorCodes } from "@actiontokens/errors";

import type { Context, SessionUser } from "../../context";

/**
 * Access tokens for AI apps. A person makes one in their settings and pastes it
 * into the AI app as `Authorization: Bearer bc_mcp_…`. Only its SHA-256 is
 * stored, so a database leak doesn't leak working tokens. A token works until
 * it's revoked, or its person is suspended or deleted.
 */
type Db = Pick<Context, "db">["db"];

export const MCP_TOKEN_PREFIX = "bc_mcp_";
export const MAX_ACTIVE_TOKENS = 10;
/** Characters kept in `prefix`, so the settings list can tell tokens apart. */
const SHOWN_CHARS = MCP_TOKEN_PREFIX.length + 6;
/** `lastUsedAt` is written at most this often, not on every request. */
const LAST_USED_GRANULARITY_MS = 5 * 60_000;

export const hashMcpToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** A new token (shown once) and what's stored about it. */
export function generateMcpToken() {
  const token = MCP_TOKEN_PREFIX + randomBytes(32).toString("base64url");
  return { token, tokenHash: hashMcpToken(token), prefix: token.slice(0, SHOWN_CHARS) };
}

/** The token from an `Authorization: Bearer …` header, if it looks like one of ours. */
export function bearerMcpToken(header: string | null): string | null {
  const token = /^Bearer\s+(\S+)$/i.exec(header ?? "")?.[1];
  return token?.startsWith(MCP_TOKEN_PREFIX) ? token : null;
}

/** The person a token stands for, or null (unknown, revoked, suspended, or no wallet). */
export async function mcpUser(
  db: Db,
  token: string,
  now = new Date(),
): Promise<SessionUser | null> {
  const row = await db.mcpToken.findUnique({
    where: { tokenHash: hashMcpToken(token) },
    select: {
      id: true,
      walletType: true,
      revokedAt: true,
      lastUsedAt: true,
      user: { select: { id: true, role: true, walletAddress: true, suspendedAt: true } },
    },
  });
  if (!row || row.revokedAt || row.user.suspendedAt || !row.user.walletAddress) return null;
  if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() > LAST_USED_GRANULARITY_MS)
    await db.mcpToken.update({ where: { id: row.id }, data: { lastUsedAt: now } });
  return {
    id: row.user.id,
    role: row.user.role,
    walletAddress: row.user.walletAddress,
    walletType: row.walletType as SessionUser["walletType"],
  };
}

export const listMcpTokens = (db: Db, user: SessionUser) =>
  db.mcpToken.findMany({
    where: { userId: user.id, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, prefix: true, createdAt: true, lastUsedAt: true },
  });

export async function createMcpToken(db: Db, user: SessionUser, name: string) {
  const clean = name.trim();
  if (clean.length === 0 || clean.length > 60)
    throw new AppError(ErrorCodes.VALIDATION_FAILED, {
      message: "Name the token in up to 60 characters.",
    });
  const active = await db.mcpToken.count({ where: { userId: user.id, revokedAt: null } });
  if (active >= MAX_ACTIVE_TOKENS)
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
      message: `You can have up to ${MAX_ACTIVE_TOKENS} tokens. Revoke one you no longer use.`,
    });
  const { token, tokenHash, prefix } = generateMcpToken();
  const row = await db.mcpToken.create({
    data: { userId: user.id, name: clean, tokenHash, prefix, walletType: user.walletType },
    select: { id: true, name: true, prefix: true, createdAt: true, lastUsedAt: true },
  });
  // The token itself is shown once, now.
  return { ...row, token };
}

export async function revokeMcpToken(db: Db, user: SessionUser, id: string) {
  const { count } = await db.mcpToken.updateMany({
    where: { id, userId: user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (count === 0)
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Token not found" });
  return { id };
}
