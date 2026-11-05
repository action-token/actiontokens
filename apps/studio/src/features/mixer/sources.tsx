"use client";

import { Loader2, Music2, Plus, UploadCloud } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@bandcoin/ui/components/sheet";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { cn } from "@bandcoin/ui/lib/cn";

import { api } from "~/trpc/react";

import { ACCEPT } from "./audio-files";
import type { Mixer } from "./use-mixer";

/** Upload or drop audio files from your device; each becomes a track. */
export function UploadZone({ mixer, large = false }: { mixer: Mixer; large?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        aria-label="Audio files"
        onChange={(event) => {
          mixer.uploadFiles([...(event.target.files ?? [])]);
          event.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOver(false);
          mixer.uploadFiles([...event.dataTransfer.files]);
        }}
        className={cn(
          "bg-surface/80 hover:border-fg/40 grid w-full content-center justify-items-center gap-2 rounded-[1.6rem] border-2 border-dashed px-4 text-center transition-colors",
          large ? "min-h-56 py-8" : "py-6",
          over && "border-primary bg-primary-soft",
        )}
      >
        <span className="bg-primary text-primary-foreground blob grid size-12 place-items-center">
          {mixer.adding ? (
            <Loader2 className="size-6 animate-spin" />
          ) : (
            <UploadCloud className="size-6" strokeWidth={2.2} />
          )}
        </span>
        <span className="text-base font-bold">
          {mixer.adding ? "Adding your audio…" : "Upload or drop audio"}
        </span>
        <span className="text-fg-muted text-xs">
          Any audio (MP3, WAV, FLAC, M4A, OGG, AIFF…) or a .zip of it · 100 MB a file
        </span>
      </button>
    </>
  );
}

/** Your finished Lyria music, each one tap away from becoming a track. */
export function LyriaList({ mixer, onAdded }: { mixer: Mixer; onAdded?: () => void }) {
  const recent = api.music.recent.useQuery();
  const ready = (recent.data ?? []).filter((run) => run.status === "SUCCEEDED" && run.outputs[0]);
  if (recent.isPending)
    return (
      <div className="grid gap-2">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    );
  if (ready.length === 0)
    return (
      <p className="text-fg-muted text-sm">
        Nothing made yet.{" "}
        <Link href="/music" className="text-primary-text font-semibold hover:underline">
          Make music with Lyria
        </Link>
      </p>
    );
  return (
    <ul className="grid gap-1">
      {ready.map((run) => (
        <li key={run.id}>
          <button
            type="button"
            disabled={mixer.adding}
            onClick={() => {
              mixer.addAudio({ name: run.prompt.slice(0, 40), url: run.outputs[0]!.url });
              onAdded?.();
            }}
            className="hover:bg-surface-2 flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm disabled:opacity-50"
          >
            <span className="bg-surface-2 grid size-8 shrink-0 place-items-center rounded-lg">
              <Music2 className="text-primary-text size-4" />
            </span>
            <span className="min-w-0 flex-1 truncate">{run.prompt}</span>
            <Plus className="text-fg-muted size-4 shrink-0" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** "Add audio" once the mix has tracks: a panel from the right with both sources. */
export function AddAudioPanel({
  mixer,
  open,
  onOpenChange,
}: {
  mixer: Mixer;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-sm">
        <SheetHeader>
          <SheetTitle>Add audio</SheetTitle>
          <SheetDescription>Each file or song becomes a new track.</SheetDescription>
        </SheetHeader>
        <div className="grid gap-6 px-4 pb-6">
          <UploadZone mixer={mixer} />
          <section className="grid gap-2">
            <h3 className="marker text-primary-text text-base">*your lyria music*</h3>
            <LyriaList mixer={mixer} onAdded={() => onOpenChange(false)} />
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
