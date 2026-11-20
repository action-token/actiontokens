import { Keypair, Networks, TransactionBuilder } from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";

import { distributeRound } from "../distribute";

const payer = Keypair.random().publicKey();
const issuer = Keypair.random().publicKey();
const wallets = Array.from({ length: 3 }, () => Keypair.random().publicKey());

const account = (id: string, trust = true) => ({
  accountId: () => id,
  sequenceNumber: () => "100",
  balances: trust
    ? [{ asset_type: "credit_alphanum12", asset_code: "BANDCOIN", asset_issuer: issuer }]
    : [],
});

function setup(round: Record<string, unknown> = {}, chain: Record<string, unknown> = {}) {
  const state = {
    id: "r1",
    monthYear: "2026-11",
    data: wallets.map((pubkey) => ({ pubkey, plotBal: 1, plots: [{}] })),
    totalBalance: { toString: () => "30" },
    isDistributed: false,
    completedUsers: [] as string[],
    pendingTx: null as string | null,
    pendingUsers: [] as string[],
    pendingUntil: null as Date | null,
    ...round,
  };
  const db = {
    originReward: {
      findUnique: vi.fn(async () => ({ ...state })),
      update: vi.fn(async ({ data }: { data: object }) => Object.assign(state, data)),
    },
    originBlockedUser: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const submitted: string[] = [];
  const gateway = {
    config: {
      mother: payer,
      network: { passphrase: Networks.TESTNET, baseFee: "100" },
      assets: { bandcoin: { code: "BANDCOIN", issuer } },
    },
    loadAccount: vi.fn(async (id: string) => account(id, id !== wallets[2])),
    signWithServerKeys: vi.fn(async (xdr: string) => xdr),
    submit: vi.fn(async (xdr: string) => {
      submitted.push(xdr);
      return { hash: "h" };
    }),
    findTransaction: vi.fn().mockResolvedValue(null),
    ...chain,
  };
  return { state, db, gateway, submitted };
}

const run = (t: ReturnType<typeof setup>) =>
  distributeRound({ db: t.db, chain: t.gateway } as never, "origin", "r1");

describe("distributeRound", () => {
  it("pays everyone once, by claimable balance when there's no trustline, then marks the round done", async () => {
    const t = setup();
    expect(await run(t)).toEqual({ paid: 3, alreadyDone: false });
    const tx = TransactionBuilder.fromXDR(t.submitted[0]!, Networks.TESTNET) as unknown as {
      operations: { type: string; amount: string }[];
    };
    expect(tx.operations.map((op) => op.type)).toEqual([
      "payment",
      "payment",
      "createClaimableBalance",
    ]);
    expect(tx.operations.map((op) => op.amount)).toEqual([
      "10.0000000",
      "10.0000000",
      "10.0000000",
    ]);
    expect(t.state.isDistributed).toBe(true);
    expect(t.state.completedUsers).toHaveLength(3);
    expect(t.state.pendingTx).toBeNull();
  });

  it("does nothing for a round that's already paid", async () => {
    const t = setup({ isDistributed: true });
    expect(await run(t)).toEqual({ paid: 0, alreadyDone: true });
    expect(t.gateway.submit).not.toHaveBeenCalled();
  });

  it("skips wallets paid before a retry", async () => {
    const t = setup({ completedUsers: [wallets[0]!] });
    expect((await run(t)).paid).toBe(2);
  });

  it("writes the batch down before sending, and keeps it when sending fails", async () => {
    const t = setup({}, { submit: vi.fn().mockRejectedValue(new Error("timeout")) });
    await expect(run(t)).rejects.toThrow("timeout");
    expect(t.state.pendingTx).toEqual(expect.any(String));
    expect(t.state.pendingUsers).toHaveLength(3);
    expect(t.state.isDistributed).toBe(false);
  });

  it("counts an earlier batch that did land as paid and doesn't resend it", async () => {
    const t = setup(
      { pendingTx: "abc", pendingUsers: wallets, pendingUntil: new Date(Date.now() + 1000) },
      { findTransaction: vi.fn().mockResolvedValue({ successful: true, envelopeXdr: "x" }) },
    );
    expect((await run(t)).paid).toBe(0);
    expect(t.gateway.submit).not.toHaveBeenCalled();
    expect(t.state.isDistributed).toBe(true);
  });

  it("waits while an unconfirmed batch could still land", async () => {
    const t = setup({
      pendingTx: "abc",
      pendingUsers: wallets,
      pendingUntil: new Date(Date.now() + 60_000),
    });
    await expect(run(t)).rejects.toThrow(/may still land/);
    expect(t.gateway.submit).not.toHaveBeenCalled();
  });

  it("pays again only once an unconfirmed batch has expired without landing", async () => {
    const t = setup({
      pendingTx: "abc",
      pendingUsers: wallets,
      pendingUntil: new Date(Date.now() - 1000),
    });
    expect((await run(t)).paid).toBe(3);
  });

  it("refuses without a payout account", async () => {
    const t = setup({}, { config: { mother: null } });
    await expect(run(t)).rejects.toThrow(/payout account/);
  });
});
