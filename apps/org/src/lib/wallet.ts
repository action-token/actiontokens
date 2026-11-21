type HistoryStatus =
  "SUBMITTED" | "CONFIRMED" | "DELIVERED" | "FAILED" | "REFUNDED" | (string & {});

export function statusLabel(status: HistoryStatus) {
  switch (status) {
    case "DELIVERED":
    case "CONFIRMED":
      return "Done";
    case "SUBMITTED":
      return "Sending";
    case "FAILED":
      return "Failed";
    case "REFUNDED":
      return "Refunded";
    default:
      return "Pending";
  }
}

export function statusTone(status: HistoryStatus) {
  switch (status) {
    case "DELIVERED":
    case "CONFIRMED":
      return "success" as const;
    case "FAILED":
      return "danger" as const;
    case "REFUNDED":
      return "neutral" as const;
    default:
      return "warning" as const;
  }
}

/** A wallet token's currency for `Money`: XLM, ACTION and USDC show their icon, other tokens a plain number. */
export const CURRENCY = { xlm: "XLM", actionToken: "ACTION", usdc: "USDC", other: null } as const;
