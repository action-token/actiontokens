import { applyBps, toAmount, toDisplay, toStroops, toUsd, usdTo } from "../money";

/**
 * Recharge: two separate things a fan can do, neither ever automatic.
 *
 *   top-up    pay by card, receive BANDCOIN from the platform (quoteTopUp)
 *   XLM swap  pay BANDCOIN, receive exactly 1 XLM (quoteXlmSwap)
 *
 * Pure, like the purchase quote: the server feeds it live rates and balances,
 * the screen only shows what comes back.
 */

/** Card packages in USD. The server alone decides how much BANDCOIN each buys. */
export const RECHARGE_PACKAGES_USD = [
  "1.99",
  "4.99",
  "9.99",
  "19.99",
  "24.99",
  "49.99",
  "99.99",
] as const;
/** XLM one swap hands out: enough to activate or top up a wallet. */
export const XLM_SWAP_AMOUNT = "1";
/** Cushion on the swap so price movement between quote and settlement never costs the platform. */
export const XLM_SWAP_MARGIN_BPS = 200;

export type RechargeLine = {
  key: string;
  label: string;
  currency: "USD" | "BANDCOIN" | "XLM";
  amount: string;
};

export type RechargeProblem =
  | { code: "SIGN_IN"; message: string }
  | { code: "UNAVAILABLE"; message: string }
  | { code: "RATE_UNAVAILABLE"; message: string }
  | {
      code: "INSUFFICIENT_FUNDS";
      message: string;
      shortfall: { currency: "BANDCOIN" | "XLM"; need: string; have: string; short: string };
    };

type Rates = {
  /** USD per BANDCOIN and per XLM, as stroops */
  bandcoinUsd: bigint;
  xlmUsd: bigint;
};

const rateProblem = (rates: Rates): RechargeProblem[] =>
  rates.bandcoinUsd > 0n && rates.xlmUsd > 0n
    ? []
    : [
        {
          code: "RATE_UNAVAILABLE",
          message: "Couldn't load the BANDCOIN price. Try again in a moment.",
        },
      ];

/** XLM a new BANDCOIN trustline locks in the buyer's wallet (refundable). */
const TRUSTLINE_RESERVE = toStroops("0.5");

export function quoteTopUp(
  input: Rates & {
    packageUsd: string;
    networkFeeXlm: string;
    /** The wallet has no BANDCOIN line yet, so one is opened and locks the reserve */
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
  const receive = ((charge - feeUsd) * 10_000_000n) / input.bandcoinUsd;
  if (
    input.openTrustline &&
    input.xlmFunds != null &&
    toStroops(input.xlmFunds) < TRUSTLINE_RESERVE
  ) {
    const have = toStroops(input.xlmFunds);
    problems.push({
      code: "INSUFFICIENT_FUNDS",
      message: `You need ${toDisplay(TRUSTLINE_RESERVE - have)} more XLM to add BANDCOIN to your wallet.`,
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
      { key: "receive", label: "You receive", currency: "BANDCOIN", amount: toDisplay(receive) },
    ] satisfies RechargeLine[],
  };
}

/** XLM the platform hands over so a fan can open a fan-token trustline: exactly the reserve it locks. */
export const TRUST_RESERVE_XLM = "0.5";

/** BANDCOIN for some XLM at the live price plus the cushion (default: one swap's worth). */
export function quoteXlmSwap(
  input: Rates & { bandcoinBalance: string | null; networkFeeXlm: string; xlm?: string },
) {
  const problems = rateProblem(input);
  if (problems.length > 0)
    return {
      ok: false as const,
      problems,
      lines: [] as RechargeLine[],
      total: "0",
      receiveXlm: "0",
    };

  const xlm = toStroops(input.xlm ?? XLM_SWAP_AMOUNT);
  // Rounded up: the platform never gives XLM away below its price.
  const market = usdTo(toUsd(xlm, input.xlmUsd), input.bandcoinUsd);
  const margin = applyBps(market, XLM_SWAP_MARGIN_BPS);
  const total = market + margin;

  if (input.bandcoinBalance === null)
    problems.push({ code: "SIGN_IN", message: "Sign in to pay." });
  else {
    const have = toStroops(input.bandcoinBalance);
    if (have < total) {
      problems.push({
        code: "INSUFFICIENT_FUNDS",
        message: `You need ${toDisplay(total - have)} more BANDCOIN.`,
        shortfall: {
          currency: "BANDCOIN",
          need: toDisplay(total),
          have: toDisplay(have),
          short: toDisplay(total - have),
        },
      });
    }
  }
  return {
    ok: problems.length === 0,
    problems,
    total: toAmount(total),
    receiveXlm: toAmount(xlm),
    lines: [
      {
        key: "market",
        label: `${input.xlm ?? XLM_SWAP_AMOUNT} XLM at today's price`,
        currency: "BANDCOIN",
        amount: toDisplay(market),
      },
      {
        key: "margin",
        label: "Price cushion (2%)",
        currency: "BANDCOIN",
        amount: toDisplay(margin),
      },
      {
        key: "networkFee",
        label: "Network fee",
        currency: "XLM",
        amount: toDisplay(toStroops(input.networkFeeXlm)),
      },
      { key: "total", label: "You pay", currency: "BANDCOIN", amount: toDisplay(total) },
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
