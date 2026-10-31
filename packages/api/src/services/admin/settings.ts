import type { Context } from "../../context";
import { type AlertRules, rulesOf } from "./alerts";

/**
 * Admin › Settings: the one AppSetting row (id 1). The platform fee here is
 * what classic sales charge (purchase/quote reads it); the contract-NFT fee
 * lives on the contract (see contract-fee.ts). Saving returns what changed,
 * and the mutation is in the activity log like every other.
 */
type ServiceCtx = Pick<Context, "db" | "chain" | "activity">;

/** What a sale charges while the row has no value (purchase/index.ts uses the same). */
export const DEFAULT_PLATFORM_FEE_BPS = 250;

export type SettingsInput = {
  platformFeeBps: number;
  /** null: the platform treasury */
  platformFeeRecipient: string | null;
  vanityMonthlyBandcoin: string | null;
  vanityMonthlyUsd: string | null;
  vanityNameChangeBandcoin: string | null;
  vanityNameChangeUsd: string | null;
  nearbyPinRadiusMeters: number;
  /** Fan tokens issued into a new artist's storage at approval */
  fanTokenStartSupply: string;
  alertRules: AlertRules;
};

const LABELS: Record<keyof SettingsInput, string> = {
  platformFeeBps: "Platform fee",
  platformFeeRecipient: "Fee goes to",
  vanityMonthlyBandcoin: "Short link, monthly (BANDCOIN)",
  vanityMonthlyUsd: "Short link, monthly (USD)",
  vanityNameChangeBandcoin: "Short link name change (BANDCOIN)",
  vanityNameChangeUsd: "Short link name change (USD)",
  nearbyPinRadiusMeters: "Nearby pin radius",
  fanTokenStartSupply: "Starting fan tokens",
  alertRules: "Alert thresholds",
};

async function savedSettings(ctx: Pick<Context, "db">): Promise<SettingsInput> {
  const row = await ctx.db.appSetting.findUnique({ where: { id: 1 } });
  const money = (value: { toString(): string } | null | undefined) =>
    value == null ? null : value.toString();
  return {
    platformFeeBps: row?.platformFeeBps ?? DEFAULT_PLATFORM_FEE_BPS,
    platformFeeRecipient: row?.platformFeeRecipient ?? null,
    vanityMonthlyBandcoin: money(row?.vanityMonthlyBandcoin),
    vanityMonthlyUsd: money(row?.vanityMonthlyUsd),
    vanityNameChangeBandcoin: money(row?.vanityNameChangeBandcoin),
    vanityNameChangeUsd: money(row?.vanityNameChangeUsd),
    nearbyPinRadiusMeters: row?.nearbyPinRadiusMeters ?? 500,
    fanTokenStartSupply: row?.fanTokenStartSupply.toString() ?? "1000000",
    alertRules: rulesOf(row?.alertRules),
  };
}

export async function getSettings(ctx: Pick<Context, "db" | "chain">) {
  return { saved: await savedSettings(ctx), treasury: ctx.chain.config.treasury };
}

/** Saves the row and returns each changed field as label, before and after. */
export async function updateSettings(ctx: ServiceCtx, input: SettingsInput) {
  ctx.activity.set({ targetType: "AppSetting", targetId: "1" });
  const before = await savedSettings(ctx);
  await ctx.db.appSetting.upsert({ where: { id: 1 }, create: { id: 1, ...input }, update: input });
  const changes = (Object.keys(LABELS) as (keyof SettingsInput)[])
    .filter((key) => JSON.stringify(before[key] ?? "") !== JSON.stringify(input[key] ?? ""))
    .map((key) => ({ field: key, label: LABELS[key], before: before[key], after: input[key] }));
  return { changes };
}
