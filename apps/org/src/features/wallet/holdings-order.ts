/** How many storage holdings the sidebar card lists before "and n more". */
export const SIDEBAR_PREVIEW = 3;
/** How many holdings a Wallet page card lists before "Show all". */
export const PAGE_PREVIEW = 10;

type Kind = "xlm" | "bandcoin" | "usdc" | "fanToken" | "other";
type Holding = { amount: string; kind?: Kind };

const byAmount = (a: Holding, b: Holding) => Number(b.amount) - Number(a.amount);
const rank = (order: Kind[]) => (holding: Holding) => {
  const at = order.indexOf(holding.kind ?? "other");
  return at === -1 ? order.length : at;
};

/** Storage: your fan token, then BANDCOIN, then the rest by amount. */
export function orderStorage<T extends Holding>(holdings: T[]): T[] {
  const of = rank(["fanToken", "bandcoin"]);
  return [...holdings].sort((a, b) => of(a) - of(b) || byAmount(a, b));
}

/** The main wallet: BANDCOIN, XLM, USDC, your fan token, then the rest by amount. */
export function orderMain<T extends Holding>(holdings: T[]): T[] {
  const of = rank(["bandcoin", "xlm", "usdc", "fanToken"]);
  return [...holdings].sort((a, b) => of(a) - of(b) || byAmount(a, b));
}

/** The sidebar: the first few storage holdings with something in them, and how many more. */
export function storagePreview<T extends Holding>(holdings: T[]) {
  const held = orderStorage(holdings).filter((holding) => Number(holding.amount) > 0);
  return {
    shown: held.slice(0, SIDEBAR_PREVIEW),
    more: Math.max(0, held.length - SIDEBAR_PREVIEW),
  };
}

/** A Wallet page card: the first 10, or all of them, and how many "Show all" adds. */
export function pageList<T>(holdings: T[], all: boolean) {
  return {
    shown: all ? holdings : holdings.slice(0, PAGE_PREVIEW),
    hidden: Math.max(0, holdings.length - PAGE_PREVIEW),
  };
}
