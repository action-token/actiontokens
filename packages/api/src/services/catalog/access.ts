import type { Horizon } from "@stellar/stellar-sdk";

import type { Prisma } from "@actiontokens/db";

/**
 * Who can buy an item, as on the old Action Tokens' item forms:
 *
 *   everyone   the default
 *   members    fans holding at least the artist's lowest tier of fan tokens
 *   a tier     fans holding at least that tier's tokens (`tierId`)
 *
 * Gated items stay visible to everyone with what unlocks them ("Hold 500
 * LUNA, you have 120"); only the artist's own sale is gated, resales are open,
 * as before.
 */
export const accessSelect = {
  membersOnly: true,
  tier: { select: { name: true, requiredTokens: true } },
  organization: {
    select: {
      tiers: { where: { isActive: true }, select: { requiredTokens: true } },
      fanTokenItem: { select: { classicToken: { select: { code: true, issuer: true } } } },
    },
  },
} satisfies Prisma.ItemSelect;

export type AccessRow = Prisma.ItemGetPayload<{ select: typeof accessSelect }>;

export type Access = {
  kind: "MEMBERS" | "TIER";
  /** The tier's name, for TIER */
  tierName: string | null;
  /** The fan token to hold, and how much; null when the artist's setup is incomplete */
  token: { code: string; issuer: string } | null;
  needed: string | null;
};

/** The item's gate, or null when anyone can buy it. */
export function accessOf(row: AccessRow): Access | null {
  if (!row.tier && !row.membersOnly) return null;
  const token = row.organization?.fanTokenItem?.classicToken ?? null;
  const ladder = (row.organization?.tiers ?? []).map((tier) => Number(tier.requiredTokens));
  const needed = row.tier
    ? Number(row.tier.requiredTokens)
    : ladder.length > 0
      ? Math.min(...ladder)
      : null;
  return {
    kind: row.tier ? "TIER" : "MEMBERS",
    tierName: row.tier?.name ?? null,
    token,
    needed: needed === null ? null : String(needed),
  };
}

/** How much of a token the account holds (0 without a trustline or account). */
export function tokenHeld(
  account: Horizon.AccountResponse | null,
  token: { code: string; issuer: string },
) {
  const line = account?.balances.find(
    (balance) =>
      "asset_code" in balance &&
      balance.asset_code === token.code &&
      balance.asset_issuer === token.issuer,
  );
  return line ? Number(line.balance) : 0;
}

/** Whether the account has a trustline to the token (any balance, even none). */
export function tokenTrusted(
  account: Horizon.AccountResponse | null,
  token: { code: string; issuer: string },
) {
  return Boolean(
    account?.balances.some(
      (balance) =>
        "asset_code" in balance &&
        balance.asset_code === token.code &&
        balance.asset_issuer === token.issuer,
    ),
  );
}

/** Whether the viewer clears the gate, and what to tell them when they don't. */
export function checkAccess(
  access: Access,
  viewer: { account: Horizon.AccountResponse | null } | null,
) {
  if (!access.token || access.needed === null)
    return { ok: false, have: null, reason: "Not available yet." };
  const have = tokenHeld(viewer?.account ?? null, access.token);
  const amount = `${Number(access.needed).toLocaleString("en-US")} ${access.token.code}`;
  if (!viewer) return { ok: false, have: null, reason: `Sign in holding ${amount} to buy this.` };
  if (have >= Number(access.needed)) return { ok: true, have: String(have), reason: null };
  return {
    ok: false,
    have: String(have),
    reason: `Hold ${amount} to buy this. You have ${have.toLocaleString("en-US")}.`,
  };
}
