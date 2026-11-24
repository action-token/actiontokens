"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { bootProgress } from "../lib/boot-progress";
import { ActionLoader } from "./action-loader";

/** Quiet time with no queries in flight before the page's data counts as settled. */
const DATA_SETTLE_MS = 250;

const noSubscribe = () => () => undefined;

/**
 * The Action-Tokens loading screen on every full page load, driven by real readiness: fonts,
 * hydration, the session and the page's first data. Each app passes the two it knows about
 * (whether the session is known, how many queries are in flight); this package stays free of
 * next-auth and react-query. Unmounts once it has played.
 */
export function BootLoader({
  sessionReady,
  fetching,
  className,
}: {
  sessionReady: boolean;
  fetching: number;
  /** Font variables the loader's type uses (the app's Anton and blackletter). */
  className?: string;
}) {
  const [done, setDone] = useState(false);
  if (done) return null;
  return (
    <Show
      sessionReady={sessionReady}
      fetching={fetching}
      className={className}
      onDone={() => setDone(true)}
    />
  );
}

function Show({
  sessionReady,
  fetching,
  className,
  onDone,
}: {
  sessionReady: boolean;
  fetching: number;
  className?: string;
  onDone: () => void;
}) {
  // false in the server render, true once React has hydrated on the client
  const hydrated = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  const [fonts, setFonts] = useState(false);
  const [data, setData] = useState(false);

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

  const progress = bootProgress({ fonts, hydrated, session: sessionReady, data });
  return <ActionLoader progress={progress} onDone={onDone} className={className} />;
}
