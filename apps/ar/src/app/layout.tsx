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
  title: { default: "ActionTokens AR: collect the real world", template: "%s · ActionTokens AR" },
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
 * ActionTokens AR is dark only (docs/PLAN.md §12.2): whatever theme was stored before,
 * the page stays dark, with both `.dark` (arcade palette) and `data-theme` set.
 */
const themeBootScript = `
(function () {
  try {
    document.documentElement.classList.add("dark");
    document.documentElement.setAttribute("data-theme", "dark");
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
