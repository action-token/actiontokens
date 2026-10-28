import { cn } from "@bandcoin/ui/lib/cn";

/**
 * Stand-in album art for the preview (real covers are uploaded images).
 * Each variant is a different palette so the "art provides the color" idea shows.
 */
const COVERS = {
  sunset: "bg-[radial-gradient(circle_at_70%_70%,#ff7a45_0_18%,transparent_19%),radial-gradient(circle_at_70%_70%,#2a0f3a_0_34%,transparent_35%),linear-gradient(160deg,#ffb347,#c2245a_60%,#3a0d43)]",
  harbour: "bg-[radial-gradient(circle,#8ef0d0_0_28%,#3fb5ff_29%_30%,transparent_31%),repeating-linear-gradient(115deg,#0f3b4a_0_14px,#12566a_14px_28px)]",
  tape: "bg-[radial-gradient(circle_at_50%_45%,#d1462f_0_22%,transparent_23%),linear-gradient(0deg,#1b1b1f_0_38%,transparent_38%),linear-gradient(180deg,#f1e3c6,#e7a55a)]",
  velvet: "bg-[conic-gradient(from_210deg_at_30%_60%,#3a1cd6,#ff4ecd,#ffd36e,#3a1cd6)]",
  green: "bg-[radial-gradient(circle_at_50%_120%,#b6ff5c_0_30%,transparent_31%),linear-gradient(180deg,#072a1f,#0b5a3d)]",
  circle: "bg-[radial-gradient(circle,transparent_0_18%,#ff3d2e_19%_26%,transparent_27%),linear-gradient(135deg,#e8e8e8_0_50%,#111_50%)]",
} as const;

export type CoverName = keyof typeof COVERS;

export function SampleCover({ name, className }: { name: CoverName; className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "relative isolate aspect-square max-w-full overflow-hidden rounded-md after:absolute after:inset-0 after:bg-[radial-gradient(120%_80%_at_20%_0%,rgb(255_255_255/0.18),transparent_50%)]",
        COVERS[name],
        className,
      )}
    />
  );
}
