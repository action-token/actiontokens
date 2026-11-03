"use client";

import { ImagePlus, Loader2, Music, UploadCloud, Video } from "lucide-react";
import { useRef, useState } from "react";
import toast from "react-hot-toast";

import { cn } from "@bandcoin/ui/lib/cn";

import { useUpload } from "../catalog/use-upload";
import { planUploads, type PostMediaType, songTitle } from "./media-files";

export type PostMedia = { type: PostMediaType; url: string; title?: string | null };

const ACCEPT = "image/*,video/*,audio/*";

/**
 * One place for every file a post carries: drop or pick several images,
 * videos and songs at once, in any mix. They upload one after another and
 * join the post in the order picked; songs keep their file name as a title.
 */
export function MediaDrop({ room, onAdd }: { room: number; onAdd: (file: PostMedia) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const { upload } = useUpload();
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const busy = progress !== null;

  async function add(files: File[]) {
    if (busy || files.length === 0) return;
    const plan = planUploads(files, room);
    if (plan.unsupported > 0)
      toast.error(
        `${plan.unsupported} file${plan.unsupported === 1 ? " isn't" : "s aren't"} an image, video or song, so ${plan.unsupported === 1 ? "it was" : "they were"} left out.`,
      );
    if (plan.overLimit > 0)
      toast.error(`A post holds up to 10 files: ${plan.overLimit} more didn't fit.`);
    setProgress({ done: 0, total: plan.take.length });
    try {
      for (const [index, { file, type }] of plan.take.entries()) {
        try {
          const url = await upload(file);
          onAdd({ type, url, title: type === "AUDIO" ? songTitle(file.name) : null });
        } catch (error) {
          toast.error(
            `${file.name} didn't upload: ${error instanceof Error ? error.message : "try again"}`,
          );
        }
        setProgress({ done: index + 1, total: plan.take.length });
      }
    } finally {
      setProgress(null);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(event) => void add([...(event.target.files ?? [])])}
      />
      <div
        role="button"
        tabIndex={0}
        aria-label="Add images, videos or songs"
        aria-busy={busy}
        onClick={() => !busy && input.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (!busy) input.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void add([...event.dataTransfer.files]);
        }}
        className={cn(
          "bg-surface-2/50 hover:bg-surface-2 focus-visible:ring-ring/50 grid cursor-pointer justify-items-center gap-3 rounded-xl border-2 border-dashed px-4 py-7 text-center transition-colors outline-none focus-visible:ring-[3px]",
          dragging && "border-primary bg-primary-soft",
          busy && "cursor-progress",
        )}
      >
        {busy ? (
          <Loader2 className="text-fg-muted size-7 animate-spin" />
        ) : (
          <span className="text-fg-muted flex items-center gap-2">
            <ImagePlus className="size-6" />
            <Video className="size-6" />
            <Music className="size-6" />
          </span>
        )}
        <span className="grid gap-0.5">
          <b className="text-sm">
            {busy
              ? `Uploading ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…`
              : dragging
                ? "Drop them here"
                : "Add images, videos and songs"}
          </b>
          <span className="text-fg-muted text-xs">
            {busy
              ? "Keep this page open"
              : `Pick or drop several at once, in any mix. ${room} more fit.`}
          </span>
        </span>
        {!busy && (
          <span className="bg-surface text-fg inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold">
            <UploadCloud className="size-3.5" /> Choose files
          </span>
        )}
      </div>
    </>
  );
}
