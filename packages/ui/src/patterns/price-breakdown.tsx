import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../lib/cn";

export type BreakdownLine = {
  label: string;
  /** Small second line under the label, e.g. "2 × 25,000". */
  detail?: ReactNode;
  /** Already formatted, e.g. "50,000 BANDCOIN". Several lines allowed. */
  value: ReactNode;
};

export type BreakdownBalance = {
  /** The balance in the paying currency, already formatted. */
  value: ReactNode;
  /** The shortfall, already formatted. Empty when the balance covers it. */
  shortBy?: ReactNode;
};

/**
 * Every payment shows this before signing: each cost line, the total and the
 * buyer's balance. Amounts come formatted from the server quote; this
 * component never does money math.
 */
export function PriceBreakdown({
  lines,
  total,
  balance,
  className,
}: {
  lines: BreakdownLine[];
  total: ReactNode;
  balance?: BreakdownBalance;
  className?: string;
}) {
  return (
    <dl aria-live="polite" className={cn("grid border-t pt-3 text-sm", className)}>
      {lines.map((line) => (
        <Row key={line.label} label={line.label} detail={line.detail} value={line.value} />
      ))}
      <Row label="You pay" value={total} className="border-border-strong mt-1.5 border-t border-dashed pt-2.5 font-semibold [&_dd]:text-[15px] [&_dd]:text-fg" />
      {balance && (
        <Row
          label="Your balance"
          value={
            balance.shortBy ? (
              <span className="inline-flex flex-wrap items-center justify-end gap-1">
                {balance.value} · {balance.shortBy} short
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">{balance.value} ✓</span>
            )
          }
          className={balance.shortBy ? "[&_dd]:text-danger" : "[&_dd]:text-success"}
        />
      )}
    </dl>
  );
}

function Row({
  label,
  detail,
  value,
  className,
}: {
  label: string;
  detail?: ReactNode;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-1.5", className)}>
      <dt className="text-fg-muted">
        {label}
        {detail && <small className="text-fg-faint block text-xs">{detail}</small>}
      </dt>
      <dd className="num text-right text-[13px]">{value}</dd>
    </div>
  );
}

/** Shown under the breakdown when the chosen currency can't cover the total. Never offers a swap. */
export function ShortfallNotice({ currency, shortBy }: { currency: string; shortBy: ReactNode }) {
  return (
    <div role="alert" className="bg-danger-soft grid grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-md p-3 text-[13px]">
      <CircleAlert className="text-danger mt-px size-[18px]" />
      <p>
        <b>Not enough {currency}</b>
        <br />
        You need {shortBy} more. Add funds, lower the quantity, or pick another currency. We never convert
        your other tokens for you.
      </p>
    </div>
  );
}
