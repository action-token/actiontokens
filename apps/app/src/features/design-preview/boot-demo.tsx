"use client";

import { useState } from "react";

import { Button } from "@bandcoin/ui/components/button";
import { BootScreen } from "@bandcoin/ui/patterns/boot-screen";
import { Skeleton } from "@bandcoin/ui/patterns/skeleton";

/** The boot screen over a skeleton page, with a Replay button. */
export function BootDemo() {
  const [run, setRun] = useState(0);
  return (
    <div className="bg-surface relative h-[300px] overflow-hidden rounded-xl border">
      <div aria-hidden className="grid gap-3 p-6">
        <Skeleton className="h-5 w-2/5" />
        <Skeleton className="h-36 rounded-md" />
        <div className="grid grid-cols-3 gap-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      </div>
      <BootScreen always replayKey={run} />
      <Button
        size="sm"
        variant="secondary"
        className="absolute right-3 bottom-3 z-[60]"
        onClick={() => setRun((n) => n + 1)}
      >
        Replay
      </Button>
    </div>
  );
}
