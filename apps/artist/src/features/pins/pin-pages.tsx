"use client";

import { useSearchParams } from "next/navigation";

import { Skeleton } from "@actiontokens/ui/components/skeleton";
import { ErrorState } from "@actiontokens/ui/patterns/error-state";
import { useFormCard } from "@actiontokens/ui/patterns/form-card";
import { PageBody, PageHeader } from "@actiontokens/ui/patterns/page-header";

import { api } from "~/trpc/react";

import { PinForm } from "./pin-form";

/** A new pin: blank, or (?duplicate=<pinId>) starting from another pin's settings. */
export function NewPinView() {
  const duplicate = useSearchParams()?.get("duplicate") ?? "";
  const source = api.pins.pin.useQuery({ pinId: duplicate }, { enabled: duplicate !== "" });
  if (duplicate && source.isPending)
    return (
      <PageBody className="grid gap-6">
        <PageHeader back={{ href: "/pins", label: "Pins" }} eyebrow="Fans" title="New pin" />
        <Skeleton className="h-96 w-full max-w-2xl rounded-xl" />
      </PageBody>
    );
  // A pin that can't be read is no reason to block a new one: start blank.
  return <PinForm key={source.data?.id ?? "blank"} copyOf={source.data} />;
}

export function EditPinView({ pinId }: { pinId: string }) {
  const pin = api.pins.pin.useQuery({ pinId });
  const card = useFormCard();
  if (pin.data) return <PinForm existing={pin.data} />;
  // In a map card: a plain placeholder, not a whole page.
  if (card)
    return pin.isPending ? (
      <Skeleton className="h-96 w-full rounded-[1.2rem]" />
    ) : (
      <ErrorState message="Couldn't load this pin." onRetry={() => void pin.refetch()} />
    );
  return (
    <PageBody className="grid gap-6">
      <PageHeader back={{ href: "/pins", label: "Pins" }} eyebrow="Fans" title="Edit pin" />
      {pin.isPending ? (
        <Skeleton className="h-96 w-full max-w-2xl rounded-xl" />
      ) : pin.error.data?.code === "NOT_FOUND" ? (
        <ErrorState message="This pin doesn't exist." />
      ) : (
        <ErrorState message="Couldn't load this pin." onRetry={() => void pin.refetch()} />
      )}
    </PageBody>
  );
}
