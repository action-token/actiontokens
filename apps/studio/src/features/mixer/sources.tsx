"use client";

import { Loader2, Plus, UploadCloud } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";

import { Skeleton } from "@bandcoin/ui/components/skeleton";

import { api } from "~/trpc/react";

import type { Mixer } from "./use-mixer";

const ACCEPT =
  "audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/ogg,audio/aac,audio/mp4,audio/x-m4a,audio/flac,audio/webm";

/** Where tracks come from: your Lyria music, or files from your device. */
export function Sources({ mixer }: { mixer: Mixer }) {
  const input = useRef<HTMLInputElement>(null);
  const recent = api.music.recent.useQuery();
  const ready = (recent.data ?? []).filter((run) => run.status === "SUCCEEDED" && run.outputs[0]);

  return (
    <aside className="grid content-start gap-4">
      <section className="bg-surface grid gap-3 rounded-xl border p-4">
        <h2 className="text-sm font-semibold">Add audio</h2>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(event) => {
            mixer.uploadFiles([...(event.target.files ?? [])]);
            event.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            mixer.uploadFiles([...event.dataTransfer.files]);
          }}
          className="bg-surface-2/50 hover:bg-surface-2 grid justify-items-center gap-1.5 rounded-lg border-2 border-dashed px-3 py-5 text-center"
        >
          {mixer.adding ? (
            <Loader2 className="text-fg-muted size-6 animate-spin" />
          ) : (
            <UploadCloud className="text-fg-muted size-6" />
          )}
          <span className="text-sm font-semibold">
            {mixer.adding ? "Adding…" : "Upload or drop audio"}
          </span>
          <span className="text-fg-faint text-xs">MP3, WAV, OGG, M4A, FLAC</span>
        </button>
      </section>
      <section className="bg-surface grid gap-2 rounded-xl border p-4">
        <h2 className="text-sm font-semibold">Your Lyria music</h2>
        {recent.isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : ready.length === 0 ? (
          <p className="text-fg-muted text-xs">
            Nothing made yet.{" "}
            <Link href="/music" className="text-primary-text font-semibold hover:underline">
              Make music
            </Link>
          </p>
        ) : (
          <ul className="grid gap-1.5">
            {ready.map((run) => (
              <li key={run.id}>
                <button
                  type="button"
                  disabled={mixer.adding}
                  onClick={() =>
                    mixer.addAudio({ name: run.prompt.slice(0, 40), url: run.outputs[0]!.url })
                  }
                  className="hover:bg-surface-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs"
                >
                  <Plus className="text-primary-text size-3.5 shrink-0" />
                  <span className="truncate">{run.prompt}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
