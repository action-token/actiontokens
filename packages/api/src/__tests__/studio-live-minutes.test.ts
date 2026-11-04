import { describe, expect, it, vi } from "vitest";

import { holdLiveMinute, refundLiveMinute } from "../services/studio/live";

const balance = vi.hoisted(() => ({ holdCoins: vi.fn(), settleHold: vi.fn() }));
vi.mock("../services/studio/balance", () => balance);

const ctx = () => ({ db: { generation: { update: vi.fn() } } });

describe("a live minute's coins", () => {
  it("holds the coins and adds them to the run's cost", async () => {
    balance.holdCoins.mockResolvedValue({ entryId: "e1" });
    const c = ctx();
    const entry = await holdLiveMinute(c as never, {
      userId: "u1",
      generationId: "g1",
      minute: 2,
      coins: 7,
    });
    expect(entry).toBe("e1");
    expect(balance.holdCoins).toHaveBeenCalledWith(
      c,
      expect.objectContaining({ coins: 7, note: "Live jam: minute 2" }),
    );
    expect(c.db.generation.update).toHaveBeenCalledWith({
      where: { id: "g1" },
      data: { cost: { increment: 7 }, progress: 2 },
    });
  });

  it("lowers the run's cost only when the refund really happened", async () => {
    const c = ctx();
    balance.settleHold.mockResolvedValueOnce({ settled: true });
    await refundLiveMinute(c as never, "e1", "g1", 7);
    expect(c.db.generation.update).toHaveBeenCalledWith({
      where: { id: "g1" },
      data: { cost: { decrement: 7 } },
    });
    c.db.generation.update.mockClear();
    balance.settleHold.mockResolvedValueOnce({ settled: false });
    await refundLiveMinute(c as never, "e1", "g1", 7);
    expect(c.db.generation.update).not.toHaveBeenCalled();
  });
});
