import type { Metadata } from "next";

import { AboutView } from "~/features/info/about-view";

export const metadata: Metadata = {
  title: "About",
  description: "What Action Tokens is, for artists and fans.",
};

export default function AboutPage() {
  return <AboutView />;
}
