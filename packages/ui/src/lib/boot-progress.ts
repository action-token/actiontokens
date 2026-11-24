/** What the first paint waits on, and how much of the loader's counter each one fills. */
export interface BootSignals {
  /** Webfonts are in (`document.fonts.ready`). */
  fonts: boolean;
  /** React has hydrated the page. */
  hydrated: boolean;
  /** next-auth knows whether someone is signed in. */
  session: boolean;
  /** The page's first queries have settled. */
  data: boolean;
}

export const BOOT_WEIGHTS: Record<keyof BootSignals, number> = {
  fonts: 0.25,
  hydrated: 0.2,
  session: 0.2,
  data: 0.35,
};

/** 0 to 1: the share of the boot work that is done. */
export function bootProgress(signals: BootSignals): number {
  let total = 0;
  for (const key of Object.keys(BOOT_WEIGHTS) as (keyof BootSignals)[]) {
    if (signals[key]) total += BOOT_WEIGHTS[key];
  }
  return Math.min(1, Math.round(total * 1000) / 1000);
}
