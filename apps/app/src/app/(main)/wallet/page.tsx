import type { Metadata } from "next";
import { Suspense } from "react";

import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";

import { WalletView } from "~/features/wallet/wallet-view";

export const metadata: Metadata = {
  title: "Wallet",
  description: "Your balances, what you've paid and received, and what you own.",
};

export default function WalletPage() {
  return (
    <PageBody className="grid gap-6">
      <PageHeader title="Wallet" note="*your balances, history and what you own*" />
      <Suspense>
        <WalletView />
      </Suspense>
    </PageBody>
  );
}
