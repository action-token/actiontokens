"use client";

import toast from "react-hot-toast";

import { api } from "~/trpc/react";

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong.";

/** Pause or resume, drop now, remove: shared by the hotspot's edit page and its card on the map. */
export function useHotspotActions(onRemoved?: () => void) {
  const utils = api.useUtils();
  const refresh = () => Promise.all([utils.hotspots.invalidate(), utils.pins.invalidate()]);
  const pause = api.hotspots.setPaused.useMutation({
    onSuccess: (_, input) => {
      toast.success(input.paused ? "Paused: no drops until you resume" : "Resumed");
      void refresh();
    },
    onError: (error) => toast.error(messageOf(error)),
  });
  const dropNow = api.hotspots.dropNow.useMutation({
    onSuccess: (result) => {
      toast.success(result.outcome === "DROPPED" ? `Dropped ${result.spots} spots` : "Dropped");
      void refresh();
    },
    onError: (error) => toast.error(messageOf(error)),
  });
  const remove = api.hotspots.removeHotspot.useMutation({
    onSuccess: () => {
      toast.success("Hotspot removed");
      void refresh();
      onRemoved?.();
    },
    onError: (error) => toast.error(messageOf(error)),
  });
  return { pause, dropNow, remove };
}
