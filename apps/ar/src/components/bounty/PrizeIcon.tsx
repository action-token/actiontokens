import { CurrencyIcon, type CurrencyIconName } from "@actiontokens/ui/patterns/currency-icon";

/**
 * The prize's currency icon, or, for a prize in another token (say an
 * artist's fan token), its code in the same spot.
 */
export function PrizeIcon({
  prize,
  className,
}: {
  prize: { currency: CurrencyIconName | null; code: string };
  className?: string;
}) {
  if (prize.currency) return <CurrencyIcon currency={prize.currency} className={className} />;
  return <span className="text-[0.75em] tracking-wide">{prize.code}</span>;
}
