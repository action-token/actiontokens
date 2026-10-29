import { MapPin } from "lucide-react";

import { formatWhen } from "~/lib/datetime";

/** How the event will look to fans, updating as the form is filled in. */
export function EventPreview({ title, coverUrl, startsAt, venue, address }: { title: string; coverUrl?: string; startsAt: Date | null; venue: string; address: string }) {
  const place = [venue, address].filter(Boolean).join(", ");
  return (
    <section className="bg-surface border-fg/10 overflow-hidden rounded-[1.4rem] border-2">
      {coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={coverUrl} alt="" className="aspect-video w-full object-cover" />
      )}
      <div className="grid gap-2 p-5">
        <p className="text-primary-text text-xs font-semibold tracking-wide uppercase">Preview</p>
        <p className="display text-xl leading-snug">{title || "Untitled event"}</p>
        <p className="text-fg-muted text-sm">{startsAt && !Number.isNaN(startsAt.getTime()) ? formatWhen(startsAt) : "Pick a start time"}</p>
        {place && (
          <p className="text-fg-muted flex items-center gap-1.5 text-sm">
            <MapPin className="size-4 shrink-0" />
            <span className="truncate">{place}</span>
          </p>
        )}
      </div>
    </section>
  );
}
