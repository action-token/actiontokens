"use client";

import { Download, Loader2, Music, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";

import { timeAgo } from "~/lib/format";
import { api } from "~/trpc/react";

import { downloadName, isWorking, runLabel } from "./run-status";

/** Your latest music runs: playing while they're made, then ready to play, download or mix. */
export function MusicRuns({ mixerLink = false }: { mixerLink?: boolean }) {
  const recent = api.music.recent.useQuery(undefined, {
    // Check again every few seconds while something is still being made.
    refetchInterval: (query) =>
      query.state.data?.some((run) => isWorking(run.status)) ? 4000 : false,
  });

  if (recent.isPending)
    return (
      <div className="grid gap-2">
        {[0, 1].map((key) => (
          <Skeleton key={key} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  const runs = recent.data ?? [];
  if (runs.length === 0)
    return (
      <EmptyState
        icon={Music}
        title="Nothing made yet"
        description="Describe some music above. What you make shows up here, ready to play, download or mix."
      />
    );

  return (
    <ul className="grid gap-3">
      {runs.map((run) => {
        const status = run.status;
        const audio = run.outputs[0];
        return (
          <li key={run.id} className="bg-surface grid gap-3 rounded-xl border p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="grid min-w-0 gap-0.5">
                <p className="line-clamp-2 text-sm font-semibold">{run.prompt}</p>
                <p className="text-fg-faint text-xs">
                  {run.message ?? "Music"} · {run.cost} coins · {timeAgo(run.createdAt)}
                </p>
              </div>
              <span className="text-fg-muted flex items-center gap-1.5 text-xs font-semibold">
                {isWorking(status) && <Loader2 className="size-3.5 animate-spin" />}
                {status === "FAILED" && <TriangleAlert className="text-warning size-3.5" />}
                {runLabel(status, run.message)}
              </span>
            </div>
            {status === "FAILED" && run.error && (
              <p className="bg-surface-2 text-fg-muted rounded-md p-2.5 text-xs">{run.error}</p>
            )}
            {audio && (
              <div className="grid gap-2">
                <audio controls preload="none" src={audio.url} className="w-full" />
                <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
                  <a
                    href={audio.url}
                    download={downloadName(run.prompt, audio.mimeType)}
                    className="text-primary-text flex items-center gap-1 hover:underline"
                  >
                    <Download className="size-3.5" /> Download
                  </a>
                  {mixerLink && (
                    <Link
                      href={`/mixer?run=${run.id}`}
                      className="text-primary-text hover:underline"
                    >
                      Add to the mixer
                    </Link>
                  )}
                </div>
                {audio.lyrics && (
                  <details className="text-xs">
                    <summary className="text-fg-muted cursor-pointer font-semibold">Lyrics</summary>
                    <p className="text-fg-muted mt-1 whitespace-pre-line">{audio.lyrics}</p>
                  </details>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
