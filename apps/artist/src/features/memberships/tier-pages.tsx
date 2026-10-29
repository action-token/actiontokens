"use client";

import Link from "next/link";

import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";
import { ErrorState } from "@bandcoin/ui/patterns/error-state";
import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";
import { Crown } from "lucide-react";

import { api } from "~/trpc/react";

import { TierForm } from "./tier-form";

const BACK = { href: "/memberships", label: "Memberships" };

/** Both tier pages need the fan token's code, and a tier can't exist without the token. */
function WithToken({ children }: { children: (code: string) => React.ReactNode }) {
  const token = api.memberships.fanToken.useQuery();
  if (token.isPending) return <Skeleton className="h-96 w-full max-w-2xl rounded-xl" />;
  if (token.isError) return <ErrorState message="Couldn't load your fan token." onRetry={() => void token.refetch()} />;
  if (token.data === null)
    return (
      <EmptyState
        icon={Crown}
        title="Create your fan token first"
        description="Tiers are based on holding your fan token."
        action={
          <Button asChild>
            <Link href="/memberships">Set up the token</Link>
          </Button>
        }
      />
    );
  return <>{children(token.data.code)}</>;
}

export function NewTierView() {
  return (
    <PageBody className="grid gap-6">
      <PageHeader back={BACK} eyebrow="Fans" title="New tier" description="Fans are in a tier while they hold enough of your fan token." />
      <WithToken>{(code) => <TierForm tokenCode={code} />}</WithToken>
    </PageBody>
  );
}

export function EditTierView({ tierId }: { tierId: string }) {
  const tiers = api.memberships.tiers.useQuery();
  const tier = tiers.data?.find((row) => row.id === tierId);
  return (
    <PageBody className="grid gap-6">
      <PageHeader back={BACK} eyebrow="Fans" title={tier?.name ?? "Edit tier"} />
      {tiers.isPending ? (
        <Skeleton className="h-96 w-full max-w-2xl rounded-xl" />
      ) : tiers.isError ? (
        <ErrorState message="Couldn't load this tier." onRetry={() => void tiers.refetch()} />
      ) : !tier ? (
        <ErrorState message="This tier doesn't exist." />
      ) : (
        <WithToken>{(code) => <TierForm existing={tier} tokenCode={code} />}</WithToken>
      )}
    </PageBody>
  );
}
