/**
 * The fan-token reward amount: how many tokens each fan gets per collect, and
 * whether storage holds enough for every fan the pin allows. Rewards come out
 * of storage, so a short storage doesn't block saving; claims just wait until
 * the artist adds more.
 */
const AMOUNT = /^\d{1,12}(\.\d{1,7})?$/;

const tokens = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 7 });

/** Why the typed amount can't be saved, or null. Empty means one token. */
export function amountProblem(text: string) {
  const typed = text.trim();
  if (typed === "") return null;
  if (!AMOUNT.test(typed) || Number(typed) <= 0)
    return "Enter how many tokens each fan gets, above zero, with up to 7 decimals.";
  return null;
}

/** What the whole pin can give away against what storage holds; null when there's nothing to say. */
export function storageNote(input: {
  amount: string;
  claimLimit: string;
  code: string;
  /** null = storage isn't open, so tokens are made when fans claim */
  inStorage: string | null;
}) {
  if (input.inStorage === null) return null;
  const each = Number(input.amount.trim() || "1");
  const fans = Number(input.claimLimit) || 0;
  const held = Number(input.inStorage);
  const holds = `Your storage holds ${tokens(held)} ${input.code}.`;
  if (!(each > 0) || fans < 1) return { short: false, text: holds };
  const total = each * fans;
  if (total <= held)
    return {
      short: false,
      text: `${holds} This pin gives up to ${tokens(total)} ${input.code}.`,
    };
  return {
    short: true,
    text: `${holds} This pin can give up to ${tokens(total)} ${input.code}, so claims will wait once storage runs out. Add more under Settings › Balances.`,
  };
}
