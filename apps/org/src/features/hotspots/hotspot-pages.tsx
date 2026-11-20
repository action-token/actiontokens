"use client";

import { Skeleton } from "@actiontokens/ui/components/skeleton";
import { ErrorState } from "@actiontokens/ui/patterns/error-state";
import { useFormCard } from "@actiontokens/ui/patterns/form-card";
import { PageBody, PageHeader } from "@actiontokens/ui/patterns/page-header";

import { api } from "~/trpc/react";

import { HotspotForm } from "./hotspot-form";

export const NewHotspotView = () => <HotspotForm />;

export function EditHotspotView({ hotspotId }: { hotspotId: string }) {
  const hotspot = api.hotspots.hotspot.useQuery({ hotspotId }, { retry: false });
  const card = useFormCard();
  if (hotspot.data)
    return <HotspotForm key={hotspot.data.updatedAt.toString()} existing={hotspot.data} />;
  // In a map card: a plain placeholder, not a whole page.
  if (card)
    return hotspot.isPending ? (
      <Skeleton className="h-96 w-full rounded-[1.2rem]" />
    ) : (
      <ErrorState
        message={hotspot.error?.message ?? "This hotspot doesn't exist."}
        onRetry={() => void hotspot.refetch()}
      />
    );
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
