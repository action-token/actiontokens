import { z } from "zod";

import { myRewards } from "../../services/rewards/admin";
import { monthYearOf, quarterOf, rewardAssets } from "../../services/rewards/config";
import { leaderboard, publicRounds, topHolders } from "../../services/rewards/public";
import { authedProcedure, createRouter, publicProcedure } from "../../trpc";

/** A Stellar account id: G and 55 base32 characters. */
const walletInput = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^G[A-Z2-7]{55}$/,
    "That isn't a Stellar wallet address (it starts with G, 56 characters).",
  );

const kind = z.enum(["origin", "quarter"]);

/** A holder's own view: what recent reward rounds owe (or paid) their wallet. */
export const rewardRouter = createRouter({
  mine: authedProcedure.query(({ ctx }) => myRewards(ctx, ctx.session.user.walletAddress)),

  /**
   * The reward checker: any wallet's tokens (public chain data), how it stands for the two holder
   * programs (ACTION held for the quarter, PLOT NFTs for the monthly origin round) and what the
   * recent rounds owe or paid it.
   */
  check: publicProcedure.input(z.object({ wallet: walletInput })).query(async ({ ctx, input }) => {
    const account = await ctx.chain.loadAccount(input.wallet);
    let assets: ReturnType<typeof rewardAssets> | null = null;
    try {
      assets = rewardAssets(ctx);
    } catch {
      // reward tokens aren't set for this network: show the wallet without the programs
    }
    const balances = (account?.balances ?? [])
      .map((line) =>
        line.asset_type === "native"
          ? { code: "XLM", issuer: null, balance: line.balance }
          : "asset_code" in line
            ? { code: line.asset_code, issuer: line.asset_issuer, balance: line.balance }
            : null,
      )
      .filter((line): line is { code: string; issuer: string | null; balance: string } =>
        Boolean(line),
      )
      .sort((a, b) =>
        a.issuer === null ? -1 : b.issuer === null ? 1 : a.code.localeCompare(b.code),
      );
    const action = assets
      ? balances.find(
          (line) => line.code === assets.action.code && line.issuer === assets.action.issuer,
        )
      : undefined;
    const plots = balances.filter(
      (line) => /^PLOT\d*$/i.test(line.code) && Number(line.balance) > 0,
    ).length;
    return {
      wallet: input.wallet,
      found: account !== null,
      balances,
      programs: assets
        ? {
            actionCode: assets.action.code,
            actionHeld: action?.balance ?? "0",
            plots,
          }
        : null,
      rewards: account ? await myRewards(ctx, input.wallet) : [],
      current: { month: monthYearOf(), quarter: quarterOf() },
    };
  }),

  /** The rounds of one program, newest first, for the month / quarter picker. */
  rounds: publicProcedure
    .input(z.object({ kind }))
    .query(({ ctx, input }) => publicRounds(ctx, input.kind)),

  /** One round ranked by holding, with each wallet's share; searchable by wallet. */
  leaderboard: publicProcedure
    .input(
      z.object({
        kind,
        id: z.string().min(1).max(40),
        search: z.string().trim().max(56).optional(),
        page: z.number().int().min(0).max(1000).default(0),
      }),
    )
    .query(({ ctx, input }) => leaderboard(ctx, input.kind, input.id, input)),

  /** Who holds a token, biggest first. */
  holders: publicProcedure
    .input(
      z.object({
        assetCode: z
          .string()
          .trim()
          .regex(/^[A-Za-z0-9]{1,12}$/),
        assetIssuer: z
          .string()
          .trim()
          .regex(/^G[A-Z2-7]{55}$/),
      }),
    )
    .query(({ ctx, input }) => topHolders(ctx, input.assetCode, input.assetIssuer)),
});
