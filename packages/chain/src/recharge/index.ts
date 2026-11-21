import { applyBps, toAmount, toDisplay, toStroops, toUsd } from "../money";

/**
 * Recharge and swap: separate things a fan can do, never automatic.
 *
 *   top-up    pay by card, receive ACTION from the platform (quoteTopUp)
 *   swap      any amount of ACTION for XLM, or XLM for ACTION (quoteSwap)
 *   fan token the four ways to open a fan-token line (fan-token.ts)
 *
 * Pure, like the purchase quote: the server feeds it live rates and balances,
 * the screen only shows what comes back.
 */

/** Card packages in USD. The server alone decides how much ACTION each buys. */
export const RECHARGE_PACKAGES_USD = [
  "1.99",
  "4.99",
  "9.99",
  "19.99",
  "24.99",
  "49.99",
  "99.99",
] as const;
/** Cushion on a swap so price movement between quote and settlement never costs the platform. */
export const XLM_SWAP_MARGIN_BPS = 200;

export type RechargeLine = {
  key: string;
  label: string;
  currency: "USD" | "ACTION" | "XLM";
  amount: string;
};

export type RechargeProblem =
  | { code: "SIGN_IN"; message: string }
  | { code: "UNAVAILABLE"; message: string }
  | { code: "RATE_UNAVAILABLE"; message: string }
  | {
      code: "INSUFFICIENT_FUNDS";
      message: string;
      shortfall: { currency: "ACTION" | "XLM"; need: string; have: string; short: string };
    };

type Rates = {
  /** USD per ACTION and per XLM, as stroops */
  actionTokenUsd: bigint;
  xlmUsd: bigint;
};

const rateProblem = (rates: Rates): RechargeProblem[] =>
  rates.actionTokenUsd > 0n && rates.xlmUsd > 0n
    ? []
    : [
        {
          code: "RATE_UNAVAILABLE",
          message: "Couldn't load the ACTION price. Try again in a moment.",
        },
      ];

/** XLM a new ACTION trustline locks in the buyer's wallet (refundable). */
const TRUSTLINE_RESERVE = toStroops("0.5");

export function quoteTopUp(
  input: Rates & {
    packageUsd: string;
    networkFeeXlm: string;
    /** The wallet has no ACTION line yet, so one is opened and locks the reserve */
    openTrustline?: boolean;
    /** Spendable XLM, only checked when a trustline is opened */
    xlmFunds?: string | null;
  },
) {
  const known = (RECHARGE_PACKAGES_USD as readonly string[]).includes(input.packageUsd);
  const problems: RechargeProblem[] = known
    ? rateProblem(input)
    : [{ code: "UNAVAILABLE", message: "That top-up amount isn't available." }];
  if (problems.length > 0)
    return {
      ok: false as const,
      problems,
      lines: [] as RechargeLine[],
      chargeCents: 0,
      receive: "0",
    };

  const charge = toStroops(input.packageUsd);
  // The platform pays the network fee on chain, so it comes out of what the card bought.
  const feeUsd = toUsd(toStroops(input.networkFeeXlm), input.xlmUsd);
  // Rounded down: the buyer is never given more than they paid for.
  const receive = ((charge - feeUsd) * 10_000_000n) / input.actionTokenUsd;
  if (
    input.openTrustline &&
    input.xlmFunds != null &&
    toStroops(input.xlmFunds) < TRUSTLINE_RESERVE
  ) {
    const have = toStroops(input.xlmFunds);
    problems.push({
      code: "INSUFFICIENT_FUNDS",
      message: `You need ${toDisplay(TRUSTLINE_RESERVE - have)} more XLM to add ACTION to your wallet.`,
      shortfall: {
        currency: "XLM",
        need: toDisplay(TRUSTLINE_RESERVE),
        have: toDisplay(have),
        short: toDisplay(TRUSTLINE_RESERVE - have),
      },
    });
  }
  return {
    ok: problems.length === 0,
    problems,
    chargeCents: Number(charge / 100_000n),
    receive: toAmount(receive),
    lines: [
      { key: "charge", label: "Card charge", currency: "USD", amount: toDisplay(charge) },
      {
        key: "networkFee",
        label: "Network fee",
        currency: "XLM",
        amount: toDisplay(toStroops(input.networkFeeXlm)),
      },
      ...(input.openTrustline
        ? [
            {
              key: "reserve",
              label: "Wallet reserve (refundable)",
              currency: "XLM" as const,
              amount: toDisplay(TRUSTLINE_RESERVE),
            },
          ]
        : []),
      { key: "receive", label: "You receive", currency: "ACTION", amount: toDisplay(receive) },
    ] satisfies RechargeLine[],
  };
}

export type SwapDirection = "TO_XLM" | "TO_ACTION";
type SwapCurrency = "ACTION" | "XLM";
type Holdings = Record<SwapCurrency, string>;

const SWAP_AMOUNT = /^\d{1,12}(\.\d{1,7})?$/;
const STROOPS = 10_000_000n;

/**
 * A swap of any amount, either way, with the platform treasury: the fan pays
 * `amount` and receives the other currency at today's price, less the 2%
 * cushion. What the fan receives is rounded down. Swapping to ACTION opens
 * the ACTION line first when the wallet has none (its reserve is counted).
 * `funds` and `treasury` are spendable balances; null means unknown.
 */
