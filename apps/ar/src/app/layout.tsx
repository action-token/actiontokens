import { sharedThemeSeedScript } from "@actiontokens/ui/lib/shared-theme";
import "mapbox-gl/dist/mapbox-gl.css";
import "~/styles/globals.css";
// After globals, so the arcade palette wins on equal specificity.
import "~/styles/arcade.css";

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { site } from "@actiontokens/ar-core/site";

import { fontVariables } from "~/lib/fonts";
import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
  title: { default: "Bandcoin AR: collect the real world", template: "%s · Bandcoin AR" },
  description:
    "Walk to pins your favourite artists dropped around the city, collect them in AR and keep the rewards.",
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
 * Applies the stored theme before the first paint. It runs before any bundle
 * loads, so it repeats `THEME_STORAGE_KEY` and the "auto" rule from
 * lib/ar/theme.ts as a literal string. Dark is server-rendered; this only
 * switches to light, setting both `.dark` (arcade palette) and `data-theme`
 * (shared Bandcoin components).
 */
const themeBootScript = `
(function () {
  try {
    var v = localStorage.getItem("bandcoin-ar-theme");
    var pref = v === "light" || v === "dark" ? v : "auto";
    var light = pref === "light" || (pref === "auto" && window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches);
    if (light) {
      document.documentElement.classList.remove("dark");
      document.documentElement.setAttribute("data-theme", "light");
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", ${JSON.stringify(site.colors.themeLight)});
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The boot script may change the theme before hydration.
    <html lang="en" className={`dark ${fontVariables}`} data-theme="dark" suppressHydrationWarning>
      <head>
        {/* The theme the other Bandcoin sites chose goes into this app's own key first. */}
        <script
          dangerouslySetInnerHTML={{
            __html: sharedThemeSeedScript("bandcoin-ar-theme", { system: "auto" }),
          }}
        />
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="bg-ar-void">
        <TRPCReactProvider>{children}</TRPCReactProvider>
      </body>
    </html>
  );
}
