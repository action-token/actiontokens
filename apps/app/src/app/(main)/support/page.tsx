import type { Metadata } from "next";

import { SupportView } from "~/features/info/support-view";

export const metadata: Metadata = {
  title: "Support",
  description: "Contact Bandcoin support, sales, press or report a bug.",
};

export default function SupportPage() {
  return <SupportView />;
}
