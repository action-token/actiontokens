import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { site } from "@actiontokens/ar-core/site";
import { createMapPrefs } from "@actiontokens/map/prefs";
import { mapStyleFor } from "@actiontokens/map/style";
import {
  onTabReturn,
  readSharedTheme,
  writeSharedTheme,
  type SharedTheme,
} from "@actiontokens/ui/lib/shared-theme";

/**
 * ── Theme ──────────────────────────────────────────────────────────────────
 *
 * Light/dark for the whole app — see the big doc comment at the top of
 * `arcade.css` for the full picture (why it exists, why `.dark` and not a
 * bespoke attribute, why the palettes aren't literal inversions of each
 * other). This file is the runtime half: where the choice is stored, how
 * "auto" resolves, and the hook the settings toggle drives.
 *
 * The other half is the inline script in app/layout.tsx — it has
 * to duplicate `STORAGE_KEY` and the resolve logic as a literal string,
 * since it runs before any module (this one included) has loaded. Keep the
 * two in sync by hand if either changes; there's no way to share the source
 * between a bundled module and a pre-hydration inline script without a build
 * step dedicated to it, which is a lot of machinery for four lines of logic.
 */

/** "contrast" is high contrast: a dark palette with pure black, pure white and heavier outlines. */
export type ThemePreference = "auto" | "light" | "dark" | "contrast";
/** What the page is drawn in. Maps only know light and dark: see `useResolvedTheme`. */
export type AppliedTheme = "light" | "dark" | "contrast";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "bandcoin-ar-theme";

/** The two `theme-color` values — see the matching hex in app/layout.tsx. */
const THEME_COLOR: Record<AppliedTheme, string> = {
  dark: site.colors.themeDark,
  light: site.colors.themeLight,
  contrast: "#000000",
};

/**
 * ── Map style: 2D / 3D, map type, terrain ─────────────────────────────────
 *
 * The styles, the stored choices and how a style URL is picked are shared with the artist portal
 * (`@actiontokens/map`); AR keeps its own saved choices under `bandcoin-ar-map-*`. Every map in the
 * app follows them, so flipping 2D/3D on the main map also applies to directions, a collected
 * card's mini-map and the embed.
 */
export {
  isStandardStyle,
  MAP_BASE_LABEL,
  MAP_BASES,
  mapStyleFor,
  type MapBase,
  type MapMode,
} from "@actiontokens/map/style";
export { storedChoice } from "@actiontokens/map/prefs";

const prefs = createMapPrefs("bandcoin-ar");

export const MAP_MODE_STORAGE_KEY = prefs.keys.mode;
export const useMapBase = prefs.useMapBase;
export const setMapBase = prefs.setMapBase;
/** Hill shading and contours over the map. */
export const useMapTerrain = prefs.useMapTerrain;
export const setMapTerrain = prefs.setMapTerrain;
export const setMapMode = prefs.setMapMode;
/** The shared 2D/3D choice. "2d" on the server and until hydrated, like `useResolvedTheme`. */
export const useMapMode = prefs.useMapMode;

/** The style URL for the live mode, theme and map type. */
export function useMapStyle(): string {
  const mode = useMapMode();
  const theme = useResolvedTheme();
  const base = useMapBase();
  return mapStyleFor(mode, theme, base);
}

function isThemePreference(value: unknown): value is ThemePreference {
  return value === "auto" || value === "light" || value === "dark" || value === "contrast";
}

/** With nothing chosen yet the app is dark, its home look. Safe against SSR and blocked storage. */
export const DEFAULT_THEME: ThemePreference = "dark";

export function readStoredPreference(): ThemePreference {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(raw) ? raw : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/**
 * The theme is shared with the other Bandcoin sites through a cookie (`@actiontokens/ui/lib/shared-theme`),
 * whose word for "auto" is "system".
 */
export const toShared = (pref: ThemePreference): SharedTheme =>
  pref === "auto" ? "system" : pref === "contrast" ? "dark" : pref;
export const fromShared = (theme: SharedTheme): ThemePreference =>
  theme === "system" ? "auto" : theme;

function writeStoredPreference(pref: ThemePreference) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // Private-browsing quota, or storage disabled entirely. The choice just
    // won't survive a reload — no worse than not having this feature at all,
    // and not worth surfacing an error over.
  }
}


/**
 * "auto" resolved against the OS: "more contrast" wins, then a light system theme; otherwise dark.
 * Keep in step with the boot script in app/layout.tsx.
 */
export function resolveTheme(pref: ThemePreference): AppliedTheme {
  if (pref !== "auto") return pref;
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "dark";
  if (window.matchMedia("(prefers-contrast: more)").matches) return "contrast";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/** Apply a theme to the document: `.dark` (dark and high contrast), `.hc` (high contrast),
 * `data-theme` (shared components, which know only light and dark) and the `theme-color` meta.
 * Everything else repaints on its own, because every colour is a token away from these classes. */
export function applyTheme(theme: AppliedTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", theme !== "light");
  root.classList.toggle("hc", theme === "contrast");
  root.setAttribute("data-theme", theme === "light" ? "light" : "dark");

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_COLOR[theme]);
}

