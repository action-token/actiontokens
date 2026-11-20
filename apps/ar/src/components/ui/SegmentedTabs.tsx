import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

import { cn } from "@actiontokens/ui/lib/cn";

export interface SegmentedTabItem<T extends string> {
  id: T;
  label: string;
  count?: number;
  icon?: LucideIcon;
}

/**
 * ── SegmentedTabs ──────────────────────────────────────────────────────────
 *
 * A pill switch between mutually-exclusive views — All/Following on the
 * brand list, Live drops/Your cards on a brand's page.
 *
 * The active segment is one `motion.span` carrying a shared `layoutId`
 * rather than each button separately toggling its own background. That's
 * the same technique `BottomTabBar` uses for its lit plate: switching tabs
 * slides one highlight across the bar instead of two segments
 * independently swapping colour, which is what makes the tab bar feel like
 * a physical selector and is exactly what this control was missing —
 * flipped straight from "flat text" to "flat text with a tint," with
 * nothing in between to look at.
 *
 * `layoutId` must be unique per rendered instance. Two segmented controls
 * on screen sharing one id would animate a switch on the other whenever
 * either changes, since framer-motion treats a shared id as one element
 * moving between mount points.
 */
export function SegmentedTabs<T extends string>({
  tabs,
  value,
  onChange,
  layoutId,
  className,
}: {
  tabs: SegmentedTabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  layoutId: string;
  className?: string;
}) {
  return (
    <div className={cn("flex h-11 gap-2", className)}>
      {tabs.map((tab) => {
        const active = tab.id === value;
        const Icon = tab.icon;

        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            aria-pressed={active}
            className={cn(
              "relative flex-1 rounded-[8px]",
              !active && "bg-ar-surface border-2 border-[hsl(var(--st-paper)/0.6)]",
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="st-green absolute inset-0 -rotate-1 rounded-[8px] shadow-[3px_3px_0_0_hsl(var(--st-ink))]"
                transition={{ type: "spring", stiffness: 460, damping: 34, mass: 0.7 }}
              />
            )}

            <span
              className={cn(
                "font-display relative z-10 flex items-center justify-center gap-1.5 text-[13px] tracking-[0.05em] uppercase",
                active ? "-rotate-1 text-[hsl(var(--st-ink))]" : "text-ar-dim",
              )}
            >
              {Icon && <Icon size={13} strokeWidth={2.6} />}
              <span className="truncate">{tab.label}</span>
              {tab.count != null && (
                <span
                  className={cn(
                    "inline-flex h-[17px] min-w-[19px] items-center justify-center rounded-[4px] px-1 text-[10px] tabular-nums",
                    active
                      ? "bg-[hsl(var(--st-ink))] text-ar-accent"
                      : "text-ar-dim bg-white/[0.08]",
                  )}
                >
                  {tab.count}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
