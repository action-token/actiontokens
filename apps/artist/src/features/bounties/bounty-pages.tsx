"use client";

import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { ErrorState } from "@bandcoin/ui/patterns/error-state";
import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";

import { api } from "~/trpc/react";

import { BountyForm } from "./bounty-form";

export const NewBountyView = ({ kind }: { kind?: "general" | "music" }) => (
  <BountyForm kind={kind} />
);

export function EditBountyView({ bountyId }: { bountyId: string }) {
  const bounty = api.bounties.get.useQuery({ bountyId });
  if (bounty.data) return <BountyForm existing={bounty.data} />;
  return (
    <PageBody className="grid gap-6">
      <PageHeader
        back={{ href: `/bounties/${bountyId}`, label: "Bounty" }}
        eyebrow="Fans"
        title="Edit bounty"
      />
      {bounty.isPending ? (
        <Skeleton className="h-96 w-full max-w-2xl rounded-xl" />
      ) : (
        <ErrorState
          message={bounty.error?.message ?? "Couldn't load this bounty."}
          onRetry={() => void bounty.refetch()}
        />
      )}
    </PageBody>
  );
}
