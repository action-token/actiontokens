import { AppError, ErrorCodes } from "@actiontokens/errors";

import type { Context } from "../../context";

/**
 * The assets holder rewards are measured on. They're public mainnet addresses, so they are the
 * defaults on mainnet only; on testnet nothing is assumed and each must be set to try a round.
 *
 *   REWARD_ACTION_ASSET        "CODE-ISSUER" of the token whose holders get the quarterly reward
 *   REWARD_PLOT_ASSET          "CODE-ISSUER" of the token a PLOT NFT holder also holds
 *   REWARD_PLOT_DISTRIBUTOR    the account that holds the PLOT#### NFTs for sale
 */
const MAINNET = {
  action: "ACTION-GABHBO4IAEAKYODTIQC5G43MPD55BREA4P3MAXAMZKLEVQNF3S7PZFDU",
  plot: "PLOT-GCUKXAC2PGOCVB647AELOK2Y7PTCGDPKGIOQBDK6HSBMGVHSLFM7UPAJ",
  distributor: "GDZ4SHUHW2CKBIHID2X57V6YXCGJAPE7IOTZLQEFHSBE7EVULF6K5HAS",
};

const parseAsset = (value: string) => {
  const [code, issuer] = value.split("-");
  return code && issuer ? { code, issuer } : null;
};

export type RewardAssets = {
  action: { code: string; issuer: string };
  plot: { code: string; issuer: string };
  plotDistributor: string;
};

export function rewardAssets(
  ctx: Pick<Context, "chain">,
  env: Record<string, string | undefined> = process.env,
): RewardAssets {
  const mainnet = ctx.chain.config.name === "mainnet";
  const action = parseAsset(env.REWARD_ACTION_ASSET ?? (mainnet ? MAINNET.action : ""));
  const plot = parseAsset(env.REWARD_PLOT_ASSET ?? (mainnet ? MAINNET.plot : ""));
  const plotDistributor = env.REWARD_PLOT_DISTRIBUTOR ?? (mainnet ? MAINNET.distributor : "");
  if (!action || !plot || !plotDistributor)
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
      message:
        "Reward assets aren't set for this network (REWARD_ACTION_ASSET, REWARD_PLOT_ASSET, REWARD_PLOT_DISTRIBUTOR).",
    });
  return { action, plot, plotDistributor };
}

/** "2026-11" */
export const monthYearOf = (date = new Date()) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

const QUARTERS = ["JAN-MAR", "APR-JUN", "JUL-SEP", "OCT-DEC"] as const;
export const quarterOf = (date = new Date()) => ({
  year: date.getUTCFullYear(),
  quarter: QUARTERS[Math.floor(date.getUTCMonth() / 3)]!,
});
