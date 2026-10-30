import type { Metadata } from "next";

import { AboutView } from "~/features/info/about-view";

export const metadata: Metadata = {
  title: "About",
  description: "What Bandcoin is, for artists and fans.",
};

export default function AboutPage() {
  return <AboutView />;
}
