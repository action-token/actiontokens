import { applyBps, toAmount, toDisplay, toStroops, toUsd, usdTo } from "../money";

/**
 * Subscribing: a trustline to an artist's fan token, which locks 0.5 XLM in
 * the fan's wallet (refundable when they remove it). Paid four ways (plan 33):
 *
 *   ACTION, USDC  the 0.5 XLM at today's price + the 2% cushion, paid to the
 *                   platform, which sends the XLM; the platform fee on top
 *   XLM             the fan's own 0.5 XLM is locked; only the platform fee is paid
 *   USD (card)      the XLM (and a ACTION line's when one is opened) and the
 *                   network fee at today's price + the fee, never under $1.00;
 *                   what's left of the charge arrives as ACTION
 *
 * Pure, like the other quotes: the server feeds rates and balances in.
 */
export type TrustCurrency = "ACTION" | "USDC" | "XLM" | "USD";

/** XLM a fan-token trustline locks (and a ACTION line, for card subscribers who need one). */
export const TRUST_RESERVE_XLM = "0.5";
/** Cushion on what the platform hands over at a live rate, as on every swap. */
export const TRUST_CUSHION_BPS = 200;
/** The least a card is charged to subscribe. */
export const TRUST_CARD_MINIMUM_USD = "1.00";

const RESERVE = toStroops(TRUST_RESERVE_XLM);
const CENT = 100_000n;

export type TrustLine = {
  key: string;
  label: string;
  currency: "USD" | "ACTION" | "XLM" | "USDC";
  amount: string;
};

export type TrustProblem =
  | { code: "SIGN_IN"; message: string }
  | { code: "RATE_UNAVAILABLE"; message: string }
  | {
      code: "INSUFFICIENT_FUNDS";
      message: string;
      shortfall: { currency: TrustCurrency; need: string; have: string; short: string };
    };

export type TrustQuoteInput = {
  currency: TrustCurrency;
  /** USD per unit, as stroops (0 = unknown) */
  xlmUsd: bigint;
  actionTokenUsd: bigint;
  usdcUsd: bigint;
  /** Admin › Settings platform fee */
  feeBps: number;
  networkFeeXlm: string;
  /** Spendable balances; null when signed out */
  funds: Record<"ACTION" | "USDC" | "XLM", string> | null;
  /** Card only: the wallet already holds ACTION, so the rest needs no new line */
  hasActionTokenLine: boolean;
};

export type TrustQuote = {
  ok: boolean;
  problems: TrustProblem[];
  currency: TrustCurrency;
  lines: TrustLine[];
  /** What the fan pays in `currency` (USD for card), price + fee */
  total: string;
  /** To the platform for the XLM it sends (ACTION, USDC) */
  platformPays: string;
  /** The platform fee, in `currency` */
  fee: string;
  /** XLM the platform sends the fan (0 when paying in XLM) */
  sendXlm: string;
  /** Card: ACTION sent with what's left of the charge, and whether its line is opened */
  card: { extraActionToken: string; openActionTokenLine: boolean } | null;
};

const empty = (currency: TrustCurrency, problems: TrustProblem[]): TrustQuote => ({
  ok: false,
  problems,
  currency,
  lines: [],
  total: "0",
  platformPays: "0",
  fee: "0",
  sendXlm: "0",
  card: null,
});

function shortOf(currency: TrustCurrency, need: bigint, have: bigint): TrustProblem {
  return {
    code: "INSUFFICIENT_FUNDS",
    message: `You need ${toDisplay(need - have)} more ${currency}.`,
    shortfall: {
      currency,
      need: toDisplay(need),
      have: toDisplay(have),
      short: toDisplay(need - have),
    },
  };
}

