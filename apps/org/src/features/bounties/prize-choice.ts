import type { RouterOutputs } from "~/trpc/react";

type Sources = RouterOutputs["bounties"]["fundingSources"];
type Holdings = NonNullable<Sources["wallet"]>;
type PlatformCurrency = "ACTION" | "XLM" | "USDC";

/**
 * What the prize is paid in, as the form keeps it: a platform currency
 * ("ACTION", "XLM", "USDC") or any other token the artist holds, as
 * "CODE:ISSUER" (their fan token, for example), like the old Action Tokens allowed.
 */
export type PrizeKey = string;

export const PLATFORM_CURRENCIES: PlatformCurrency[] = ["ACTION", "XLM", "USDC"];

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

export type Source = "wallet" | "storage";
type PrizeOption = {
  key: PrizeKey;
  code: string;
  issuer: string | null;
  have?: string;
  fanToken: boolean;
};

/** One choice in "Paid in" picks both the token and where it comes from. */
export const choiceValue = (source: Source, key: PrizeKey) => `${source}|${key}`;
export function parseChoice(value: string): { source: Source; key: PrizeKey } {
  const [source, ...rest] = value.split("|");
  return { source: source === "storage" ? "storage" : "wallet", key: rest.join("|") };
}

const isSame = (
  token: { code: string; issuer: string } | null | undefined,
  code: string,
  issuer: string | null,
) => Boolean(token && issuer && token.code === code && token.issuer === issuer);

/** What one place holds as choices: the fan token first, then the platform currencies, then other tokens. */
function optionsOf(holdings: Holdings | null | undefined, fanToken: Sources["fanToken"]) {
  const all: PrizeOption[] = [
    ...PLATFORM_CURRENCIES.map((currency) => ({
      key: currency,
      code: currency,
      issuer: null,
      have: holdings?.[currency],
      fanToken: false,
    })),
    ...(holdings?.others ?? []).map((token) => ({
      key: tokenKey(token.code, token.issuer),
      code: token.code,
      issuer: token.issuer,
      have: token.amount,
      fanToken: isSame(fanToken, token.code, token.issuer),
    })),
  ];
  return [...all.filter((option) => option.fanToken), ...all.filter((option) => !option.fanToken)];
}

/**
 * "Paid in", grouped by where the prize comes from: the wallet, and storage
 * when it's open. The current choice stays listed even if that place no longer holds it.
 */
export function prizeGroups(
  sources: Sources | undefined,
  current: { source: Source; key: PrizeKey },
) {
  const places: { source: Source; label: string; holdings: Holdings | null | undefined }[] = [
    { source: "wallet", label: "Your wallet", holdings: sources?.wallet },
  ];
  if (sources?.storage || current.source === "storage")
    places.push({ source: "storage", label: "Your storage", holdings: sources?.storage });
  return places.map((place) => {
    const options = optionsOf(place.holdings, sources?.fanToken ?? null);
    if (place.source === current.source && !options.some((option) => option.key === current.key)) {
      const [code = current.key, issuer = null] = current.key.split(":");
      options.push({
        key: current.key,
        code,
        issuer,
        have: place.holdings ? "0" : undefined,
        fanToken: isSame(sources?.fanToken, code, issuer),
      });
    }
    return { ...place, options };
  });
}

export const shortIssuer = (issuer: string) => `${issuer.slice(0, 4)}…${issuer.slice(-4)}`;
