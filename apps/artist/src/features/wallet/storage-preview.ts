/** How many storage holdings the sidebar card lists before "and n more". */
export const STORAGE_PREVIEW = 3;

/** What the sidebar card lists from storage: the first few with something in them, and how many more. */
export function storagePreview<T extends { amount: string }>(holdings: T[]) {
  const held = holdings.filter((holding) => Number(holding.amount) > 0);
  return {
    shown: held.slice(0, STORAGE_PREVIEW),
    more: Math.max(0, held.length - STORAGE_PREVIEW),
  };
}
