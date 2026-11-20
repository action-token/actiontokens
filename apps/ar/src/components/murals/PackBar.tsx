import { AnimatePresence, motion } from "framer-motion";
import { Check, Download } from "lucide-react";
import { useEffect, useState } from "react";

import { packProgress, usePackSheet, useMuralPack } from "~/lib/murals/pack";

/**
 * ── PackBar ────────────────────────────────────────────────────────────────
 *
 * The mural pack's download progress as a sticker bar riding just above the
 * dock (docs/AR-STICKER-REDESIGN.md): "MURAL PACK", a chunky progress track
 * and the percentage. Shown while the pack checks, downloads, verifies or is
 * paused on an error; on finishing it turns green, says "MURALS READY" and
 * fades. Tapping it opens the pack panel.
 */
export function PackBar() {
  const s = useMuralPack();
  const open = usePackSheet((x) => x.setOpen);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (!s.justFinished) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 2200);
    return () => clearTimeout(t);
  }, [s.justFinished]);

  const busy =
    s.status === "checking" ||
    s.status === "downloading" ||
    s.status === "verifying" ||
    s.status === "error";
  const show = busy || flash;
  const p = flash ? 1 : packProgress(s);
  const pct = Math.floor(p * 100);
  const failed = s.status === "error";
  const label = flash
    ? "MURALS READY"
    : failed
      ? "PACK PAUSED"
      : s.status === "checking"
        ? "CHECKING PACK"
        : s.status === "verifying"
          ? "VERIFYING PACK"
          : "MURAL PACK";

  return (
    <AnimatePresence>
      {show && (
        <motion.button
          key="pack-bar"
          type="button"
          onClick={() => open(true)}
          aria-label={failed ? "Mural pack paused, show details" : `Mural pack ${pct}%, show details`}
          initial={{ opacity: 0, y: 12, rotate: -2 }}
          animate={{ opacity: 1, y: 0, rotate: -1 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ type: "spring", stiffness: 420, damping: 30 }}
          className={
            "pointer-events-auto flex w-full max-w-[260px] items-center gap-2 rounded-[8px] border-[2.5px] border-[hsl(var(--st-ink))] px-2.5 py-1.5 shadow-[3px_3px_0_0_hsl(var(--st-ink))] " +
            (flash ? "bg-ar-accent" : failed ? "bg-ar-danger" : "bg-[hsl(var(--st-paper))]")
          }
        >
          {flash ? (
            <Check className="size-4 shrink-0 text-[hsl(var(--st-ink))]" strokeWidth={3} />
          ) : (
            <Download
              className={
                "size-4 shrink-0 " + (failed ? "text-white" : "text-[hsl(var(--st-ink))]")
              }
              strokeWidth={2.6}
            />
          )}
          <span
            className={
              "font-display shrink-0 text-[12px] leading-none tracking-[0.04em] " +
              (failed ? "text-white" : "text-[hsl(var(--st-ink))]")
            }
          >
            {label}
          </span>
          {!flash && (
            <>
              <span className="relative h-2.5 min-w-0 flex-1 overflow-hidden rounded-full border-2 border-[hsl(var(--st-ink))] bg-[hsl(var(--st-ink)/0.1)]">
                <span
                  className={
                    "absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 " +
                    (failed ? "bg-white" : "bg-ar-accent")
                  }
                  style={{ width: `${Math.max(p, s.status === "checking" ? 0.08 : 0) * 100}%` }}
                />
              </span>
              <span
                className={
                  "font-display w-8 shrink-0 text-right text-[12px] leading-none tabular-nums " +
                  (failed ? "text-white" : "text-[hsl(var(--st-ink))]")
                }
              >
                {failed ? "!" : `${pct}%`}
              </span>
            </>
          )}
        </motion.button>
      )}
    </AnimatePresence>
  );
}
