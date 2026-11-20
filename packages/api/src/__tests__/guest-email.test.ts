import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@actiontokens/db";

vi.mock("../services/order-state", () => ({
  transitionOrder: vi.fn().mockResolvedValue(undefined),
}));

import type { ChainGateway } from "../services/chain-gateway";
import { guestPurchaseEmail, notifyGuestPurchase } from "../services/email/guest-email";
import { deliverOrder } from "../services/purchase/index";

const item = { title: "VIP <pass>", coverUrl: "https://c/x.png", slug: "vip-pass" };

function setup(order: { guestEmail: string | null }) {
  const row = { id: "o1", itemId: "i1", buyerId: null, listingId: null, quantity: 2, ...order };
  const tx = { order: { findUniqueOrThrow: vi.fn().mockResolvedValue(row) } };
  const sendEmail = vi.fn().mockResolvedValue(true);
  const db = {
    $transaction: (run: (client: typeof tx) => unknown) => run(tx),
    item: { findUnique: vi.fn().mockResolvedValue(item) },
  };
  return {
    sendEmail,
    db,
    ctx: {
      db: db as unknown as Db,
      chain: { sendEmail } as unknown as ChainGateway,
      activity: { set: vi.fn(), facts: () => ({}) },
      ip: null,
    },
  };
}

beforeEach(() => vi.clearAllMocks());

describe("guest purchase email", () => {
  it("says what was bought, where it went and how to get in", () => {
    const message = guestPurchaseEmail({
      to: "fan@example.com",
      title: "VIP <pass>",
      quantity: 2,
      coverUrl: "https://c/x.png",
      link: "https://bandcoin.io/item/vip-pass",
    });
    expect(message.to).toBe("fan@example.com");
    expect(message.subject).toContain("2 × VIP <pass>");
    expect(message.text).toContain("Bandcoin account for fan@example.com");
    expect(message.text).toContain("Forgot password");
    expect(message.text).toContain("https://bandcoin.io/item/vip-pass");
    expect(message.html).not.toContain("<pass>");
  });

  it("goes out when a guest order is delivered", async () => {
    const { ctx, sendEmail } = setup({ guestEmail: "fan@example.com" });
    await expect(deliverOrder(ctx, "o1")).resolves.toMatchObject({ status: "DELIVERED" });
    expect(sendEmail).toHaveBeenCalledOnce();
    expect(sendEmail.mock.calls[0]![0]).toMatchObject({ to: "fan@example.com" });
  });

  it("isn't sent for a signed-in buyer's order", async () => {
    const { ctx, sendEmail } = setup({ guestEmail: null });
    await deliverOrder(ctx, "o1");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("never undoes a delivered order when sending fails, and isn't retried", async () => {
    const { ctx, sendEmail } = setup({ guestEmail: "fan@example.com" });
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    sendEmail.mockRejectedValue(new Error("smtp down"));
    await expect(deliverOrder(ctx, "o1")).resolves.toMatchObject({ status: "DELIVERED" });
    expect(sendEmail).toHaveBeenCalledOnce();
    quiet.mockRestore();
  });

  it("sends nothing for an order with no item", async () => {
    const { ctx, sendEmail } = setup({ guestEmail: "fan@example.com" });
    await notifyGuestPurchase(ctx, { guestEmail: "fan@example.com", itemId: null, quantity: 1 });
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
