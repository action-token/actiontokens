import type { Horizon } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";

import { checkGate } from "../gate";

const ISSUER = "G".padEnd(56, "A");
const account = (balances: { code: string; balance: string }[]) =>
  ({
    balances: [
      { asset_type: "native", balance: "10" },
      ...balances.map((b) => ({
        asset_type: "credit_alphanum4",
        asset_code: b.code,
        asset_issuer: ISSUER,
        balance: b.balance,
      })),
    ],
  }) as unknown as Horizon.AccountResponse;
const req = (assetCode: string, requiredBalance: number) => ({
  assetCode,
  assetIssuer: ISSUER,
  requiredBalance,
});

describe("checkGate", () => {
  it("lets everyone in when there are no requirements", () => {
    expect(checkGate(null, [], "AND").passes).toBe(true);
  });
  it("AND needs every requirement", () => {
    const a = account([{ code: "LUNA", balance: "500" }]);
    expect(checkGate(a, [req("LUNA", 500), req("SUN", 1)], "AND").passes).toBe(false);
    expect(checkGate(a, [req("LUNA", 500)], "AND").passes).toBe(true);
  });
  it("OR needs one", () => {
    const a = account([{ code: "SUN", balance: "2" }]);
    expect(checkGate(a, [req("LUNA", 500), req("SUN", 1)], "OR").passes).toBe(true);
    expect(checkGate(a, [req("LUNA", 500)], "OR").passes).toBe(false);
  });
  it("a requirement of 0 needs only a trustline", () => {
    expect(
      checkGate(account([{ code: "LUNA", balance: "0" }]), [req("LUNA", 0)], "AND").passes,
    ).toBe(true);
    expect(checkGate(account([]), [req("LUNA", 0)], "AND").passes).toBe(false);
  });
  it("reports what is held, and fails for a missing account", () => {
    const r = checkGate(account([{ code: "LUNA", balance: "120" }]), [req("LUNA", 500)], "AND");
    expect(r.checks[0]).toMatchObject({ needed: 500, held: 120, met: false });
    expect(checkGate(null, [req("LUNA", 1)], "AND").passes).toBe(false);
  });
});
