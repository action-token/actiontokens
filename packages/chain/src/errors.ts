import { AppError, type ErrorCode, ErrorCodes } from "@bandcoin/errors";

type ResultCodes = { transaction?: string; operations?: string[] };

/** Stellar result codes → the AppError the UI shows a plain message for. */
const CODE_MAP: [RegExp, ErrorCode, string][] = [
  [
    /underfunded|insufficient_balance|low_reserve/,
    ErrorCodes.STELLAR_INSUFFICIENT_BALANCE,
    "There isn't enough balance for that.",
  ],
  [
    /no_trust|not_authorized/,
    ErrorCodes.STELLAR_TRUSTLINE_MISSING,
    "A wallet in this payment can't hold that asset yet.",
  ],
  [
    /no_destination|no_source_account|no_issuer/,
    ErrorCodes.STELLAR_ACCOUNT_NOT_FOUND,
    "An account in this payment isn't active on Stellar.",
  ],
  [
    /tx_too_late/,
    ErrorCodes.STELLAR_QUOTE_EXPIRED,
    "That price expired. Review the new price and try again.",
  ],
  [
    /tx_bad_seq/,
    ErrorCodes.RESOURCE_CONFLICT,
    "Your wallet sent another transaction at the same time. Try again.",
  ],
  [
    /line_full/,
    ErrorCodes.STELLAR_TX_REJECTED,
    "The receiving wallet can't hold any more of this asset.",
  ],
  [
    /too_many_subentries/,
    ErrorCodes.STELLAR_TX_REJECTED,
    "This wallet holds too many assets. Remove one you don't use.",
  ],
];

/** Pulls the result codes out of whatever the SDK threw (Horizon 400 bodies). */
export function resultCodesOf(error: unknown): ResultCodes | null {
  const data = (error as { response?: { data?: { extras?: { result_codes?: ResultCodes } } } })
    ?.response?.data;
  return data?.extras?.result_codes ?? null;
}

/** A failed submission as an AppError with a message a person can act on. */
export function toStellarError(error: unknown): AppError {
  const codes = resultCodesOf(error);
  if (!codes) {
    return new AppError(ErrorCodes.STELLAR_TX_SUBMIT_FAILED, { cause: error });
  }
  const all = [codes.transaction ?? "", ...(codes.operations ?? [])].filter(
    (code) => code && code !== "op_success",
  );
  for (const [pattern, code, message] of CODE_MAP) {
    if (all.some((resultCode) => pattern.test(resultCode))) {
      return new AppError(code, { message, details: { resultCodes: codes }, cause: error });
    }
  }
  return new AppError(ErrorCodes.STELLAR_TX_REJECTED, {
    details: { resultCodes: codes },
    cause: error,
  });
}
