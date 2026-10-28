import type { Metadata } from "next";
import { Suspense } from "react";

import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";

import { MarketplaceView } from "~/features/marketplace/marketplace-view";

export const metadata: Metadata = {
  title: "Marketplace",
  description: "Music, artwork, tickets and fan tokens from the artists you love.",
};

export default function MarketplacePage() {
  return (
    <PageBody wide className="grid gap-6">
      <PageHeader title="Marketplace" description="Music, artwork, tickets and fan tokens, straight from the artists." />
      <Suspense>
        <MarketplaceView />
      </Suspense>
    </PageBody>
  );
}
