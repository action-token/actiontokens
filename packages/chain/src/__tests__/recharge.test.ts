import { describe, expect, it } from "vitest";

import { toAmount, toStroops } from "../money";
import {
  ACTIVATION_PRICE_USD,
  quoteActivation,
  quoteTopUp,
  quoteSwap,
  quoteXlmSwap,
  RECHARGE_PACKAGES_USD,
} from "../recharge";

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
    const quote = quoteTopUp({
      packageUsd: "1.99",
      bandcoinUsd: toStroops("0.0030001"),
      xlmUsd: rates.xlmUsd,
      networkFeeXlm: "0",
    });
    expect(toStroops(quote.receive) * toStroops("0.0030001")).toBeLessThanOrEqual(
      toStroops("1.99") * 10_000_000n,
    );
  });

  it("shows the refundable 0.5 XLM wallet reserve when BANDCOIN isn't in the wallet yet, and what's missing", () => {
    const ok = quoteTopUp({
      packageUsd: "9.99",
      ...rates,
      networkFeeXlm: "0",
      openTrustline: true,
      xlmFunds: "2",
    });
    expect(ok.ok).toBe(true);
    expect(ok.lines.find((line) => line.key === "reserve")).toMatchObject({
      currency: "XLM",
      amount: "0.5",
    });

    const short = quoteTopUp({
      packageUsd: "9.99",
      ...rates,
      networkFeeXlm: "0",
      openTrustline: true,
      xlmFunds: "0.2",
    });
    expect(short.problems).toEqual([
      {
        code: "INSUFFICIENT_FUNDS",
        message: "You need 0.3 more XLM to add BANDCOIN to your wallet.",
        shortfall: { currency: "XLM", need: "0.5", have: "0.2", short: "0.3" },
      },
    ]);
  });

  it("only sells the listed packages", () => {
    expect(RECHARGE_PACKAGES_USD).toContain("9.99");
    expect(quoteTopUp({ packageUsd: "9.98", ...rates, networkFeeXlm: "0" })).toMatchObject({
      ok: false,
      problems: [{ code: "UNAVAILABLE", message: "That top-up amount isn't available." }],
    });
  });

  it("refuses without a usable price", () => {
    expect(
      quoteTopUp({ packageUsd: "9.99", bandcoinUsd: 0n, xlmUsd: rates.xlmUsd, networkFeeXlm: "0" }),
    ).toMatchObject({
      ok: false,
      problems: [{ code: "RATE_UNAVAILABLE" }],
    });
  });
});

describe("quoteXlmSwap", () => {
  it("prices 1 XLM in BANDCOIN with the 2% margin as its own line", () => {
    // 1 XLM = $0.10 = 50 BANDCOIN at $0.002; 2% margin = 1 BANDCOIN
    const quote = quoteXlmSwap({
      ...rates,
      xlm: "1",
      bandcoinBalance: toAmount(toStroops("500")),
      networkFeeXlm: "0.00001",
    });
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
    const quote = quoteXlmSwap({
      ...rates,
      xlm: "1",
      bandcoinBalance: "20",
      networkFeeXlm: "0.00001",
    });
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
    expect(
      quoteXlmSwap({ ...rates, xlm: "1", bandcoinBalance: null, networkFeeXlm: "0" }).problems,
    ).toEqual([{ code: "SIGN_IN", message: "Sign in to pay." }]);
  });
});

