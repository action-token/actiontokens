import {
  Account,
  Keypair,
  Networks,
  type Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";

import type { Db } from "@bandcoin/db";

import type { ChainGateway } from "../services/chain-gateway";
import {
  keepUnlocksAlive,
  syncUnlocks,
  unlockAfterCollect,
  unlockOnChain,
} from "../services/catalog/unlock-chain";

const network = { passphrase: Networks.TESTNET, baseFee: "100" };
const treasury = Keypair.random().publicKey();
const contract = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

function setup({
  ready = true,
  submit,
}: { ready?: boolean; submit?: () => Promise<{ hash: string }> } = {}) {
  const db = {
    pin: {
      findFirst: vi.fn().mockResolvedValue(
        ready
          ? {
              id: "pin1",
              unlockEdition: { tokenId: "40" },
              unlockLockedContent: { chainIndex: 1 },
            }
          : null,
      ),
      findMany: vi.fn().mockResolvedValue([{ id: "pin1" }]),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  const chain = {
    config: { network, treasury, nftContract: contract },
    loadAccount: vi.fn(() => Promise.resolve(new Account(treasury, "9"))),
    prepareContractCall: vi.fn((xdr: string) => Promise.resolve(xdr)),
    signWithServerKeys: vi.fn((xdr: string) => Promise.resolve(xdr)),
    submit: vi.fn((_xdr: string) => (submit ?? (() => Promise.resolve({ hash: "unlockhash" })))()),
  };
  return {
    ctx: { db: db as unknown as Db, chain: chain as unknown as ChainGateway },
    db,
    chain,
  };
}

const callOf = (xdr: string) => {
  const op = (TransactionBuilder.fromXDR(xdr, network.passphrase) as Transaction).operations[0];
  if (op?.type !== "invokeHostFunction" || op.func.type !== "hostFunctionTypeInvokeContract")
    throw new Error("not a contract call");
  return String(op.func.invokeContract.functionName);
};

describe("recording unlocks on the contract", () => {
  it("calls unlock_item_for as the treasury once every place is visited, and remembers the hash", async () => {
    const { ctx, chain, db } = setup();
    await expect(unlockOnChain(ctx, "pin1")).resolves.toBe("unlockhash");
    const sent = chain.submit.mock.calls[0]![0];
    expect(callOf(sent)).toBe("unlock_item_for");
    expect(chain.signWithServerKeys).toHaveBeenCalledWith(sent, [treasury]);
    expect(db.pin.update).toHaveBeenCalledWith({
      where: { id: "pin1" },
      data: { onChainUnlockedAt: expect.any(Date) as Date, onChainUnlockTxHash: "unlockhash" },
    });
  });

  it("does nothing while places are left, or after it's recorded", async () => {
    const { ctx, chain } = setup({ ready: false });
    await expect(unlockOnChain(ctx, "pin1")).resolves.toBeNull();
    expect(chain.submit).not.toHaveBeenCalled();
  });

  it("never fails the collect, and skips pins that aren't unlock pins", async () => {
    const failing = setup({ submit: () => Promise.reject(new Error("tx_failed")) });
    await expect(
      unlockAfterCollect(failing.ctx, { id: "pin1", unlockLockedContentId: "lc1" }),
    ).resolves.toBeUndefined();
    const plain = setup();
    await unlockAfterCollect(plain.ctx, { id: "pin1", unlockLockedContentId: null });
    expect(plain.db.pin.findFirst).not.toHaveBeenCalled();
  });

  it("the worker records what's waiting and counts failures", async () => {
    const { ctx } = setup({ submit: () => Promise.reject(new Error("tx_failed")) });
    await expect(syncUnlocks(ctx)).resolves.toEqual({ looked: 1, recorded: 0, failed: 1 });
  });

  it("keeps recorded unlocks alive in batches of 80", async () => {
    const { ctx, chain, db } = setup();
    db.pin.findMany.mockResolvedValue(
      Array.from({ length: 81 }, (_, index) => ({
        unlockEdition: { tokenId: String(index) },
        unlockLockedContent: { chainIndex: 0 },
      })),
    );
    await expect(keepUnlocksAlive(ctx)).resolves.toEqual({ kept: 81 });
    expect(chain.submit).toHaveBeenCalledTimes(2);
    expect(callOf(chain.submit.mock.calls[0]![0])).toBe("keep_unlocked_alive");
  });
});