export function quoteSwap(
  input: Rates & {
    direction: SwapDirection;
    amount: string;
    funds: Holdings | null;
    treasury: Holdings | null;
    networkFeeXlm: string;
    openTrustline?: boolean;
  },
) {
  const payCurrency: SwapCurrency = input.direction === "TO_XLM" ? "ACTION" : "XLM";
  const receiveCurrency: SwapCurrency = input.direction === "TO_XLM" ? "XLM" : "ACTION";
  const refuse = (problems: RechargeProblem[]) => ({
    ok: false as const,
    problems,
    direction: input.direction,
    pay: { currency: payCurrency, amount: "0" },
    receive: { currency: receiveCurrency, amount: "0" },
    lines: [] as RechargeLine[],
  });

  const rate = rateProblem(input);
  if (rate.length > 0) return refuse(rate);
  const text = input.amount.trim();
  const pay = SWAP_AMOUNT.test(text) ? toStroops(text) : 0n;
  if (pay <= 0n) return refuse([{ code: "UNAVAILABLE", message: "Enter an amount above zero." }]);

  const [payRate, receiveRate] =
    input.direction === "TO_XLM"
      ? [input.actionTokenUsd, input.xlmUsd]
      : [input.xlmUsd, input.actionTokenUsd];
  // Both steps round down: the platform never hands out more than the price.
  const market = (((pay * payRate) / STROOPS) * STROOPS) / receiveRate;
  const margin = applyBps(market, XLM_SWAP_MARGIN_BPS);
  const receive = market > margin ? market - margin : 0n;
  if (receive === 0n)
    return refuse([{ code: "UNAVAILABLE", message: "That's too little to swap." }]);

  const fee = toStroops(input.networkFeeXlm);
  const reserve = input.direction === "TO_ACTION" && input.openTrustline ? TRUSTLINE_RESERVE : 0n;
  const problems: RechargeProblem[] = [];
  if (input.funds === null) problems.push({ code: "SIGN_IN", message: "Sign in to pay." });
  else {
    const needs: [SwapCurrency, bigint][] =
      input.direction === "TO_XLM"
        ? [
            ["ACTION", pay],
            ["XLM", fee],
          ]
        : [["XLM", pay + fee + reserve]];
    for (const [currency, need] of needs) {
      const have = toStroops(input.funds[currency]);
      if (have < need)
        problems.push({
          code: "INSUFFICIENT_FUNDS",
          message: `You need ${toDisplay(need - have)} more ${currency}.`,
          shortfall: {
            currency,
            need: toDisplay(need),
            have: toDisplay(have),
            short: toDisplay(need - have),
          },
        });
    }
  }
  if (!input.treasury || toStroops(input.treasury[receiveCurrency]) < receive)
    problems.push({ code: "UNAVAILABLE", message: "Swap isn't available right now." });

  return {
    ok: problems.length === 0,
    problems,
    direction: input.direction,
    pay: { currency: payCurrency, amount: toAmount(pay) },
    receive: { currency: receiveCurrency, amount: toAmount(receive) },
    lines: [
      { key: "pay", label: "You pay", currency: payCurrency, amount: toDisplay(pay) },
      {
        key: "market",
        label: "At today's price",
        currency: receiveCurrency,
        amount: toDisplay(market),
      },
      {
        key: "margin",
        label: "Price cushion (2%)",
        currency: receiveCurrency,
        amount: toDisplay(margin),
      },
      { key: "networkFee", label: "Network fee", currency: "XLM", amount: toDisplay(fee) },
      ...(reserve > 0n
        ? [
            {
              key: "reserve",
              label: "Wallet reserve for ACTION (refundable)",
              currency: "XLM" as const,
              amount: toDisplay(reserve),
            },
          ]
        : []),
      {
        key: "receive",
        label: "You receive",
        currency: receiveCurrency,
        amount: toDisplay(receive),
      },
    ] satisfies RechargeLine[],
  };
}

/** What a new wallet pays by card: one fixed price, all of it turned into the wallet's first XLM. */
export const ACTIVATION_PRICE_USD = "1.99";
/** The XLM a Stellar account must hold to exist (two base reserves). */
const ACCOUNT_RESERVE = toStroops("1");

/**
 * Activating a wallet that doesn't exist on the network yet. The card price
 * buys XLM at the live rate, minus the network fee the platform pays on chain;
 * what is left becomes the starting balance of the new account.
 */
export function quoteActivation(input: { xlmUsd: bigint; networkFeeXlm: string }) {
  const empty = {
    ok: false as const,
    lines: [] as RechargeLine[],
    chargeCents: 0,
    startingBalance: "0",
  };
  if (input.xlmUsd <= 0n) {
    return {
      ...empty,
      problems: [
        {
          code: "RATE_UNAVAILABLE",
          message: "Couldn't load the XLM price. Try again in a moment.",
        },
      ] satisfies RechargeProblem[],
    };
  }
  const charge = toStroops(ACTIVATION_PRICE_USD);
  const fee = toStroops(input.networkFeeXlm);
  const feeUsd = toUsd(fee, input.xlmUsd);
  // Rounded down: the wallet is never given more than the card paid for.
  const receive = ((charge - feeUsd) * 10_000_000n) / input.xlmUsd;
  if (receive < ACCOUNT_RESERVE) {
    return {
      ...empty,
      problems: [
        { code: "UNAVAILABLE", message: "Activation isn't available at today's XLM price." },
      ] satisfies RechargeProblem[],
    };
  }
  return {
    ok: true as const,
    problems: [] as RechargeProblem[],
    chargeCents: Number(charge / 100_000n),
    startingBalance: toAmount(receive),
    lines: [
      { key: "charge", label: "Card charge", currency: "USD", amount: toDisplay(charge) },
      { key: "networkFee", label: "Network fee", currency: "XLM", amount: toDisplay(fee) },
      {
        key: "receive",
        label: "Your wallet starts with",
        currency: "XLM",
        amount: toDisplay(receive),
      },
    ] satisfies RechargeLine[],
  };
}

export * from "./fan-token";
