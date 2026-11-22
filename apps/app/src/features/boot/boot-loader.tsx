"use client";

import { useState } from "react";

import { ActionLoader } from "@actiontokens/ui/patterns/action-loader";

import { anton } from "../home/landing-fonts";

import { useBootProgress } from "./use-boot-progress";

/** The Action-Tokens loading screen on every full page load, driven by real readiness. Unmounts once played. */
export function BootLoader() {
  const [done, setDone] = useState(false);
  if (done) return null;
  return <BootLoaderShow onDone={() => setDone(true)} />;
}

function BootLoaderShow({ onDone }: { onDone: () => void }) {
  const progress = useBootProgress();
  return <ActionLoader progress={progress} onDone={onDone} className={anton.variable} />;
}
