import { describe, expect, it } from "vitest";

import { paymentOptions } from "../currency";
import { applyBps, toAmount, toCents, toDisplay, toStroops, usdTo } from "../money";
import { buildQuote, type QuoteInput } from "../quote";

describe("money", () => {
  it("parses and prints amounts exactly", () => {
    expect(toStroops("12.5")).toBe(125_000_000n);
    expect(toStroops(0.1 + 0.2)).toBe(3_000_000n);
    expect(toAmount(125_000_000n)).toBe("12.5000000");
    expect(toDisplay(125_000_000n)).toBe("12.5");
    expect(toDisplay(0n)).toBe("0");
  });

  it("rejects negatives and more than 7 decimals", () => {
    expect(() => toStroops("-1")).toThrow();
    expect(() => toStroops("1.12345678")).toThrow();
  });

  it("rounds fees and conversions up, never down", () => {
    expect(applyBps(1n, 250)).toBe(1n);
    expect(applyBps(toStroops("20"), 250)).toBe(toStroops("0.5"));
    // $1 at $0.3 per XLM = 3.3333334 XLM (rounded up)
    expect(toAmount(usdTo(toStroops("1"), toStroops("0.3")))).toBe("3.3333334");
    expect(toCents(toStroops("2.501"))).toBe(251);
  });
});

describe("paymentOptions", () => {
  it("offers all four currencies wherever it can", () => {
    for (const kind of ["ITEM_PURCHASE", "FAN_TOKEN", "GIFT", "VANITY"] as const) {
      expect(paymentOptions(kind)).toEqual(["BANDCOIN", "XLM", "USDC", "USD"]);
    }
  });

  it("offers only the escrow's asset for a bounty", () => {
    expect(paymentOptions("BOUNTY_FUND", "USDC")).toEqual(["USDC"]);
    expect(() => paymentOptions("BOUNTY_FUND")).toThrow();
  });
});

const base: QuoteInput = {
  currency: "BANDCOIN",
  quantity: 2,
  unitPrice: { bandcoin: "10", usd: "2.5" },
  rates: { xlmUsd: "0.25", usdcUsd: "1" },
  platformFeeBps: 250,
  newTrustlines: 1,
  networkFeeXlm: "0.0000100",
  funds: { BANDCOIN: "100", XLM: "5", USDC: "0" },
  now: new Date("2026-10-28T12:00:00Z"),
};

const total = (quote: ReturnType<typeof buildQuote>, currency: string) =>
  quote.totals.find((entry) => entry.currency === currency)?.amount;

