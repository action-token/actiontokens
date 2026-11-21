import "mapbox-gl/dist/mapbox-gl.css";
import "~/styles/globals.css";
// After globals, so the arcade palette wins on equal specificity.
import "~/styles/arcade.css";
// After arcade, so the ActionTokens sticker language replaces its console primitives.
import "~/styles/sticker.css";
// Last: the light and high-contrast palettes.
import "~/styles/themes.css";

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { site } from "@actiontokens/ar-core/site";

import { SHARED_THEME_COOKIE } from "@actiontokens/ui/lib/shared-theme";

import { fontVariables } from "~/lib/fonts";
import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
  title: { default: "Action-Tokens AR: collect the real world", template: "%s · Action-Tokens AR" },
  description:
    "Walk to pins organizations dropped around the city, collect them in AR and keep the rewards.",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent" },
};

// viewport-fit=cover makes env(safe-area-inset-*) real on notched phones;
// maximumScale stops iOS zooming the UI when a field takes focus.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: site.colors.themeDark,
};

/**
 * Applies the saved theme before first paint, so the page never flashes the wrong one. Dark,
 * light or high contrast (lib/ar/theme.ts holds the same logic for after hydration; keep the two
 * in step). The key is `THEME_STORAGE_KEY` there. The shared cookie (one choice across the ActionTokens sites) wins when it says
 * something different, except that high contrast is shared as "dark" and stays as it is.
 */
const themeBootScript = `
(function () {
  try {
    var key = "actiontokens-ar-theme";
    var pref = null;
    try { pref = localStorage.getItem(key); } catch (e) {}
    if (["auto", "light", "dark", "contrast"].indexOf(pref) < 0) pref = "dark";
    var m = document.cookie.match(/(?:^|;\\s*)${SHARED_THEME_COOKIE}=(light|dark|system)(?:;|$)/);
    if (m) {
      var shared = m[1] === "system" ? "auto" : m[1];
      var mine = pref === "contrast" ? "dark" : pref;
      if (shared !== mine) {
        pref = shared;
        try { localStorage.setItem(key, pref); } catch (e) {}
      }
    }
    var mq = function (q) { return window.matchMedia && window.matchMedia(q).matches; };
    var theme = pref;
    if (pref === "auto") {
      theme = mq("(prefers-contrast: more)") ? "contrast" : mq("(prefers-color-scheme: light)") ? "light" : "dark";
    }
    var root = document.documentElement;
    root.classList.toggle("dark", theme !== "light");
    root.classList.toggle("hc", theme === "contrast");
    root.setAttribute("data-theme", theme === "light" ? "light" : "dark");
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "light" ? ${JSON.stringify(site.colors.themeLight)} : theme === "contrast" ? "#000000" : ${JSON.stringify(site.colors.themeDark)});
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The boot script may change the theme before hydration.
    <html lang="en" className={`dark ${fontVariables}`} data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="bg-ar-void">
        <TRPCReactProvider>{children}</TRPCReactProvider>
      </body>
    </html>
  );
}
