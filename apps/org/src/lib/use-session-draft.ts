import { useCallback, useEffect, useState } from "react";

/**
 * Form state that survives leaving the page and coming back (the Last.fm
 * connect round trip, an accidental refresh). Kept in this tab only, restored
 * after mount so the server and browser agree on the first render, and cleared
 * with `clear()` once the form is saved.
 *
 * Nothing is written until the saved copy has been read, so the blank form can
 * never overwrite a draft (React runs mount effects twice in development).
 */
export function useSessionDraft<T extends object>(key: string, initial: T, enabled = true) {
  const [value, setValue] = useState(initial);
  const [restored, setRestored] = useState(false);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    try {
      const saved = sessionStorage.getItem(key);
      if (saved) setValue({ ...initial, ...(JSON.parse(saved) as Partial<T>) });
    } catch {
      // private mode or bad data: start fresh
    }
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  useEffect(() => {
    if (!enabled || !restored || cleared) return;
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // storage is a convenience only
    }
  }, [key, value, enabled, restored, cleared]);

  const clear = useCallback(() => {
    setCleared(true);
    try {
      sessionStorage.removeItem(key);
    } catch {
      // nothing to clear
    }
  }, [key]);

  return [value, setValue, clear] as const;
}
