"use client";

import { useState } from "react";

import { StageLoader } from "@bandcoin/ui/patterns/stage-loader/stage-loader";

import { useBootProgress } from "./use-boot-progress";

/** The stage loader on every full page load, driven by real readiness. Unmounts once played. */
export function BootLoader() {
  const [done, setDone] = useState(false);
  if (done) return null;
  return <BootLoaderShow onDone={() => setDone(true)} />;
}

function BootLoaderShow({ onDone }: { onDone: () => void }) {
  const progress = useBootProgress();
  return <StageLoader progress={progress} onDone={onDone} />;
}
