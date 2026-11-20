"use client";

import { cn } from "@actiontokens/ui/lib/cn";
import { CurrencyIcon } from "@actiontokens/ui/patterns/currency-icon";

import { Money } from "~/components/money";
import type { DisplayCurrency } from "~/lib/format";

export const CURRENCIES: { value: DisplayCurrency; label: string }[] = [
  { value: "BANDCOIN", label: "BANDCOIN" },
  { value: "XLM", label: "XLM" },
  { value: "USDC", label: "USDC" },
  { value: "USD", label: "Card" },
];

/**
 * "Pay with": one tile per currency, with the fan's balance under each (or
 * "Debit or credit" for the card). Used by every payment screen in the fan app.
 */
export function CurrencyPicker({
  value,
  onChange,
  options = CURRENCIES,
  balances,
  disabled,
}: {
  value: DisplayCurrency;
  onChange: (currency: DisplayCurrency) => void;
  options?: { value: DisplayCurrency; label: string }[];
  /** Signed in: the fan's balances; otherwise each tile says "Stellar wallet" */
  balances?: Record<"BANDCOIN" | "XLM" | "USDC", string>;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-1.5">
      <span className="eyebrow">Pay with</span>
      <div role="group" aria-label="Currency" className="grid grid-cols-2 gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
            className={cn(
              "bg-surface-2 hover:border-border-strong grid min-w-0 gap-0.5 rounded-md border p-2.5 text-left transition-colors",
              option.value === value && "border-primary-text bg-primary-soft",
            )}
          >
            <b className="flex items-center gap-2 text-[13px]">
              <CurrencyIcon currency={option.value} />
              {option.label}
            </b>
            <span
              className={cn(
                "text-fg-muted truncate text-[11px]",
                balances && option.value !== "USD" && "num",
              )}
            >
              {option.value === "USD" ? (
                "Debit or credit"
              ) : balances ? (
                <>
                  Balance <Money amount={balances[option.value]} currency={option.value} />
                </>
              ) : (
                "Stellar wallet"
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
