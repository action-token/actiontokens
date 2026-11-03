export type Choice = { kind: "package"; packageId: string | null } | { kind: "amount" };

/** What the top-up form sends: a package, or a dollar amount between $1 and $500. */
export function topUpChoice(
  choice: Choice,
  amount: string,
  defaultPackageId: string | null,
): { ok: true; input: { packageId: string } | { usd: number } } | { ok: false; problem: string } {
  if (choice.kind === "package") {
    const packageId = choice.packageId ?? defaultPackageId;
    return packageId
      ? { ok: true, input: { packageId } }
      : { ok: false, problem: "Pick a package." };
  }
  const usd = Number(amount);
  if (!amount.trim() || !Number.isFinite(usd))
    return { ok: false, problem: "Type an amount in dollars." };
  if (usd < 1 || usd > 500) return { ok: false, problem: "Top up between $1 and $500." };
  return { ok: true, input: { usd: Math.round(usd * 100) / 100 } };
}
