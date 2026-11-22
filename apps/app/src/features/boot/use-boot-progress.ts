"use client";

import { useIsFetching } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useEffect, useState, useSyncExternalStore } from "react";

import { bootProgress } from "./boot-progress";

/** Quiet time with no queries in flight before the page's data counts as settled. */
const DATA_SETTLE_MS = 250;

const noSubscribe = () => () => undefined;

/** Real readiness for the stage loader: fonts, hydration, session and the page's first data. */
export function useBootProgress(): number {
  // false in the server render, true once React has hydrated on the client
  const hydrated = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  const [fonts, setFonts] = useState(false);
  const [data, setData] = useState(false);
  const { status } = useSession();
  const fetching = useIsFetching();

  useEffect(() => {
    document.fonts.ready.then(
      () => setFonts(true),
      () => setFonts(true),
    );
  }, []);

  // Data counts once nothing has been in flight for a short moment (or nothing was ever asked for).
  useEffect(() => {
    if (!hydrated || data || fetching > 0) return;
    const timer = setTimeout(() => setData(true), DATA_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [hydrated, fetching, data]);

  return bootProgress({ fonts, hydrated, session: status !== "loading", data });
}
