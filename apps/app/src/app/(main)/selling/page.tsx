import type { Metadata } from "next";

import { PageBody, PageHeader } from "@actiontokens/ui/patterns/page-header";

import { SellingView } from "~/features/resale/selling-view";

export const metadata: Metadata = { title: "Selling" };

export default function SellingPage() {
  return (
    <PageBody wide className="grid gap-6">
      <PageHeader title="Selling" note="*copies you've listed, and what sold*" />
      <SellingView />
    </PageBody>
  );
}
