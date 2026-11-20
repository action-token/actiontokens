import { useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useRef } from "react";

import { site } from "@actiontokens/ar-core/site";

import { BOOT_MS, BootPosterTape, useBootClock } from "./concepts";

/**
 * ── BootSequence ───────────────────────────────────────────────────────────
 *
 * The first seconds of the app: "Poster Tape" (picked on 2026-11-20 from
 * /review/boot, a mix of concepts 1 and 2). A green street poster with two tape
 * bands crossing it, the logo slapped where they cross, ACTION / TOKENS stacked
 * big, a giant 000→100 counter, and then the poster peels off onto the map that
 * has been mounting underneath.
 *
 * Tap anywhere to skip. `prefers-reduced-motion` skips straight to done.
 */
export function BootSequence({ onDone }: { onDone: () => void }) {
  const reduceMotion = useReducedMotion();
  const t = useBootClock(false);
  const finished = useRef(false);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    onDone();
  }, [onDone]);

  useEffect(() => {
    if (reduceMotion || t >= BOOT_MS) finish();
  }, [reduceMotion, t, finish]);

  if (reduceMotion) return null;

  return (
    <div
      role="status"
      aria-label={`Loading ${site.name} AR`}
      onClick={finish}
      className="absolute inset-0 z-[100] cursor-pointer"
    >
      <BootPosterTape t={t} />
    </div>
  );
}
