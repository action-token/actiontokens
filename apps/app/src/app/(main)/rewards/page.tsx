import type { Metadata } from "next";
import { Suspense } from "react";

import { PageBody, PageHeader } from "@actiontokens/ui/patterns/page-header";

import { RewardsView } from "~/features/rewards/rewards-view";

export const metadata: Metadata = {
  title: "Reward checker",
  description: "What the holder reward rounds owe or paid a wallet, and how it stands this round.",
};

export default function RewardsPage() {
  return (
    <PageBody className="grid gap-6">
      <PageHeader title="Reward checker" note="*hold it, get paid for it*" />
      <Suspense>
        <RewardsView />
      </Suspense>
    </PageBody>
  );
}
