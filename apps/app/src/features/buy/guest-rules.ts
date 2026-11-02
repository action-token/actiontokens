/** Good enough to ask for a price; the server has the last word on the address. */
export const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

/** The first total of a quote, to compare what was shown with what the order locked in. */
export const sameTotal = (
  shown: { amount: string }[] | undefined,
  locked: { amount: string }[] | undefined,
) => Number(shown?.[0]?.amount) === Number(locked?.[0]?.amount);

/**
 * What a failed payment means for the Pay button. A lost network response may
 * still have landed, so that order stays open for the worker and paying again
 * could charge twice. Every other failure has settled, so paying again is safe.
 */
export const mustNotPayAgain = (appCode: string | null | undefined) =>
  appCode === "STELLAR_TX_SUBMIT_FAILED";
