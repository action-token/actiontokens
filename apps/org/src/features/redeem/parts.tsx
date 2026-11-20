"use client";

import { useQuery } from "@tanstack/react-query";
import { Landmark, MapPin, PartyPopper } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@actiontokens/ui/components/button";
import { cn } from "@actiontokens/ui/lib/cn";
import { Spinner } from "@actiontokens/ui/patterns/spinner";

import { placeName } from "~/features/pins/mapbox";

/** Small pieces the redeem screens share. */

export const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString()} ${n === 1 ? one : many}`;
export const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong.";

/** Where a spot is, as a name when Mapbox knows one and as coordinates otherwise. */
export function PlaceLabel({ latitude, longitude }: { latitude: number; longitude: number }) {
  const name = useQuery({
    queryKey: ["place-name", latitude.toFixed(5), longitude.toFixed(5)],
    queryFn: ({ signal }) => placeName({ lat: latitude, lng: longitude }, signal),
    staleTime: Infinity,
  });
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <MapPin className="size-3 shrink-0" />
      <span className="truncate">
        {name.data ?? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`}
      </span>
    </span>
  );
}

export function TypeIcon({ type, className }: { type?: string | null; className?: string }) {
  const Icon = type === "EVENT" ? PartyPopper : type === "LANDMARK" ? Landmark : MapPin;
  return (
    <span
      className={cn(
        "bg-primary/10 text-primary-text flex size-10 shrink-0 items-center justify-center rounded-md",
        className,
      )}
    >
      <Icon className="size-4" />
    </span>
  );
}

export function FanAvatar({
  fan,
  className,
}: {
  fan: { name: string | null; image: string | null; email: string | null };
  className?: string;
}) {
  return fan.image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={fan.image}
      alt=""
      className={cn("size-9 shrink-0 rounded-full object-cover", className)}
    />
  ) : (
    <span
      className={cn(
        "bg-primary/10 text-primary-text flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
        className,
      )}
    >
      {(fan.name ?? fan.email ?? "?").slice(0, 1).toUpperCase()}
    </span>
  );
}

export function LoadMore({
  query,
}: {
  query: { hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => unknown };
}) {
  if (!query.hasNextPage) return null;
  return (
    <div className="flex justify-center">
      <Button
        variant="outline"
        onClick={() => void query.fetchNextPage()}
        disabled={query.isFetchingNextPage}
      >
        {query.isFetchingNextPage && <Spinner className="size-4" />}
        {query.isFetchingNextPage ? "Loading…" : "Load more"}
      </Button>
    </div>
  );
}

export function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-fg-muted text-xs">{label}</dt>
      <dd className="truncate">{children}</dd>
    </div>
  );
}
