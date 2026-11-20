"use client";

import { ChevronLeft, ChevronRight, Play, X } from "lucide-react";
import { useState } from "react";

import { Dialog, DialogContent, DialogTitle } from "@actiontokens/ui/components/dialog";
import { cn } from "@actiontokens/ui/lib/cn";

import { mediaLayout } from "./media-layout";
import type { FeedPost } from "./post-card";
import { PostSong } from "./post-song";

type File = FeedPost["media"][number];

/**
 * A post's media as social apps show it: photos and videos in one
 * edge-to-edge grid that opens a full-screen viewer, then songs as players.
 */
export function PostMedia({ post }: { post: FeedPost }) {
  const visual = post.media.filter((file) => file.type !== "AUDIO");
  const songs = post.media.filter((file) => file.type === "AUDIO");
  const [viewing, setViewing] = useState<number | null>(null);

  return (
    <>
      {visual.length === 1 ? (
        <Single file={visual[0]!} onOpen={() => setViewing(0)} />
      ) : (
        visual.length > 1 && <Grid files={visual} onOpen={setViewing} />
      )}
      {songs.length > 0 && (
        <div className="grid gap-2">
          {songs.map((file) => (
            <PostSong key={file.id} file={file} post={post} />
          ))}
        </div>
      )}
      <Viewer files={visual} index={viewing} onIndex={setViewing} title={post.title} />
    </>
  );
}

/** Media runs to the card's edges, like a photo in a social feed. */
const BLEED = "-mx-5 overflow-hidden bg-black/5";

function Single({ file, onOpen }: { file: File; onOpen: () => void }) {
  if (file.type === "VIDEO")
    return (
      <div className={cn(BLEED, "bg-black")}>
        <video
          src={file.url}
          poster={file.thumbnailUrl ?? undefined}
          controls
          playsInline
          preload="metadata"
          className="aspect-video w-full"
        />
      </div>
    );
  return (
    <button type="button" onClick={onOpen} className={cn(BLEED, "block cursor-zoom-in")}>
      {/* eslint-disable-next-line @next/next/no-img-element -- uploads come from the bucket */}
      <img
        src={file.url}
        alt={file.title ?? ""}
        loading="lazy"
        className="max-h-[36rem] w-full object-cover"
      />
    </button>
  );
}

function Grid({ files, onOpen }: { files: File[]; onOpen: (index: number) => void }) {
  const layout = mediaLayout(files.length);
  return (
    <div className={cn(BLEED, "grid gap-0.5", layout.grid)}>
      {files.slice(0, layout.shown).map((file, index) => {
        const more = index === layout.shown - 1 ? layout.extra : 0;
        return (
          <button
            key={file.id}
            type="button"
            onClick={() => onOpen(index)}
            aria-label={
              more
                ? `Open, and ${more} more`
                : `Open ${file.type === "VIDEO" ? "video" : "photo"} ${index + 1}`
            }
            className={cn("group relative min-h-0 overflow-hidden", layout.cell(index))}
          >
            <Tile file={file} />
            {file.type === "VIDEO" && !more && <PlayBadge />}
            {more > 0 && (
              <span className="absolute inset-0 grid place-items-center bg-black/55 text-3xl font-bold text-white">
                +{more}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function Tile({ file }: { file: File }) {
  const className =
    "size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]";
  return file.type === "VIDEO" ? (
    <video
      src={`${file.url}#t=0.1`}
      poster={file.thumbnailUrl ?? undefined}
      muted
      playsInline
      preload="metadata"
      className={cn(className, "bg-black")}
    />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element -- uploads come from the bucket
    <img src={file.url} alt={file.title ?? ""} loading="lazy" className={className} />
  );
}

function PlayBadge() {
  return (
    <span className="absolute inset-0 grid place-items-center">
      <span className="grid size-12 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-transform group-hover:scale-110">
        <Play className="size-5 translate-x-px fill-current" />
      </span>
    </span>
  );
}

/** Full-screen photos and videos with arrows (and the arrow keys). */
function Viewer({
  files,
  index,
  onIndex,
  title,
}: {
  files: File[];
  index: number | null;
  onIndex: (index: number | null) => void;
  title: string;
}) {
  const file = index === null ? null : files[index];
  const go = (step: number) =>
    index !== null && onIndex((index + step + files.length) % files.length);

  return (
    <Dialog
      open={file !== null && file !== undefined}
      onOpenChange={(open) => !open && onIndex(null)}
    >
      <DialogContent
        showCloseButton={false}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") go(1);
          if (event.key === "ArrowLeft") go(-1);
        }}
        className="grid h-[100dvh] max-h-none w-screen max-w-none place-items-center rounded-none border-0 bg-black/95 p-0 sm:max-w-none"
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        {file &&
          (file.type === "VIDEO" ? (
            <video
              key={file.id}
              src={file.url}
              controls
              autoPlay
              playsInline
              className="max-h-[90dvh] max-w-full"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- uploads come from the bucket
            <img
              key={file.id}
              src={file.url}
              alt={file.title ?? ""}
              className="max-h-[90dvh] max-w-full object-contain"
            />
          ))}
        <button
          type="button"
          onClick={() => onIndex(null)}
          aria-label="Close"
          className="absolute top-4 right-4 grid size-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
        >
          <X className="size-5" />
        </button>
        {files.length > 1 && index !== null && (
          <>
            <ViewerArrow side="left" onClick={() => go(-1)} />
            <ViewerArrow side="right" onClick={() => go(1)} />
            <p className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white">
              {index + 1} / {files.length}
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ViewerArrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Previous" : "Next"}
      className={cn(
        "absolute top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20",
        side === "left" ? "left-3 sm:left-6" : "right-3 sm:right-6",
      )}
    >
      <Icon className="size-6" />
    </button>
  );
}