describe("buildQuote", () => {
  it("prices BANDCOIN from the artist's BANDCOIN price, plus fee, reserve and network fee", () => {
    const quote = buildQuote(base);
    expect(quote.lines.map((line) => [line.key, line.amount, line.currency])).toEqual([
      ["price", "20.0000000", "BANDCOIN"],
      ["platformFee", "0.5000000", "BANDCOIN"],
      ["reserve", "0.5000000", "XLM"],
      ["networkFee", "0.0000100", "XLM"],
    ]);
    expect(total(quote, "BANDCOIN")).toBe("20.5000000");
    expect(total(quote, "XLM")).toBe("0.5000100");
    expect(quote.rateUsd).toBeNull();
    expect(quote.ok).toBe(true);
    expect(quote.expiresAt).toBe("2026-10-28T12:01:00.000Z");
  });

  it("prices XLM live from the USD price, everything in one XLM total", () => {
    const quote = buildQuote({ ...base, currency: "XLM", funds: { ...base.funds!, XLM: "100" } });
    // 2 × $2.5 = $5 at $0.25 = 20 XLM; fee 0.5; reserve 0.5; network 0.00001
    expect(quote.lines[0]?.amount).toBe("20.0000000");
    expect(quote.totals).toEqual([{ currency: "XLM", amount: "21.0000100" }]);
    expect(quote.rateUsd).toBe("0.2500000");
  });

  it("uses a fixed XLM price when the artist set one, instead of the USD rate", () => {
    const quote = buildQuote({
      ...base,
      currency: "XLM",
      unitPrice: { ...base.unitPrice, xlm: "7" },
      funds: { ...base.funds!, XLM: "100" },
    });
    expect(quote.lines[0]).toMatchObject({ amount: "14.0000000", detail: "2 × 7 XLM" });
    // The BANDCOIN and card prices are untouched by it.
    expect(
      buildQuote({ ...base, unitPrice: { ...base.unitPrice, xlm: "7" } }).lines[0]?.amount,
    ).toBe("20.0000000");
  });

  it("prices USDC from USD, with the XLM costs paid in XLM", () => {
    const usdc = buildQuote({ ...base, currency: "USDC", funds: { ...base.funds!, USDC: "10" } });
    expect(total(usdc, "USDC")).toBe("5.1250000");
    expect(total(usdc, "XLM")).toBe("0.5000100");
    expect(usdc.cardSettlement).toBeNull();
  });

  it("card: one USD total that includes the XLM costs, and the seller is paid in BANDCOIN", () => {
    // no XLM at all: a card buyer doesn't need any
    const card = buildQuote({
      ...base,
      currency: "USD",
      funds: { BANDCOIN: "0", XLM: "0", USDC: "0" },
    });
    expect(card.lines.map((line) => [line.key, line.amount, line.currency, line.detail])).toEqual([
      ["price", "5.0000000", "USD", "2 × 2.5 USD"],
      ["platformFee", "0.1250000", "USD", "2.5 %"],
      ["reserve", "0.1250000", "USD", "0.5 XLM, first time only"],
      ["networkFee", "0.0000025", "USD", "0.00001 XLM"],
    ]);
    expect(card.totals).toEqual([{ currency: "USD", amount: "5.2500025" }]);
    expect(card.ok).toBe(true);
    expect(card.cardSettlement).toEqual({
      seller: "20.0000000",
      royalty: "0.0000000",
      reserveXlm: "0.5000000",
      networkFeeXlm: "0.0000100",
    });
    expect(buildQuote({ ...base, currency: "USD", royaltyBps: 1000 }).cardSettlement).toMatchObject(
      {
        seller: "18.0000000",
        royalty: "2.0000000",
      },
    );
  });

  it("never converts: a short buyer gets exactly how much is missing", () => {
    const quote = buildQuote({ ...base, funds: { BANDCOIN: "12", XLM: "100", USDC: "0" } });
    expect(quote.ok).toBe(false);
    expect(quote.problems).toEqual([
      {
        code: "INSUFFICIENT_FUNDS",
        message: "You're 8.5 BANDCOIN short.",
        shortfall: {
          currency: "BANDCOIN",
          need: "20.5000000",
          have: "12.0000000",
          short: "8.5000000",
        },
      },
    ]);
  });

  it("flags XLM separately when only the reserve and fee are short", () => {
    const quote = buildQuote({ ...base, funds: { BANDCOIN: "100", XLM: "0.1", USDC: "0" } });
    expect(
      quote.problems.map(
        (problem) => problem.code === "INSUFFICIENT_FUNDS" && problem.shortfall.currency,
      ),
    ).toEqual(["XLM"]);
  });

  it("takes a resale royalty out of the seller's share, not on top", () => {
    const quote = buildQuote({ ...base, royaltyBps: 1000, newTrustlines: 0 });
    expect(quote.payout).toEqual({
      seller: "18.0000000",
      royalty: "2.0000000",
      platform: "0.5000000",
    });
    expect(quote.lines.some((line) => line.key === "reserve")).toBe(false);
  });

  it("asks a signed-out visitor to sign in", () => {
    expect(buildQuote({ ...base, funds: null }).problems[0]?.code).toBe("SIGN_IN");
  });

  it("rejects a bad quantity", () => {
    expect(() => buildQuote({ ...base, quantity: 0 })).toThrow();
    expect(() => buildQuote({ ...base, quantity: 1.5 })).toThrow();
  });
});
