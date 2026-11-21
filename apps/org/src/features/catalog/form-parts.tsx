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
export const priceProblems = (actionToken: string, usd: string) => ({
  actionToken: actionToken ? validatePrice(actionToken) : null,
  usd: usd ? validatePrice(usd) : null,
});

/** The two prices an artist sets: ACTION and USD (the card price). Nothing converts one into the other. */
export function PriceFields({
  actionToken,
  usd,
  onActionToken,
  onUsd,
  idPrefix,
}: {
  actionToken: string;
  usd: string;
  onActionToken: (value: string) => void;
  onUsd: (value: string) => void;
  idPrefix: string;
}) {
  const problems = priceProblems(actionToken, usd);
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field
        label="Price in ACTION"
        htmlFor={`${idPrefix}-actionToken`}
        error={problems.actionToken}
      >
        <Input
          id={`${idPrefix}-actionToken`}
          inputMode="decimal"
          value={actionToken}
          aria-invalid={Boolean(problems.actionToken)}
          onChange={(event) => onActionToken(event.target.value.trim())}
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
