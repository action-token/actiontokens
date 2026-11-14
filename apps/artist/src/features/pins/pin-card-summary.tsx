import { CalendarClock, Gift, Users } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@bandcoin/ui/lib/cn";

/**
 * The strip under the card's title: the pin as it will look on the map (its Look tab), its title so
 * far, and chips for who can collect it, what it gives and when it runs. It follows the form live.
 */
export function PinCardSummary({
  marker,
  title,
  who,
  reward,
  when,
}: {
  /** The pin's glyph, as the map draws it */
  marker: ReactNode;
  title: string;
  who: string;
  /** Null when it gives nothing */
  reward: string | null;
  /** The run in words, or null until it has an end */
  when: string | null;
}) {
  return (
    <div className="border-fg/10 bg-surface-2/40 flex items-center gap-3 border-b-2 px-3 py-2.5">
      <span className="shrink-0" aria-hidden>
        {marker}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm font-semibold", !title.trim() && "text-fg-muted")}>
          {title.trim() || "Untitled pin"}
        </p>
        <ul className="mt-1 flex flex-wrap gap-1">
          <Chip icon={<Users className="size-3" />}>{who}</Chip>
          <Chip icon={<Gift className="size-3" />}>{reward ?? "No reward"}</Chip>
          <Chip icon={<CalendarClock className="size-3" />} muted={!when}>
            {when ?? "Pick when it ends"}
          </Chip>
        </ul>
      </div>
    </div>
  );
}

function Chip({
  icon,
  muted,
  children,
}: {
  icon: ReactNode;
  muted?: boolean;
  children: ReactNode;
}) {
  return (
    <li
      className={cn(
        "bg-surface border-fg/10 flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
        muted ? "text-fg-faint" : "text-fg-muted",
      )}
    >
      {icon}
      <span className="truncate">{children}</span>
    </li>
  );
}
