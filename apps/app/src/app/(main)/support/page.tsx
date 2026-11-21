import type { Metadata } from "next";

import { SupportView } from "~/features/info/support-view";

export const metadata: Metadata = {
  title: "Support",
  description: "Contact Action Tokens support, sales, press or report a bug.",
};

export default function SupportPage() {
  return <SupportView />;
}
