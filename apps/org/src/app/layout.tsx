import "~/styles/globals.css";

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { sharedThemeSeedScript } from "@actiontokens/ui/lib/shared-theme";

import { deckFonts } from "~/features/shell/landing-fonts";

import { Providers } from "./providers";

export const metadata: Metadata = {
  title: {
    default: "Action-Tokens Organization Portal",
    template: "%s · Action-Tokens Organization Portal",
  },
  description: "Run your music, collectibles, pins and bounties on Action Tokens.",
  robots: { index: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
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
        {/* The theme the other Action Tokens sites chose, in place before the first paint. */}
        <script dangerouslySetInnerHTML={{ __html: sharedThemeSeedScript("theme") }} />
      </head>
      <body className={deckFonts}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
