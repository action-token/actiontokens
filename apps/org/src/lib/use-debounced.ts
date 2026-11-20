import { useEffect, useState } from "react";

/** A value that follows `value` once it has stopped changing for `delay` ms (for search boxes and live checks). */
export function useDebounced<T>(value: T, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
