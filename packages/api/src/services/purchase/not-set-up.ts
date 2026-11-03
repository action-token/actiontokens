import type { QuoteProblem } from "@bandcoin/chain/quote";

export const NOT_SET_UP_MESSAGE = "This artist hasn't finished setting up sales yet.";

/**
 * The artist's own sale can't happen until their side exists on Stellar: a
 * wallet to be paid into, and somewhere copies come from (stock in storage or
 * an active issuer). Resales and storage offers have their own messages.
 */
export function salesNotSetUp(sale: {
  primary: boolean;
  sellerOnChain: boolean;
  /** A copy can be delivered at all (on Stellar: stock or an issuer that can mint) */
  canDeliver: boolean;
}) {
  return sale.primary && (!sale.sellerOnChain || !sale.canDeliver);
}

/** Replaces the technical reasons with the one fans can act on (nothing, but they know why). */
export const notSetUpProblems = (): QuoteProblem[] => [
  { code: "NOT_SET_UP", message: NOT_SET_UP_MESSAGE },
];
