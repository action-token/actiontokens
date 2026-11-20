import type { Metadata } from "next";
import { Suspense } from "react";

import { PageBody, PageHeader } from "@actiontokens/ui/patterns/page-header";

import { CollectionTabs } from "~/features/collection/collection-tabs";

export const metadata: Metadata = { title: "My collection" };

export default function CollectionPage() {
  return (
    <PageBody wide className="grid gap-6">
      <PageHeader title="My collection" note="*everything you own, bought, gifted or claimed*" />
      <Suspense>
        <CollectionTabs />
      </Suspense>
    </PageBody>
  );
}
