import type { ArSettings, Coords } from "@bandcoin/ar-core/ar/types";

/** Where the map opens without a GPS fix: New York, where the first demo artist's pins are. */
export const FALLBACK_CENTER: Coords = { lat: 40.7128, lng: -74.006 };

export const DEFAULT_SETTINGS: ArSettings = {
  autoCollect: false,
  followingOnly: false,
  haptics: true,
  sound: true,
  compassMode: false,
};

/** Boot-sequence status lines, the slowest-sounding one last. */
export const BOOT_LINES = [
  "Tuning up",
  "Calibrating compass",
  "Finding your spot",
  "Scanning for nearby drops",
  "Syncing your collection",
] as const;
