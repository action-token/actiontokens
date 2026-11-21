"use client";

import { useTheme } from "next-themes";
import { useEffect } from "react";

import { isSharedTheme, onTabReturn, readSharedTheme, writeSharedTheme } from "../lib/shared-theme";

/**
 * Keeps a `next-themes` app in step with the other Action Tokens sites (mount it inside the
 * `ThemeProvider`). The seed script has already applied the shared cookie on load; this takes
 * over afterwards: the app's choice is written to the cookie (once, for a device that only had it
 * locally), and when the tab comes back into view a change made on another site is applied here.
 */
export function SharedThemeSync() {
  const { theme, setTheme } = useTheme();

  // This app's choice goes to the cookie.
  useEffect(() => {
    if (isSharedTheme(theme)) writeSharedTheme(theme);
  }, [theme]);

  // A change made on another site is picked up when this tab comes back.
  useEffect(
    () =>
      onTabReturn(() => {
        const shared = readSharedTheme();
        if (shared && shared !== theme) setTheme(shared);
      }),
    [theme, setTheme],
  );

  return null;
}
