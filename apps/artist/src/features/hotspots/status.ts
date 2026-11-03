import type { Tone } from "@bandcoin/ui/patterns/status-pill";

/** How each hotspot state reads in the portal. */
export const HOTSPOT_STATUS: Record<
  "SCHEDULED" | "ACTIVE" | "PAUSED" | "ENDED",
  { label: string; tone: Tone }
> = {
  SCHEDULED: { label: "Starts soon", tone: "info" },
  ACTIVE: { label: "Dropping", tone: "success" },
  PAUSED: { label: "Paused", tone: "warning" },
  ENDED: { label: "Ended", tone: "neutral" },
};
