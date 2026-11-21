import { toAmount, toStroops } from "@actiontokens/chain";
import { spendableXlm } from "@actiontokens/chain/server";

import type { Context, SessionUser } from "../../context";
import { creditLines, freeOf } from "../artist/storage-withdraw";

export type WalletTokenKind = "xlm" | "bandcoin" | "usdc" | "other";

/**
 * Everything in the main wallet, for the Wallet page: XLM (spendable, and
 * what Stellar keeps reserved), BANDCOIN and USDC, then every other token,
 * named after its item when Bandcoin knows it. Amounts are what can move now.
 */
export async function walletAssets(
  ctx: Pick<Context, "db" | "chain">,
  user: Pick<SessionUser, "walletAddress">,
) {
  const account = await ctx.chain.loadAccount(user.walletAddress);
  const { bandcoin, usdc } = ctx.chain.config.assets;
  const lines = creditLines(account);
  const others = lines.filter(
    (line) =>
      !(line.asset_code === bandcoin.code && line.asset_issuer === bandcoin.issuer) &&
      !(line.asset_code === usdc.code && line.asset_issuer === usdc.issuer),
  );
  const known = others.length
    ? await ctx.db.classicToken.findMany({
        where: { OR: others.map((line) => ({ code: line.asset_code, issuer: line.asset_issuer })) },
        select: { code: true, issuer: true, item: { select: { id: true, title: true } } },
      })
    : [];
  const free = (ref: { code: string; issuer: string }) => {
    const line = lines.find(
      (entry) => entry.asset_code === ref.code && entry.asset_issuer === ref.issuer,
    );
    return toAmount(line ? freeOf(line) : 0n);
  };

  const total = account?.balances.find((line) => line.asset_type === "native")?.balance ?? "0";
  const spendable = account ? spendableXlm(account) : "0";
  const reserved = toStroops(total) - toStroops(spendable);
  return {
    address: user.walletAddress,
    /** False until the account exists on Stellar (its first XLM) */
    active: Boolean(account),
    xlm: {
      total: toAmount(toStroops(total)),
      spendable,
      reserved: toAmount(reserved > 0n ? reserved : 0n),
    },
    tokens: [
      {
        code: "XLM",
        issuer: null,
        kind: "xlm" as WalletTokenKind,
        title: "Stellar Lumens",
        itemId: null,
        amount: spendable,
      },
      {
        ...bandcoin,
        kind: "bandcoin" as WalletTokenKind,
        title: "Action Tokens",
        itemId: null,
        amount: free(bandcoin),
      },
      {
        ...usdc,
        kind: "usdc" as WalletTokenKind,
        title: "USD Coin",
        itemId: null,
        amount: free(usdc),
      },
      ...others.map((line) => {
        const item = known.find(
          (row) => row.code === line.asset_code && row.issuer === line.asset_issuer,
        )?.item;
        return {
          code: line.asset_code,
          issuer: line.asset_issuer as string | null,
          kind: "other" as WalletTokenKind,
          title: item?.title ?? line.asset_code,
          itemId: item?.id ?? null,
          amount: toAmount(freeOf(line)),
        };
      }),
    ],
  };
}
