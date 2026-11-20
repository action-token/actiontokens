"use client";

import { Crown } from "lucide-react";
import Link from "next/link";

import { Button } from "@actiontokens/ui/components/button";
import { Skeleton } from "@actiontokens/ui/components/skeleton";
import { EmptyState } from "@actiontokens/ui/patterns/empty-state";
import { ErrorState } from "@actiontokens/ui/patterns/error-state";
import { PageBody, PageHeader } from "@actiontokens/ui/patterns/page-header";

import { api } from "~/trpc/react";

import { TierForm } from "./tier-form";

const BACK = { href: "/memberships", label: "Memberships" };

/** Both tier pages need the fan token's code, and a tier can't exist without the token. */
function WithToken({
  title,
  children,
}: {
  title: string;
  children: (code: string) => React.ReactNode;
}) {
  const token = api.memberships.fanToken.useQuery();
  if (token.data) return <>{children(token.data.code)}</>;
  return (
    <PageBody className="grid gap-6">
      <PageHeader back={BACK} eyebrow="Fans" title={title} />
      {token.isPending ? (
        <Skeleton className="h-96 w-full max-w-2xl rounded-xl" />
      ) : token.isError ? (
        <ErrorState message="Couldn't load your fan token." onRetry={() => void token.refetch()} />
      ) : (
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
      )}
    </PageBody>
  );
}

export const NewTierView = () => (
  <WithToken title="New tier">{(code) => <TierForm tokenCode={code} />}</WithToken>
);

export function EditTierView({ tierId }: { tierId: string }) {
  const tiers = api.memberships.tiers.useQuery();
  const tier = tiers.data?.find((row) => row.id === tierId);
  if (!tier) {
    return (
      <PageBody className="grid gap-6">
        <PageHeader back={BACK} eyebrow="Fans" title="Edit tier" />
        {tiers.isPending ? (
          <Skeleton className="h-96 w-full max-w-2xl rounded-xl" />
        ) : tiers.isError ? (
          <ErrorState message="Couldn't load this tier." onRetry={() => void tiers.refetch()} />
        ) : (
          <ErrorState message="This tier doesn't exist." />
        )}
      </PageBody>
    );
  }
  return (
    <WithToken title={tier.name}>
      {(code) => <TierForm existing={tier} tokenCode={code} />}
    </WithToken>
  );
}
