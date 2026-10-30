import type { Metadata } from "next";

import { PrivacyView } from "~/features/info/privacy-view";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "How Bandcoin collects, uses and protects your information.",
};

export default function PrivacyPage() {
  return <PrivacyView />;
}