/**
 * Just "which theme is live right now", for things CSS can't reach.
 *
 * Mapbox is the reason this exists: its basemap is a style URL chosen in JS,
 * not a colour a token can repaint, so a map has to actually *know* the theme
 * to swap `dark-v11` for `light-v11`.
 *
 * Observes the `dark` class on `<html>` rather than reading the stored
 * preference, deliberately. That class is the single thing every other part of
 * this system already agrees on — the boot script sets it, `useTheme` sets it,
 * the OS listener sets it — so watching it works no matter which of those
 * moved last, and needs no second copy of the preference/`matchMedia` logic.
 * Several components can call this freely; each just holds one
 * `MutationObserver`, not another listener stack.
 *
 * Starts as "dark" on the server and on first render, matching the
 * `class="dark"` that app/layout.tsx server-renders — so the markup React
 * hydrates against is the markup it rendered, and the effect corrects it
 * immediately after if the real theme is light.
 */
export function useResolvedTheme(): ResolvedTheme {
  const [theme, setTheme] = useState<ResolvedTheme>("dark");

  useEffect(() => {
    const read = (): ResolvedTheme =>
      document.documentElement.classList.contains("dark") ? "dark" : "light";

    setTheme(read());

    const observer = new MutationObserver(() => setTheme(read()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  return theme;
}

/**
 * True once the real theme has been read from `<html>`. `useResolvedTheme`
 * answers "dark" until its effect runs, so a map created straight away starts
 * on the dark style and is swapped to the light one mid-load, which makes
 * Mapbox Standard throw ("reading 'get'" in addImages). Maps wait for this.
 */
export function useThemeRead(): boolean {
  const [read, setRead] = useState(false);
  useEffect(() => setRead(true), []);
  return read;
}

/**
 * Reads and writes the theme preference, applying it as it changes.
 *
 * Deliberately does *not* apply anything on its first render — the inline
 * boot script in app/layout.tsx already did, before this component or any
 * other ever mounted, which is what keeps first paint from flashing the
 * wrong theme. This hook's own effects only need to handle what happens
 * *after* that: the settings toggle calling `setPreference`, and — while the
 * preference is "auto" — the OS theme changing live under a session that's
 * already open.
 */
export function useTheme() {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);
  const [resolved, setResolved] = useState<AppliedTheme>(() => resolveTheme(preference));

  const setPreference = useCallback((pref: ThemePreference) => {
    setPreferenceState(pref);
    writeStoredPreference(pref);
    writeSharedTheme(toShared(pref));
    const next = resolveTheme(pref);
    setResolved(next);
    applyTheme(next);
  }, []);

  // A change picked up from another Bandcoin site (see `useSharedThemeSync`).
  useEffect(() => {
    const onChange = () => {
      const pref = readStoredPreference();
      setPreferenceState(pref);
      setResolved(resolveTheme(pref));
    };
    themeListeners.add(onChange);
    return () => {
      themeListeners.delete(onChange);
    };
  }, []);

  // Follow the OS live while — and only while — nothing's been chosen
  // explicitly. A manual "light" or "dark" is a deliberate override; the
  // system changing its mind shouldn't quietly undo it.
  useEffect(() => {
    if (preference !== "auto" || typeof window === "undefined") return;
    if (typeof window.matchMedia !== "function") return;

    const queries = ["(prefers-color-scheme: light)", "(prefers-contrast: more)"].map((q) =>
      window.matchMedia(q),
    );
    const onChange = () => {
      const next = resolveTheme("auto");
      setResolved(next);
      applyTheme(next);
    };
    queries.forEach((mql) => mql.addEventListener("change", onChange));
    return () => queries.forEach((mql) => mql.removeEventListener("change", onChange));
  }, [preference]);

  return { preference, resolved, setPreference };
}

const themeListeners = new Set<() => void>();

/**
 * Keeps the theme in step with the other Bandcoin sites (mounted once, in the shell layout). The
 * seed script already applied the shared cookie on load; this takes over afterwards: the stored
 * choice is written to the cookie once (an older device that only had it in localStorage), and
 * when the tab comes back into view a change made on another site is applied here.
 */
export function useSharedThemeSync() {
  useEffect(() => {
    if (!readSharedTheme()) writeSharedTheme(toShared(readStoredPreference()));
    return onTabReturn(() => {
      const shared = readSharedTheme();
      if (!shared) return;
      const pref = fromShared(shared);
      // High contrast is shared as "dark"; another site saying "dark" leaves it alone.
      if (toShared(readStoredPreference()) === shared) return;
      writeStoredPreference(pref);
      applyTheme(resolveTheme(pref));
      themeListeners.forEach((listener) => listener());
    });
  }, []);
}
