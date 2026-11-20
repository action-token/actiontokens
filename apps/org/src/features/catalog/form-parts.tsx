import type { ReactNode } from "react";

import { Input } from "@actiontokens/ui/components/input";
import { cn } from "@actiontokens/ui/lib/cn";
import { Field } from "@actiontokens/ui/patterns/form-page";
import { validatePrice } from "@actiontokens/utils/asset-code";

export { Field };

export const Note = ({ children }: { children: ReactNode }) => (
  <p className="text-fg-faint text-xs">{children}</p>
);

export function Toggle({
  pressed,
  disabled,
  onClick,
  children,
}: {
  pressed: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "h-9 rounded-full border px-3 text-sm font-medium transition-colors disabled:opacity-60",
        pressed
          ? "bg-primary text-primary-foreground border-fg"
          : "text-fg-muted hover:bg-surface-2",
      )}
    >
      {children}
    </button>
  );
}

/** What is wrong with the two prices, if anything: empty until the artist has typed something. */
export const priceProblems = (bandcoin: string, usd: string) => ({
  bandcoin: bandcoin ? validatePrice(bandcoin) : null,
  usd: usd ? validatePrice(usd) : null,
});

/** The two prices an artist sets: BANDCOIN and USD (the card price). Nothing converts one into the other. */
export function PriceFields({
  bandcoin,
  usd,
  onBandcoin,
  onUsd,
  idPrefix,
}: {
  bandcoin: string;
  usd: string;
  onBandcoin: (value: string) => void;
  onUsd: (value: string) => void;
  idPrefix: string;
}) {
  const problems = priceProblems(bandcoin, usd);
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field label="Price in BANDCOIN" htmlFor={`${idPrefix}-bandcoin`} error={problems.bandcoin}>
        <Input
          id={`${idPrefix}-bandcoin`}
          inputMode="decimal"
          value={bandcoin}
          aria-invalid={Boolean(problems.bandcoin)}
          onChange={(event) => onBandcoin(event.target.value.trim())}
        />
      </Field>
      <Field label="Price in USD (card price)" htmlFor={`${idPrefix}-usd`} error={problems.usd}>
        <Input
          id={`${idPrefix}-usd`}
          inputMode="decimal"
          value={usd}
          aria-invalid={Boolean(problems.usd)}
          onChange={(event) => onUsd(event.target.value.trim())}
        />
      </Field>
      <p className="text-fg-faint text-xs sm:col-span-2">
        You set both prices yourself. Nothing is converted between them.
      </p>
    </div>
  );
}
