import type { Metadata } from "next";
import { Suspense } from "react";

import { PageBody } from "@actiontokens/ui/patterns/page-header";

import { WalletView } from "~/features/wallet/wallet-view";

export const metadata: Metadata = {
  title: "Wallet",
  description: "Your balances, what you've paid and received, and what you own.",
};

export default function WalletPage() {
  return (
    <PageBody wide className="grid gap-6">
      <h1 className="sr-only">Wallet</h1>
      <Suspense>
        <WalletView />
      </Suspense>
    </PageBody>
  );
}
