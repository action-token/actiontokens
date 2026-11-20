import { EyeOff } from "lucide-react";

import { FAN_APP_URL } from "../shell/links";

/**
 * Shown on an item, song or bounty an admin took off fans' screens: when,
 * why, and what it means. The artist can't undo it; support can.
 */
export function HiddenNotice({
  hidden,
  what,
}: {
  hidden: { at: Date | string; reason: string | null } | null;
  /** "item", "song", "bounty" */
  what: string;
}) {
  if (!hidden) return null;
  return (
    <div role="status" className="bg-danger-soft text-danger flex gap-3 rounded-xl p-4 text-sm">
      <EyeOff className="mt-0.5 size-5 shrink-0" />
      <div className="grid gap-1">
        <p className="font-semibold">
          An admin hid this {what} from fans on{" "}
          {new Date(hidden.at).toLocaleDateString(undefined, {
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
          .
        </p>
        {hidden.reason && <p>Why: {hidden.reason}</p>}
        <p className="text-fg-muted">
          {what === "bounty"
            ? "Fans can't see it. Its prize stays in escrow, and you can still pay winners."
            : "Fans can't see or buy it. People who already own it keep it."}{" "}
          Think it&apos;s a mistake?{" "}
          <a
            href={`${FAN_APP_URL}/support`}
            target="_blank"
            rel="noreferrer"
            className="text-fg font-medium underline underline-offset-4"
          >
            Contact support
          </a>
          .
        </p>
      </div>
    </div>
  );
}
