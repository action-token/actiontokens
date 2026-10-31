import type { RouterOutputs } from "~/trpc/react";

type Sources = RouterOutputs["bounties"]["fundingSources"];
type Holdings = NonNullable<Sources["wallet"]>;
type PlatformCurrency = "BANDCOIN" | "XLM" | "USDC";

/**
 * What the prize is paid in, as the form keeps it: a platform currency
 * ("BANDCOIN", "XLM", "USDC") or any other token the artist holds, as
 * "CODE:ISSUER" (their fan token, for example), like the old Bandcoin allowed.
 */
export type PrizeKey = string;

export const PLATFORM_CURRENCIES: PlatformCurrency[] = ["BANDCOIN", "XLM", "USDC"];

const isPlatform = (key: PrizeKey): key is PlatformCurrency =>
  (PLATFORM_CURRENCIES as string[]).includes(key);

export const tokenKey = (code: string, issuer: string): PrizeKey => `${code}:${issuer}`;

/** How the prize shows on screen: a currency with its icon, or a token by its code. */
export function prizeLabel(key: PrizeKey) {
  if (isPlatform(key)) return { currency: key, code: key };
  return { currency: null, code: key.split(":")[0] ?? key };
}

/** What the server is sent for this choice. */
export function prizeInput(key: PrizeKey) {
  if (isPlatform(key)) return { prizeCurrency: key };
  const [code = "", issuer = ""] = key.split(":");
  return { prizeAsset: { code, issuer } };
}

/** How much of it the chosen source holds; undefined while loading or without that source. */
export function heldOf(holdings: Holdings | null | undefined, key: PrizeKey) {
  if (!holdings) return undefined;
  if (isPlatform(key)) return holdings[key];
  const [code, issuer] = key.split(":");
  return (
    holdings.others.find((token) => token.code === code && token.issuer === issuer)?.amount ?? "0"
  );
}

type PrizeOption = { key: PrizeKey; code: string; issuer: string | null; have?: string };

/** The choices for "Paid in": the platform currencies, then every other token held, then the current one if it isn't held. */
export function prizeOptions(holdings: Holdings | null | undefined, current: PrizeKey) {
  const all: PrizeOption[] = [
    ...PLATFORM_CURRENCIES.map((currency) => ({
      key: currency,
      code: currency,
      issuer: null,
      have: holdings?.[currency],
    })),
    ...(holdings?.others ?? []).map((token) => ({
      key: tokenKey(token.code, token.issuer),
      code: token.code,
      issuer: token.issuer,
      have: token.amount,
    })),
  ];
  if (!all.some((option) => option.key === current)) {
    const [code = current, issuer = null] = current.split(":");
    all.push({ key: current, code, issuer, have: holdings ? "0" : undefined });
  }
  return all;
}

export const shortIssuer = (issuer: string) => `${issuer.slice(0, 4)}…${issuer.slice(-4)}`;
