import { describe, expect, it } from "vitest";

import { payOf, shownLines } from "./recharge";

const topUp = {
  kind: "TOP_UP" as const,
  lines: [
    { key: "charge", label: "Card charge", currency: "USD" as const, amount: "9.99" },
    { key: "networkFee", label: "Network fee", currency: "XLM" as const, amount: "0.0003" },
    { key: "receive", label: "You receive", currency: "ACTION" as const, amount: "4994.999" },
  ],
};
const swap = {
  kind: "TOKEN_TRUST" as const,
  lines: [
    { key: "market", label: "1 XLM at today's price", currency: "ACTION" as const, amount: "50" },
    { key: "margin", label: "Price cushion (2%)", currency: "ACTION" as const, amount: "1" },
    { key: "networkFee", label: "Network fee", currency: "XLM" as const, amount: "0.0002" },
    { key: "total", label: "You pay", currency: "ACTION" as const, amount: "51" },
  ],
};

describe("recharge breakdown", () => {
  it("keeps the charge or total out of the lines, because the breakdown shows it as 'You pay'", () => {
    expect(shownLines(topUp).map((line) => line.key)).toEqual(["networkFee", "receive"]);
    expect(shownLines(swap).map((line) => line.key)).toEqual(["market", "margin", "networkFee"]);
  });

  it("pays in dollars for a top-up and in ACTION for the swap", () => {
    expect(payOf(topUp)).toEqual({ currency: "USD", amount: "9.99" });
    expect(payOf(swap)).toEqual({ currency: "ACTION", amount: "51" });
    expect(payOf({ kind: "TOP_UP", lines: [] })).toBeNull();
  });
});
