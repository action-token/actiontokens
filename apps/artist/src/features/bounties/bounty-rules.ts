/** Pure helpers for the bounty screens. */

export type RuleType = "ALL" | "ANY_N" | "TOTAL_PLAYS";

/** The listening rule in one plain sentence, shown under the track list. */
export function ruleSummary(rule: { ruleType: RuleType; trackCount: number; requiredTracks: number; totalPlays: number }) {
  const { ruleType, trackCount, requiredTracks, totalPlays } = rule;
  if (trackCount === 0) return "Add tracks above to set the listening rules.";
  const tracks = `${trackCount} selected track${trackCount > 1 ? "s" : ""}`;
  if (ruleType === "ALL") return `Fans must listen to all ${tracks} until each reaches its play target.`;
  if (ruleType === "ANY_N") return `Fans must listen to any ${Math.min(requiredTracks, trackCount)} of the ${tracks}.`;
  return `Fans must reach ${totalPlays} plays in total across the ${tracks}.`;
}

/** Whether a balance covers a prize. A hint only: the server checks again before anything is built. */
export function covers(balance: string | undefined, prize: string) {
  if (balance === undefined) return null;
  const need = Number(prize);
  if (!Number.isFinite(need) || need <= 0) return null;
  return Number(balance) >= need;
}

/** The fund sources worth offering: the wallet always, the storage account only when the artist has one. */
export function sourceOptions(sources: { wallet: unknown; storage: unknown } | undefined) {
  const options: { value: "wallet" | "storage"; label: string }[] = [{ value: "wallet", label: "My wallet" }];
  if (sources?.storage) options.push({ value: "storage", label: "My storage account" });
  return options;
}
