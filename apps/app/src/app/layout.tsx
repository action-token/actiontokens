import "~/styles/globals.css";

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { sharedThemeSeedScript } from "@bandcoin/ui/lib/shared-theme";

import { Providers } from "./providers";

export const metadata: Metadata = {
  title: { default: "Bandcoin: own the music you love", template: "%s · Bandcoin" },
  description: "Buy, collect and stream music from the artists you love, on Stellar.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0c1112" },
    { media: "(prefers-color-scheme: light)", color: "#f5f7f6" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: next-themes sets data-theme before hydration.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* The theme the other Bandcoin sites chose, in place before the first paint. */}
        <script dangerouslySetInnerHTML={{ __html: sharedThemeSeedScript("theme") }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
