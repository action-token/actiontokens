import type { Metadata } from "next";

import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";

import { ArtistsView } from "~/features/artists/artists-view";

export const metadata: Metadata = {
  title: "Artists",
  description:
    "Discover the artists on Bandcoin: follow them, hear their music, collect their drops.",
};

export default function ArtistsPage() {
  return (
    <PageBody wide className="grid gap-6">
      <PageHeader title="Artists" note="*the people making the music, art and drops*" />
      <ArtistsView />
    </PageBody>
  );
}
