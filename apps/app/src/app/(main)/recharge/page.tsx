import type { Metadata } from "next";
import { Suspense } from "react";

import { PageBody, PageHeader } from "@actiontokens/ui/patterns/page-header";

import { RechargeView } from "~/features/recharge/recharge-view";

export const metadata: Metadata = {
  title: "Recharge",
  description: "Add ACTION with a card, or get 1 XLM for your wallet.",
};

export default function RechargePage() {
  return (
    <PageBody className="grid gap-6">
      <PageHeader title="Recharge" note="*add ACTION with a card, or get XLM for your wallet*" />
      <Suspense>
        <RechargeView />
      </Suspense>
    </PageBody>
  );
}
