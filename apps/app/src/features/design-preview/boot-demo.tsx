"use client";

import { useEffect, useState } from "react";

import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/patterns/skeleton";
import { StageLoader } from "@bandcoin/ui/patterns/stage-loader/stage-loader";

/** The stage loader over a skeleton page, with simulated progress and a Replay button. */
export function BootDemo() {
  const [run, setRun] = useState(0);
  const [progress, setProgress] = useState(0);

  // Simulated readiness: uneven steps, like real fonts, session and data arriving.
  useEffect(() => {
    let p = 0;
    const timer = setInterval(() => {
      p = Math.min(1, p + Math.random() * 0.09 + 0.015);
      setProgress(p);
      if (p >= 1) clearInterval(timer);
    }, 160);
    return () => clearInterval(timer);
  }, [run]);

  return (
    <div className="bg-surface relative h-[520px] overflow-hidden rounded-xl border">
      <div aria-hidden className="grid gap-3 p-6">
        <Skeleton className="h-5 w-2/5" />
        <Skeleton className="h-36 rounded-md" />
        <div className="grid grid-cols-3 gap-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      </div>
      <StageLoader key={run} contained replayKey={run} progress={progress} />
      <Button
        size="sm"
        variant="secondary"
        className="absolute right-3 bottom-3 z-[110]"
        onClick={() => {
          setProgress(0);
          setRun((n) => n + 1);
        }}
      >
        Replay
      </Button>
    </div>
  );
}
