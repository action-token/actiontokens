"use client";

import { Ban, Mic2 } from "lucide-react";
import { redirect } from "next/navigation";

import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";
import { ErrorState } from "@bandcoin/ui/patterns/error-state";
import { PageBody } from "@bandcoin/ui/patterns/page-header";
import { useConnectWalletDialogStore } from "@bandcoin/wallet";

import { WaitingView } from "~/features/onboarding/waiting-view";
import { OnboardingWizard } from "~/features/onboarding/wizard/onboarding-wizard";
import { usePortal } from "~/features/portal/use-portal";

/** The portal's home, for everyone who isn't an approved artist yet (see portal.status). Approved artists land on the pins map. */
export function DashboardView() {
  const portal = usePortal();
  const openDialog = useConnectWalletDialogStore((state) => state.setIsOpen);

  if (portal.loading) return <DashboardSkeleton />;
  if (portal.error) {
    return (
      <PageBody>
        <ErrorState message="Couldn't load your artist status. Check your connection and try again." />
      </PageBody>
    );
  }

  if (!portal.signedIn) {
    return (
      <PageBody>
        <EmptyState
          icon={Mic2}
          title="Run your music on Bandcoin"
          description="Sell songs and collectibles, set up memberships, drop pins and bounties, and keep every payout. Sign in with your wallet to begin."
          action={<Button onClick={() => openDialog(true)}>Sign in</Button>}
        />
      </PageBody>
    );
  }

  switch (portal.step) {
    case null:
    case "OPEN_ISSUER":
      return (
        <PageBody>
          <OnboardingWizard paying={portal.step === "OPEN_ISSUER"} />
        </PageBody>
      );
    case "REJECTED":
      return (
        <PageBody className="grid gap-6">
          <div
            role="note"
            className="bg-danger-soft mx-auto w-full max-w-5xl rounded-xl p-4 text-sm"
          >
            <b>Your application wasn&apos;t approved.</b> Your 1.5 XLM was returned to your wallet.
            {portal.artist?.rejectionReason && <> Why: {portal.artist.rejectionReason}</>} Change
            what you need and send it again.
          </div>
          <OnboardingWizard paying={false} />
        </PageBody>
      );
    case "WAITING_FOR_APPROVAL":
      return (
        <PageBody>
          <WaitingView />
        </PageBody>
      );
    case "BANNED":
      return (
        <PageBody>
          <EmptyState
            icon={Ban}
            title="This artist page is suspended"
            description="Contact support if you think this is a mistake."
          />
        </PageBody>
      );
    case "READY":
      // Approved artists have no home page of their own: they start on the map, like Wadzzo's brand portal.
      return redirect("/pins");
  }
}

function DashboardSkeleton() {
  return (
    <PageBody>
      <Skeleton className="h-9 w-64" />
      <Skeleton className="mt-3 h-4 w-96 max-w-full" />
      <Skeleton className="mt-8 h-64 w-full rounded-xl" />
    </PageBody>
  );
}