export function quoteFanTokenTrust(input: TrustQuoteInput): TrustQuote {
  const { currency } = input;
  const needed = [input.xlmUsd, ...(currency === "XLM" ? [] : [input.actionTokenUsd])];
  if (currency === "USDC") needed.push(input.usdcUsd);
  if (needed.some((rate) => rate <= 0n))
    return empty(currency, [
      { code: "RATE_UNAVAILABLE", message: "Couldn't load today's prices. Try again in a moment." },
    ]);

  const feeLabel = `Platform fee (${input.feeBps / 100} %)`;
  const networkFee = toStroops(input.networkFeeXlm);
  const networkLine: TrustLine = {
    key: "networkFee",
    label: "Network fee",
    currency: "XLM",
    amount: toDisplay(networkFee),
  };
  const reserveLine: TrustLine = {
    key: "reserve",
    label: "Fan token line (refundable)",
    currency: "XLM",
    amount: TRUST_RESERVE_XLM,
  };

  if (currency === "USD")
    return quoteByCard(input, { feeLabel, networkFee, networkLine, reserveLine });

  const problems: TrustProblem[] = [];
  if (!input.funds) problems.push({ code: "SIGN_IN", message: "Sign in to subscribe." });

  if (currency === "XLM") {
    const fee = applyBps(RESERVE, input.feeBps);
    const total = RESERVE + fee + networkFee;
    if (input.funds && toStroops(input.funds.XLM) < total)
      problems.push(shortOf("XLM", total, toStroops(input.funds.XLM)));
    return {
      ok: problems.length === 0,
      problems,
      currency,
      total: toAmount(fee),
      platformPays: "0",
      fee: toAmount(fee),
      sendXlm: "0",
      card: null,
      lines: [
        { ...reserveLine, label: "Fan token line, from your XLM (refundable)" },
        { key: "platformFee", label: feeLabel, currency: "XLM", amount: toDisplay(fee) },
        networkLine,
        { key: "total", label: "You pay", currency: "XLM", amount: toDisplay(fee) },
      ],
    };
  }

  // ACTION or USDC: the platform sells the XLM at today's price, cushioned.
  const unitUsd = currency === "ACTION" ? input.actionTokenUsd : input.usdcUsd;
  const market = usdTo(toUsd(RESERVE, input.xlmUsd), unitUsd);
  const cushion = applyBps(market, TRUST_CUSHION_BPS);
  const fee = applyBps(market + cushion, input.feeBps);
  const total = market + cushion + fee;
  if (input.funds && toStroops(input.funds[currency]) < total)
    problems.push(shortOf(currency, total, toStroops(input.funds[currency])));
  return {
    ok: problems.length === 0,
    problems,
    currency,
    total: toAmount(total),
    platformPays: toAmount(market + cushion),
    fee: toAmount(fee),
    sendXlm: TRUST_RESERVE_XLM,
    card: null,
    lines: [
      {
        key: "market",
        label: `${TRUST_RESERVE_XLM} XLM at today's price`,
        currency,
        amount: toDisplay(market),
      },
      { key: "margin", label: "Price cushion (2%)", currency, amount: toDisplay(cushion) },
      { key: "platformFee", label: feeLabel, currency, amount: toDisplay(fee) },
      networkLine,
      { key: "total", label: "You pay", currency, amount: toDisplay(total) },
    ],
  };
}

function quoteByCard(
  input: TrustQuoteInput,
  shared: { feeLabel: string; networkFee: bigint; networkLine: TrustLine; reserveLine: TrustLine },
): TrustQuote {
  const minimum = toStroops(TRUST_CARD_MINIMUM_USD);
  const roundUpToCent = (usd: bigint) => ((usd + CENT - 1n) / CENT) * CENT;

  // Priced first with a new ACTION line when the wallet has none; if nothing
  // would be left over for ACTION, the line isn't worth opening.
  const price = (openLine: boolean) => {
    const xlm = RESERVE * (openLine ? 2n : 1n) + shared.networkFee;
    const costUsd = toUsd(xlm, input.xlmUsd);
    const feeUsd = applyBps(costUsd, input.feeBps);
    const charge = roundUpToCent(costUsd + feeUsd > minimum ? costUsd + feeUsd : minimum);
    // Rounded down: the fan is never sent more than the charge covers.
    const extra = ((charge - costUsd - feeUsd) * 10_000_000n) / input.actionTokenUsd;
    return { openLine, costUsd, feeUsd, charge, extra };
  };
  let priced = price(!input.hasActionTokenLine);
  if (priced.openLine && priced.extra <= 0n) priced = price(false);
  const sendActionToken = priced.extra > 0n && (input.hasActionTokenLine || priced.openLine);
  const sendXlm = RESERVE * (priced.openLine ? 2n : 1n);

  const lines: TrustLine[] = [shared.reserveLine];
  if (priced.openLine)
    lines.push({
      key: "actionTokenReserve",
      label: "ACTION line (refundable)",
      currency: "XLM",
      amount: TRUST_RESERVE_XLM,
    });
  lines.push(shared.networkLine);
  lines.push({
    key: "platformFee",
    label: shared.feeLabel,
    currency: "USD",
    amount: toDisplay(priced.feeUsd),
  });
  if (sendActionToken)
    lines.push({
      key: "extra",
      label: "Card minimum: the rest as ACTION",
      currency: "ACTION",
      amount: toDisplay(priced.extra),
    });
  lines.push({ key: "total", label: "You pay", currency: "USD", amount: toDisplay(priced.charge) });

  const problems: TrustProblem[] = input.funds
    ? []
    : [{ code: "SIGN_IN", message: "Sign in to subscribe." }];
  return {
    ok: problems.length === 0,
    problems,
    currency: "USD",
    total: toAmount(priced.charge),
    platformPays: "0",
    fee: toAmount(priced.feeUsd),
    sendXlm: toAmount(sendXlm),
    card: {
      extraActionToken: sendActionToken ? toAmount(priced.extra) : "0",
      openActionTokenLine: priced.openLine && sendActionToken,
    },
    lines,
  };
}
