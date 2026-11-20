import { describe, expect, it, vi } from "vitest";

import { Prisma } from "@bandcoin/db";

import type { SessionUser } from "../context";
import { deleteAccount } from "../services/account/delete";

vi.mock("@bandcoin/wallet/server", () => ({ deleteFirebaseUserByEmail: vi.fn() }));

const fan: SessionUser = { id: "u1", role: "FAN", walletAddress: "GFAN", walletType: "freighter" };
const custodial: SessionUser = { ...fan, walletType: "emailPass" };

function setup(
  over: {
    row?: Record<string, unknown> | null;
    orders?: number;
    account?: unknown;
    deleteFails?: unknown;
  } = {},
) {
  const row =
    over.row === null
      ? null
      : {
          id: "u1",
          role: "FAN",
          email: "fan@example.com",
          walletAddress: "GFAN",
          artist: null,
          ...over.row,
        };
  const db = {
    user: {
      findUnique: vi.fn().mockResolvedValue(row),
      delete: over.deleteFails
        ? vi.fn().mockRejectedValue(over.deleteFails)
        : vi.fn().mockResolvedValue({}),
    },
    order: { count: vi.fn().mockResolvedValue(over.orders ?? 0) },
  };
  const chain = { loadAccount: vi.fn().mockResolvedValue(over.account ?? null) };
  const ctx = { db, chain, activity: { set: vi.fn() } } as never;
  return { ctx, db, chain, deleteSignIn: vi.fn().mockResolvedValue(true) };
}

const line = (asset_type: string, balance: string) => ({ asset_type, balance });
const account = (...balances: ReturnType<typeof line>[]) => ({ balances });

describe("deleting your account", () => {
  it("needs the confirmation word typed exactly", async () => {
    const { ctx, db } = setup();
    for (const confirm of ["", "delete", "DELETE ", "yes"])
      await expect(deleteAccount(ctx, fan, { confirm })).rejects.toThrow(/Type DELETE/);
    expect(db.user.delete).not.toHaveBeenCalled();
  });

  it("removes a fan and their sign-in", async () => {
    const { ctx, db, deleteSignIn } = setup();
    await expect(deleteAccount(ctx, fan, { confirm: "DELETE" }, { deleteSignIn })).resolves.toEqual(
      {
        deleted: true,
      },
    );
    expect(db.user.delete).toHaveBeenCalledWith({ where: { id: "u1" } });
    expect(deleteSignIn).toHaveBeenCalledWith("fan@example.com");
  });

  it("still succeeds when the sign-in can't be removed, since the account is already gone", async () => {
    const { ctx, db } = setup();
    const failing = vi.fn().mockRejectedValue(new Error("firebase down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(
      deleteAccount(ctx, fan, { confirm: "DELETE" }, { deleteSignIn: failing }),
    ).resolves.toEqual({
      deleted: true,
    });
    expect(db.user.delete).toHaveBeenCalled();
  });

  it("leaves admins and artists to others, with a plain reason", async () => {
    const admin = setup({ row: { role: "ADMIN" } });
    await expect(deleteAccount(admin.ctx, fan, { confirm: "DELETE" })).rejects.toThrow(
      /Ask another admin/,
    );
    const artist = setup({ row: { artist: { id: "a1" } } });
    await expect(deleteAccount(artist.ctx, fan, { confirm: "DELETE" })).rejects.toThrow(
      /support removes them/,
    );
    expect(admin.db.user.delete).not.toHaveBeenCalled();
    expect(artist.db.user.delete).not.toHaveBeenCalled();
  });

  it("won't delete while a payment is going through", async () => {
    const paying = setup({ orders: 1 });
    await expect(deleteAccount(paying.ctx, fan, { confirm: "DELETE" })).rejects.toThrow(
      /payment is still going through/,
    );
  });

  it("protects a Bandcoin-held wallet that still holds funds, but not a self-custody one", async () => {
    const tokens = setup({
      account: account(line("native", "1.5"), line("credit_alphanum4", "3")),
    });
    await expect(deleteAccount(tokens.ctx, custodial, { confirm: "DELETE" })).rejects.toThrow(
      /lock them away/,
    );
    const lots = setup({ account: account(line("native", "50")) });
    await expect(deleteAccount(lots.ctx, custodial, { confirm: "DELETE" })).rejects.toThrow(
      /lock them away/,
    );
    const empty = setup({ account: account(line("native", "1.5")) });
    await expect(
      deleteAccount(
        empty.ctx,
        custodial,
        { confirm: "DELETE" },
        { deleteSignIn: empty.deleteSignIn },
      ),
    ).resolves.toEqual({ deleted: true });
    const own = setup({ account: account(line("native", "500")) });
    await deleteAccount(own.ctx, fan, { confirm: "DELETE" }, { deleteSignIn: own.deleteSignIn });
    expect(own.chain.loadAccount).not.toHaveBeenCalled();
  });

  it("explains records it can't remove instead of failing blindly", async () => {
    const error = new Prisma.PrismaClientKnownRequestError("fk", {
      code: "P2003",
      clientVersion: "x",
    });
    const { ctx } = setup({ deleteFails: error });
    await expect(deleteAccount(ctx, fan, { confirm: "DELETE" })).rejects.toThrow(
      /can't be removed automatically/,
    );
  });

  it("says so when the account is already gone", async () => {
    const { ctx } = setup({ row: null });
    await expect(deleteAccount(ctx, fan, { confirm: "DELETE" })).rejects.toThrow(/not found/);
  });
});