describe("quoteSwap", () => {
  const funds = { BANDCOIN: "1000", XLM: "10" };
  const treasury = { BANDCOIN: "100000", XLM: "1000" };
  const base = { ...rates, funds, treasury, networkFeeXlm: "0.00002" };

  it("BANDCOIN to XLM: any amount, at today's price less the 2% cushion", () => {
    // 100 BANDCOIN = $0.20 = 2 XLM; the cushion keeps 0.04 XLM
    const quote = quoteSwap({ ...base, direction: "TO_XLM", amount: "100" });
    expect(quote.ok).toBe(true);
    expect(quote.pay).toEqual({ currency: "BANDCOIN", amount: "100.0000000" });
    expect(quote.receive).toEqual({ currency: "XLM", amount: "1.9600000" });
    expect(quote.lines.map((line) => [line.key, line.currency, line.amount])).toEqual([
      ["pay", "BANDCOIN", "100"],
      ["market", "XLM", "2"],
      ["margin", "XLM", "0.04"],
      ["networkFee", "XLM", "0.00002"],
      ["receive", "XLM", "1.96"],
    ]);
  });

  it("XLM to BANDCOIN: opens the BANDCOIN line when the wallet has none, and counts its reserve", () => {
    const quote = quoteSwap({
      ...base,
      direction: "TO_BANDCOIN",
      amount: "2",
      openTrustline: true,
    });
    expect(quote.ok).toBe(true);
    expect(quote.receive).toEqual({ currency: "BANDCOIN", amount: "98.0000000" });
    expect(quote.lines.map((line) => line.key)).toEqual([
      "pay",
      "market",
      "margin",
      "networkFee",
      "reserve",
      "receive",
    ]);
    // 2 XLM + 0.5 reserve + the fee is more than 2.4 XLM
    const short = quoteSwap({
      ...base,
      funds: { BANDCOIN: "0", XLM: "2.4" },
      direction: "TO_BANDCOIN",
      amount: "2",
      openTrustline: true,
    });
    expect(short.problems).toEqual([
      {
        code: "INSUFFICIENT_FUNDS",
        message: "You need 0.10002 more XLM.",
        shortfall: { currency: "XLM", need: "2.50002", have: "2.4", short: "0.10002" },
      },
    ]);
  });

  it("rounds what the fan receives down, never up", () => {
    const quote = quoteSwap({
      ...base,
      bandcoinUsd: toStroops("0.0030001"),
      direction: "TO_XLM",
      amount: "33.3333333",
    });
    const market = (toStroops("33.3333333") * toStroops("0.0030001")) / toStroops("0.1");
    expect(toStroops(quote.receive.amount)).toBeLessThan(market);
  });

  it("says how much BANDCOIN is missing", () => {
    const quote = quoteSwap({ ...base, direction: "TO_XLM", amount: "1200" });
    expect(quote.problems).toEqual([
      {
        code: "INSUFFICIENT_FUNDS",
        message: "You need 200 more BANDCOIN.",
        shortfall: { currency: "BANDCOIN", need: "1200", have: "1000", short: "200" },
      },
    ]);
  });

  it("refuses when the treasury can't cover it, a bad amount, no price, or no wallet", () => {
    const unavailable = { code: "UNAVAILABLE", message: "Swap isn't available right now." };
    expect(
      quoteSwap({
        ...base,
        treasury: { BANDCOIN: "0", XLM: "1" },
        direction: "TO_XLM",
        amount: "100",
      }).problems,
    ).toEqual([unavailable]);
    expect(
      quoteSwap({ ...base, treasury: null, direction: "TO_XLM", amount: "100" }).problems,
    ).toEqual([unavailable]);
    for (const amount of ["0", "", "abc", "-1", "1.12345678"])
      expect(quoteSwap({ ...base, direction: "TO_XLM", amount }).problems).toEqual([
        { code: "UNAVAILABLE", message: "Enter an amount above zero." },
      ]);
    expect(
      quoteSwap({ ...base, direction: "TO_XLM", amount: "0.0000001" }).problems[0]?.message,
    ).toBe("That's too little to swap.");
    expect(
      quoteSwap({ ...base, bandcoinUsd: 0n, direction: "TO_XLM", amount: "100" }).problems[0]?.code,
    ).toBe("RATE_UNAVAILABLE");
    expect(
      quoteSwap({ ...base, funds: null, direction: "TO_XLM", amount: "100" }).problems,
    ).toEqual([{ code: "SIGN_IN", message: "Sign in to pay." }]);
  });
});

describe("quoteActivation", () => {
  it("sells a fixed card price and sends the XLM it buys as the new wallet's starting balance", () => {
    // $1.99 at $0.1 per XLM: the $0.000002 fee comes out, 19.89998 XLM arrive
    const quote = quoteActivation({ xlmUsd: toStroops("0.1"), networkFeeXlm: "0.00002" });
    expect(ACTIVATION_PRICE_USD).toBe("1.99");
    expect(quote).toMatchObject({ ok: true, chargeCents: 199, startingBalance: "19.8999800" });
    expect(quote.lines.map((line) => [line.key, line.currency, line.amount])).toEqual([
      ["charge", "USD", "1.99"],
      ["networkFee", "XLM", "0.00002"],
      ["receive", "XLM", "19.89998"],
    ]);
  });

  it("rounds down, and refuses if the XLM it buys wouldn't cover the 1 XLM account reserve", () => {
    expect(
      quoteActivation({ xlmUsd: toStroops("0.3333333"), networkFeeXlm: "0" }).startingBalance,
    ).toBe("5.9700005");
    expect(quoteActivation({ xlmUsd: toStroops("2"), networkFeeXlm: "0" })).toMatchObject({
      ok: false,
      problems: [
        { code: "UNAVAILABLE", message: "Activation isn't available at today's XLM price." },
      ],
    });
  });

  it("refuses without a price", () => {
    expect(quoteActivation({ xlmUsd: 0n, networkFeeXlm: "0" })).toMatchObject({
      ok: false,
      problems: [{ code: "RATE_UNAVAILABLE" }],
    });
  });
});
