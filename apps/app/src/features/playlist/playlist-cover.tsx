import { ListMusic } from "lucide-react";

import { cn } from "@actiontokens/ui/lib/cn";

/** A playlist's cover: its own image, a 2×2 mosaic of its first songs, or a placeholder. */
export function PlaylistCover({ covers, className }: { covers: string[]; className?: string }) {
  const base = cn("bg-surface-3 aspect-square w-full overflow-hidden rounded-lg", className);
  if (covers.length === 0) {
    return (
      <div className={cn(base, "text-fg-faint grid place-items-center")}>
        <ListMusic className="size-1/3" />
      </div>
    );
  }
  if (covers.length < 4) {
    // eslint-disable-next-line @next/next/no-img-element -- covers come from many hosts
    return <img src={covers[0]} alt="" className={cn(base, "object-cover")} />;
  }
  return (
    <div className={cn(base, "grid grid-cols-2 grid-rows-2")}>
      {covers.slice(0, 4).map((cover, index) => (
        // eslint-disable-next-line @next/next/no-img-element -- covers come from many hosts
        <img key={`${cover}-${index}`} src={cover} alt="" className="size-full object-cover" />
      ))}
    </div>
  );
}
