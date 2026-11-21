"use client";

import { MapPin } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@actiontokens/ui/components/select";
import { Skeleton } from "@actiontokens/ui/components/skeleton";
import { EmptyState } from "@actiontokens/ui/patterns/empty-state";
import { ErrorState } from "@actiontokens/ui/patterns/error-state";

import { ActingTRPCProvider } from "~/lib/acting-trpc";
import { api } from "~/trpc/react";

import { ActingArtistProvider } from "../pins/acting";
import { useSelectedLayer } from "../pins/layers/selected-layer";
import { PinsMap } from "../pins/pins-map";

/**
 * Admin › All maps (plan 45): pick an artist and work on their Pins map as them. Pins made here go
 * live at once, hotspots, layers, looks and shapes are theirs, and every change is logged under
 * the admin's name. The artist is kept in the URL (?artist=), and the map starts fresh for each.
 */
export function MapsView() {
  const router = useRouter();
  const pathname = usePathname() ?? "/admin/maps";
  const search = useSearchParams();
  const artists = api.admin.artists.list.useQuery({ status: "APPROVED" });
  const wanted = search?.get("artist");
  const artist = artists.data?.find((entry) => entry.id === wanted) ?? artists.data?.[0];

  // The layer you were in belongs to the last artist: start on the regular map for each.
  const organizationId = artist?.id;
  useEffect(() => {
    useSelectedLayer.setState({ id: null, shown: [] });
    return () => useSelectedLayer.setState({ id: null, shown: [] });
  }, [organizationId]);

  if (artists.isError)
    return (
      <div className="p-6">
        <ErrorState
          message="Couldn't load the organizations."
          onRetry={() => void artists.refetch()}
        />
      </div>
    );
  if (artists.isPending) return <Skeleton className="m-6 h-24 max-w-md rounded-xl" />;
  if (!artist)
    return (
      <div className="p-6">
        <EmptyState
          icon={MapPin}
          title="No approved organizations yet"
          description="Once an organization is approved, you can work on their map here."
        />
      </div>
    );

  const picker = (
    <div className="pointer-events-auto flex items-center gap-2">
      <Select
        value={artist.id}
        onValueChange={(id) =>
          router.replace(`${pathname}?artist=${encodeURIComponent(id)}`, { scroll: false })
        }
      >
        <SelectTrigger
          className="bg-surface h-10 w-56 shadow-sm sm:w-64"
          aria-label="Organization you're acting as"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {artists.data.map((entry) => (
            <SelectItem key={entry.id} value={entry.id}>
              {entry.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="bg-primary text-primary-foreground hidden rounded-full px-2.5 py-1 text-[11px] font-semibold sm:inline">
        Acting as {artist.name}
      </span>
    </div>
  );

  return (
    // A fresh cache and map per artist: their own pins, framing and layer choice.
    <ActingTRPCProvider key={artist.id} organizationId={artist.id}>
      <ActingArtistProvider value={{ id: artist.id, name: artist.name }}>
        <PinsMap toolbarStart={picker} />
      </ActingArtistProvider>
    </ActingTRPCProvider>
  );
}
