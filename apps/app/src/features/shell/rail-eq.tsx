import { cn } from "@actiontokens/ui/lib/cn";

const BARS = 16;
/** Each bar gets its own speed and start, so the strip looks like a live level meter. */
const SPEEDS_MS = [620, 860, 540, 980, 720, 800, 580, 920];
/** Resting lengths while paused: a quiet, uneven line. */
const REST = [0.35, 0.55, 0.3, 0.7, 0.45, 0.6, 0.4, 0.5];

/**
 * A vertical strip of short equalizer bars beside the rail's label, where its underline was.
 * The bars bounce sideways while `playing`; paused (or with reduced motion) they rest at
 * uneven lengths. Purely decorative.
 */
export function RailEq({ playing }: { playing: boolean }) {
  return (
    <span aria-hidden className="flex w-3 flex-col justify-between self-stretch py-px">
      {Array.from({ length: BARS }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-[2px] w-full origin-left rounded-full bg-current",
            playing && "animate-eq-x motion-reduce:animate-none",
          )}
          style={{
            scale: `${REST[i % REST.length]} 1`,
            animationDuration: `${SPEEDS_MS[(i * 3) % SPEEDS_MS.length]}ms`,
            animationDelay: `-${(i * 173) % 900}ms`,
          }}
        />
      ))}
    </span>
  );
}
