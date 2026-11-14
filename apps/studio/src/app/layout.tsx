import "~/styles/globals.css";

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { sharedThemeSeedScript } from "@bandcoin/ui/lib/shared-theme";

import { StudioShell } from "~/features/shell/studio-shell";

import { Providers } from "./providers";

export const metadata: Metadata = {
  title: { default: "Bandcoin Studio", template: "%s · Bandcoin Studio" },
  description: "Make images, music, video and words with AI, paid with Studio coins.",
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
        {/* The theme the other Bandcoin sites chose, in place before the first paint. */}
        <script dangerouslySetInnerHTML={{ __html: sharedThemeSeedScript("theme") }} />
      </head>
      <body>
        <Providers>
          <StudioShell>{children}</StudioShell>
        </Providers>
      </body>
    </html>
  );
}
