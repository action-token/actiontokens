import { validatePrice } from "@actiontokens/utils/asset-code";

/** A page-asset offer as the form edits it. */
export type OfferDraft = {
  amount: string;
  priceActionToken: string;
  priceUsd: string;
  priceXlm: string;
  note: string;
};

const AMOUNT = /^\d{1,12}(\.\d{1,7})?$/;

/**
 * What's wrong with each field, once something's typed; `ready` when it can be
 * saved. The amount can't be more than storage can still offer (`free`); the
 * server checks it again.
 */
export function offerProblems(draft: OfferDraft, free: string | null) {
  const amount = draft.amount.trim();
  const problems: Partial<Record<keyof OfferDraft, string>> = {};
  if (amount && (!AMOUNT.test(amount) || Number(amount) <= 0))
    problems.amount = "Enter how many tokens, above zero.";
  else if (amount && free !== null && Number(amount) > Number(free))
    problems.amount = `Storage can offer ${Number(free).toLocaleString("en-US")} more.`;
  for (const key of ["priceActionToken", "priceUsd", "priceXlm"] as const) {
    if (draft[key].trim()) {
      const problem = validatePrice(draft[key].trim());
      if (problem) problems[key] = problem;
    }
  }
  if (draft.note.trim().length > 500) problems.note = "Keep it to 500 characters.";
  const filled =
    amount !== "" &&
    draft.priceActionToken !== "" &&
    draft.priceUsd !== "" &&
    draft.priceXlm !== "";
  return { problems, ready: filled && Object.keys(problems).length === 0 };
}
