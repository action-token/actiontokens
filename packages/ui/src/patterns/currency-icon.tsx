import { CreditCard } from "lucide-react";

import { cn } from "../lib/cn";

export type CurrencyIconName = "BANDCOIN" | "XLM" | "USDC" | "USD";

/** Bandcoin's coin icon (bandfan's public/asset/bandcoin.ico; source PNG in ../assets), inlined so every app can use it. */
const BANDCOIN_ICON = "data:image/png;base64,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";

/** The mark for each way to pay: the Bandcoin coin, Stellar's XLM, Circle's USDC, a card. */
export function CurrencyIcon({ currency, className }: { currency: CurrencyIconName; className?: string }) {
  const size = cn("size-5 shrink-0", className);
  switch (currency) {
    case "BANDCOIN":
      return <img src={BANDCOIN_ICON} alt="" aria-hidden className={cn(size, "scale-[1.3] object-contain")} />;
    case "XLM":
      return (
        <svg viewBox="0 0 32 32" aria-hidden className={size}>
          <circle cx="16" cy="16" r="16" fill="currentColor" className="text-fg" />
          <g fill="none" stroke="var(--color-bg, #fff)" strokeWidth="1.9" strokeLinecap="round">
            <path d="M24.2 10.6 8.4 18.7a7.8 7.8 0 0 1 12.8-8.9" />
            <path d="M7.8 21.4 23.6 13.3a7.8 7.8 0 0 1-12.8 8.9" />
            <path d="m6.6 18.9 18.8-9.6M6.6 22.7l18.8-9.6" />
          </g>
        </svg>
      );
    case "USDC":
      return (
        <svg viewBox="0 0 32 32" aria-hidden className={size}>
          <circle cx="16" cy="16" r="16" fill="#2775ca" />
          <path
            d="M19.6 17.9c0-1.9-1.1-2.5-3.4-2.8-1.6-.2-1.9-.7-1.9-1.4s.6-1.2 1.6-1.2c.9 0 1.5.3 1.7 1.1a.4.4 0 0 0 .4.3h.9a.4.4 0 0 0 .4-.4 2.8 2.8 0 0 0-2.5-2.3V10a.4.4 0 0 0-.4-.4h-.8a.4.4 0 0 0-.4.4v1.2c-1.6.2-2.6 1.3-2.6 2.6 0 1.8 1.1 2.4 3.4 2.7 1.5.3 2 .6 2 1.5s-.8 1.5-1.8 1.5c-1.4 0-1.9-.6-2-1.4a.4.4 0 0 0-.4-.3h-.9a.4.4 0 0 0-.4.4c.2 1.4 1.1 2.4 2.9 2.7V22a.4.4 0 0 0 .4.4h.8a.4.4 0 0 0 .4-.4v-1.2c1.6-.3 2.7-1.4 2.7-2.9Z"
            fill="#fff"
          />
          <path
            d="M13 25.8a10.3 10.3 0 0 1 0-19.6.5.5 0 0 0 .3-.5v-.9a.4.4 0 0 0-.5-.4 11.9 11.9 0 0 0 0 23.2.4.4 0 0 0 .5-.4v-.9a.6.6 0 0 0-.3-.5Zm6.5-21.4a.4.4 0 0 0-.5.4v.9a.6.6 0 0 0 .3.5 10.3 10.3 0 0 1 0 19.6.5.5 0 0 0-.3.5v.9a.4.4 0 0 0 .5.4 11.9 11.9 0 0 0 0-23.2Z"
            fill="#fff"
          />
        </svg>
      );
    case "USD":
      return <CreditCard aria-hidden className={size} />;
  }
}
