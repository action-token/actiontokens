import type { Metadata } from "next";
import { Suspense } from "react";

import { PageBody, PageHeader } from "@actiontokens/ui/patterns/page-header";

import { BountiesView } from "~/features/bounty/bounties-view";

export const metadata: Metadata = {
  title: "Bounties",
  description:
    "Discover challenges, complete tasks, and earn rewards from the organizations you love.",
};

export default function BountiesPage() {
  return (
    <PageBody wide className="grid gap-6">
      <PageHeader title="Bounties" note="*discover challenges, complete tasks, and earn rewards*" />
      <Suspense>
        <BountiesView />
      </Suspense>
    </PageBody>
  );
}
