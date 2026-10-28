import type { Metadata } from "next";

import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";

import { CollectionView } from "~/features/collection/collection-view";

export const metadata: Metadata = { title: "My collection" };

export default function CollectionPage() {
  return (
    <PageBody wide className="grid gap-6">
      <PageHeader title="My collection" note="*everything you own, bought, gifted or claimed*" />
      <CollectionView />
    </PageBody>
  );
}
