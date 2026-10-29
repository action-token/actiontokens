import { describe, expect, it } from "vitest";

import { toAmount, toStroops } from "../money";
import { quoteTopUp, quoteXlmSwap, RECHARGE_PACKAGES_USD } from "../recharge";

const rates = { bandcoinUsd: toStroops("0.002"), xlmUsd: toStroops("0.1") };

describe("quoteTopUp", () => {
  it("shows the charge, the network fee and the BANDCOIN that arrives", () => {
    // $9.99 charged; the 0.00002 XLM fee is $0.000002 and comes out of it, the rest buys BANDCOIN at $0.002
    const quote = quoteTopUp({ packageUsd: "9.99", ...rates, networkFeeXlm: "0.00002" });
    expect(quote.ok).toBe(true);
    expect(quote.chargeCents).toBe(999);
    expect(quote.receive).toBe("4994.9990000");
    expect(quote.lines.map((line) => line.key)).toEqual(["charge", "networkFee", "receive"]);
    expect(quote.lines[0]).toMatchObject({ currency: "USD", amount: "9.99" });
  });

  it("rounds what the buyer receives down, never up", () => {
    const quote = quoteTopUp({ packageUsd: "1.99", bandcoinUsd: toStroops("0.0030001"), xlmUsd: rates.xlmUsd, networkFeeXlm: "0" });
    expect(toStroops(quote.receive) * toStroops("0.0030001")).toBeLessThanOrEqual(toStroops("1.99") * 10_000_000n);
  });

  it("only sells the listed packages", () => {
    expect(RECHARGE_PACKAGES_USD).toContain("9.99");
    expect(quoteTopUp({ packageUsd: "9.98", ...rates, networkFeeXlm: "0" })).toMatchObject({
      ok: false,
      problems: [{ code: "UNAVAILABLE", message: "That top-up amount isn't available." }],
    });
  });

  it("refuses without a usable price", () => {
    expect(quoteTopUp({ packageUsd: "9.99", bandcoinUsd: 0n, xlmUsd: rates.xlmUsd, networkFeeXlm: "0" })).toMatchObject({
      ok: false,
      problems: [{ code: "RATE_UNAVAILABLE" }],
    });
  });
});

describe("quoteXlmSwap", () => {
  it("prices 1 XLM in BANDCOIN with the 2% margin as its own line", () => {
    // 1 XLM = $0.10 = 50 BANDCOIN at $0.002; 2% margin = 1 BANDCOIN
    const quote = quoteXlmSwap({ ...rates, bandcoinBalance: toAmount(toStroops("500")), networkFeeXlm: "0.00001" });
    expect(quote.ok).toBe(true);
    expect(quote.lines.map((line) => [line.key, line.amount])).toEqual([
      ["market", "50"],
      ["margin", "1"],
      ["networkFee", "0.00001"],
      ["total", "51"],
    ]);
    expect(quote.total).toBe("51.0000000");
    expect(quote.receiveXlm).toBe("1.0000000");
  });

  it("says exactly how much BANDCOIN is missing and never swaps anything else", () => {
    const quote = quoteXlmSwap({ ...rates, bandcoinBalance: "20", networkFeeXlm: "0.00001" });
    expect(quote.ok).toBe(false);
    expect(quote.problems).toEqual([
      {
        code: "INSUFFICIENT_FUNDS",
        message: "You need 31 more BANDCOIN.",
        shortfall: { currency: "BANDCOIN", need: "51", have: "20", short: "31" },
      },
    ]);
  });

  it("asks to sign in when there are no balances", () => {
    expect(quoteXlmSwap({ ...rates, bandcoinBalance: null, networkFeeXlm: "0" }).problems).toEqual([
      { code: "SIGN_IN", message: "Sign in to pay." },
    ]);
  });
});
