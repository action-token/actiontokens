"use client";

import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { ErrorState } from "@bandcoin/ui/patterns/error-state";
import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";

import { api } from "~/trpc/react";

import { HotspotForm } from "./hotspot-form";

export const NewHotspotView = () => <HotspotForm />;

export function EditHotspotView({ hotspotId }: { hotspotId: string }) {
  const hotspot = api.hotspots.hotspot.useQuery({ hotspotId }, { retry: false });
  if (hotspot.data)
    return <HotspotForm key={hotspot.data.updatedAt.toString()} existing={hotspot.data} />;
  return (
    <PageBody className="grid gap-6">
      <PageHeader back={{ href: "/hotspots", label: "Hotspots" }} eyebrow="Drops" title="Hotspot" />
      {hotspot.isPending ? (
        <Skeleton className="h-96 w-full max-w-3xl rounded-xl" />
      ) : (
        <ErrorState
          message={hotspot.error?.message ?? "This hotspot doesn't exist."}
          onRetry={() => void hotspot.refetch()}
        />
      )}
    </PageBody>
  );
}
