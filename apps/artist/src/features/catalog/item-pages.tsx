"use client";

import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { ErrorState } from "@bandcoin/ui/patterns/error-state";
import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";

import { api } from "~/trpc/react";

import { ItemForm } from "./item-form";

export const NewItemView = () => <ItemForm />;

export function EditItemView({ itemId }: { itemId: string }) {
  const item = api.catalog.get.useQuery({ itemId });
  if (item.data) return <ItemForm existing={item.data} />;
  return (
    <PageBody className="grid gap-6">
      <PageHeader back={{ href: "/items", label: "Items" }} eyebrow="Catalog" title="Edit item" />
      {item.isPending ? <Skeleton className="h-96 w-full max-w-2xl rounded-xl" /> : <ErrorState message={item.error?.message ?? "Couldn't load this item."} onRetry={() => void item.refetch()} />}
    </PageBody>
  );
}
