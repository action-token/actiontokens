"use client";

import { MapPin, Loader2, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import { StatusPill } from "@bandcoin/ui/patterns/status-pill";

import { api, type RouterOutputs } from "~/trpc/react";

/** The places this pin is dropped, with how many fans took each. A spot can be taken off the map. */
export function PinSpotsCard({ pin }: { pin: RouterOutputs["pins"]["pin"] }) {
  const utils = api.useUtils();
  const remove = api.pins.removeSpot.useMutation({
    onSuccess: () => {
      toast.success("Spot removed");
      void utils.pins.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const visible = pin.spots.filter((spot) => !spot.isHidden);

  return (
    <section className="bg-surface grid gap-3 rounded-[1.4rem] border-2 p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="display text-2xl">Spots</h2>
        <span className="num text-fg-muted text-sm">
          {pin.collected} collected{pin.claimLimit > 0 ? ` · ${pin.claimsLeft} left` : ""}
        </span>
      </div>
      <ul className="grid max-h-72 gap-1 overflow-y-auto">
        {visible.map((spot, index) => (
          <li key={spot.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm">
            <MapPin className="text-fg-faint size-4 shrink-0" />
            <span className="num min-w-0 flex-1 truncate">
              {index + 1}. {spot.latitude.toFixed(5)}, {spot.longitude.toFixed(5)}
            </span>
            {spot.collected > 0 && <StatusPill tone="success">{spot.collected}</StatusPill>}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove spot ${index + 1}`}
              disabled={visible.length <= 1 || remove.isPending}
              onClick={() => remove.mutate({ spotId: spot.id })}
            >
              {remove.isPending && remove.variables.spotId === spot.id ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Trash2 />
              )}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
