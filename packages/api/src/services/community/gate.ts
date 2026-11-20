import type { Horizon } from "@stellar/stellar-sdk";

export type Requirement = {
  assetCode: string;
  assetIssuer: string;
  /** 0 means "just hold a trustline to it" */
  requiredBalance: number | string | { toString(): string };
};

export type GateResult = {
  passes: boolean;
  /** Each requirement with what the account holds, for "Hold 500 LUNA, you have 120" */
  checks: { assetCode: string; assetIssuer: string; needed: number; held: number; met: boolean }[];
};

type Line = Horizon.AccountResponse["balances"][number];

function lineFor(account: Horizon.AccountResponse | null, req: Requirement): Line | undefined {
  return account?.balances.find(
    (b) =>
      "asset_code" in b && b.asset_code === req.assetCode && b.asset_issuer === req.assetIssuer,
  );
}

/**
 * Whether the account meets a community's token gate. `AND` needs every requirement, `OR` at least
 * one. A requirement of 0 is met by a trustline alone. Read from the chain by the server, never
 * from numbers the browser sends.
 */
export function checkGate(
  account: Horizon.AccountResponse | null,
  requirements: Requirement[],
  logic: "AND" | "OR",
): GateResult {
  const checks = requirements.map((req) => {
    const line = lineFor(account, req);
    const needed = Number(req.requiredBalance.toString());
    const held = line ? Number(line.balance) : 0;
    return {
      assetCode: req.assetCode,
      assetIssuer: req.assetIssuer,
      needed,
      held,
      met: needed === 0 ? line !== undefined : held >= needed,
    };
  });
  const passes =
    checks.length === 0
      ? true
      : logic === "AND"
        ? checks.every((c) => c.met)
        : checks.some((c) => c.met);
  return { passes, checks };
}
