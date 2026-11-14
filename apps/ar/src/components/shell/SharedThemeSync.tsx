"use client";

import { useSharedThemeSync } from "~/lib/ar/theme";

/** Keeps the theme in step with the other Bandcoin sites (see `useSharedThemeSync`). Renders nothing. */
export function SharedThemeSync() {
  useSharedThemeSync();
  return null;
}
