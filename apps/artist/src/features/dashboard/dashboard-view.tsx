"use client";

import { Ban, BadgeCheck, Hourglass, Mic2, Rocket } from "lucide-react";
import Link from "next/link";

import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";
import { ErrorState } from "@bandcoin/ui/patterns/error-state";
import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";
import { useConnectWalletDialogStore } from "@bandcoin/wallet";

import { usePortal } from "~/features/portal/use-portal";

/** The portal's home. What it shows depends on how far this person is (see portal.status). */
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
      return (
        <PageBody>
          <PageHeader eyebrow="Artists" title="Become an artist" description="Open your own issuer on Stellar so every song and collectible you release is yours." />
          <div className="mt-8">
            <EmptyState
              icon={Rocket}
              title="Start your application"
              description="Pick your artist name, then pay a one-time 1.5 XLM to open your issuer account. An admin reviews it after that."
              action={
                <Button asChild>
                  <Link href="/apply">Apply</Link>
                </Button>
              }
            />
          </div>
        </PageBody>
      );
    case "OPEN_ISSUER":
      return (
        <PageBody>
          <PageHeader eyebrow={portal.artist?.name} title="Open your issuer" description="One payment of 1.5 XLM opens the Stellar account your music is issued from." />
          <div className="mt-8">
            <EmptyState
              icon={Rocket}
              title="Last step before review"
              description="You see the exact price before you pay."
              action={
                <Button asChild>
                  <Link href="/apply">Continue</Link>
                </Button>
              }
            />
          </div>
        </PageBody>
      );
    case "WAITING_FOR_APPROVAL":
      return (
        <PageBody>
          <PageHeader eyebrow={portal.artist?.name} title="Waiting for approval" description="Your issuer is open. An admin is reviewing your page." />
          <div className="mt-8">
            <EmptyState icon={Hourglass} title="You're in the queue" description="Nothing else to do. Your tools unlock here as soon as you're approved." />
          </div>
        </PageBody>
      );
    case "BANNED":
      return (
        <PageBody>
          <EmptyState icon={Ban} title="This artist page is suspended" description="Contact support if you think this is a mistake." />
        </PageBody>
      );
    case "READY":
      return (
        <PageBody>
          <PageHeader eyebrow="Artist portal" title={`Welcome, ${portal.artist?.name}`} description="Your tools will appear here as they are ready." />
          <div className="mt-8">
            <EmptyState icon={BadgeCheck} title="You're approved" description="Catalog, music, pins and bounties arrive next." />
          </div>
        </PageBody>
      );
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
