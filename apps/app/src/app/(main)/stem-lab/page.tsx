import type { Metadata } from "next";

import { PageBody, PageHeader } from "@actiontokens/ui/patterns/page-header";

import { StemLab } from "~/features/stems/stem-lab";

export const metadata: Metadata = {
  title: "Stem lab",
  description: "Try a stem player: mix a song's parts live.",
  robots: { index: false },
};

export default function StemLabPage() {
  return (
    <PageBody wide className="grid gap-6">
      <PageHeader title="Stem lab" note="*a test bench: mix a song's parts, live*" />
      <StemLab />
    </PageBody>
  );
}
