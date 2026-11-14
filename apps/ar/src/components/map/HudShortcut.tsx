import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

/** A shortcut pill under the profile capsule (Events, Bounty): icon and name on one line. */
export function HudShortcut({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.94 }}
      onClick={onClick}
      aria-label={label}
      className="ar-glass text-ar-dim hover:text-ar-text relative flex h-8 items-center gap-1.5 rounded-full pr-3 pl-2.5 transition-colors"
    >
      <Icon size={14} strokeWidth={2.2} />
      <span className="font-hud text-[10.5px] font-semibold tracking-[0.08em] uppercase">
        {label}
      </span>
    </motion.button>
  );
}
