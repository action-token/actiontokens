import type { Horizon } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";

import { accessOf, checkAccess } from "../services/catalog/access";

const token = { code: "LUNA", issuer: "GISSUER" };
const row = (extra: Partial<Parameters<typeof accessOf>[0]> = {}) =>
  ({
    membersOnly: false,
    tier: null,
    organization: {
      tiers: [
        { requiredTokens: { toString: () => "100" } },
        { requiredTokens: { toString: () => "25" } },
      ],
      fanTokenItem: { classicToken: token },
    },
    ...extra,
  }) as unknown as Parameters<typeof accessOf>[0];
const holding = (balance: string) =>
  ({
    balances: [
      { asset_type: "credit_alphanum4", asset_code: "LUNA", asset_issuer: "GISSUER", balance },
    ],
  }) as unknown as Horizon.AccountResponse;

describe("item access", () => {
  it("is open by default; members need the lowest tier, a tier needs its own amount", () => {
    expect(accessOf(row())).toBeNull();
    expect(accessOf(row({ membersOnly: true }))).toMatchObject({ kind: "MEMBERS", needed: "25" });
    const tier = { name: "Gold", requiredTokens: { toString: () => "100" } };
    expect(accessOf(row({ tier } as never))).toMatchObject({
      kind: "TIER",
      tierName: "Gold",
      needed: "100",
      token,
    });
  });

  it("says what unlocks it: sign in, hold more, or nothing when set up wrong", () => {
    const members = accessOf(row({ membersOnly: true }))!;
    expect(checkAccess(members, null).reason).toBe("Sign in holding 25 LUNA to buy this.");
    expect(checkAccess(members, { account: null })).toMatchObject({ ok: false, have: "0" });
    expect(checkAccess(members, { account: holding("24.5") }).reason).toBe(
      "Hold 25 LUNA to buy this. You have 24.5.",
    );
    expect(checkAccess(members, { account: holding("25") })).toMatchObject({ ok: true });
    const broken = accessOf(
      row({ membersOnly: true, organization: { tiers: [], fanTokenItem: null } } as never),
    )!;
    expect(checkAccess(broken, { account: holding("999") })).toMatchObject({
      ok: false,
      reason: "Not available yet.",
    });
  });
});
