"use client";

import { useSearchParams } from "next/navigation";

import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { ErrorState } from "@bandcoin/ui/patterns/error-state";
import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";

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
  if (pin.data) return <PinForm existing={pin.data} />;
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
