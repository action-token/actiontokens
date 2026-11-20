"use client";

import {
  AlertCircle,
  File as FileIcon,
  ImagePlus,
  Loader2,
  Music,
  RefreshCw,
  UploadCloud,
  Video,
  X,
} from "lucide-react";
import { useId, useRef, useState } from "react";
import toast from "react-hot-toast";

import { cn } from "@actiontokens/ui/lib/cn";

import { useUpload } from "./use-upload";

export type PickedFile = { url: string; name: string; mime: string };

type Kind = "image" | "video" | "audio" | "file";

/** What a file is, from its type or (for an uploaded address) its extension. */
function kindOf(file: PickedFile): Kind {
  const hint = `${file.mime} ${file.name} ${file.url}`.toLowerCase();
  if (file.mime.startsWith("image") || /\.(png|jpe?g|webp|gif|avif|svg)(\?|$)/.test(hint))
    return "image";
  if (file.mime.startsWith("video") || /\.(mp4|webm|mov|m4v)(\?|$)/.test(hint)) return "video";
  if (file.mime.startsWith("audio") || /\.(mp3|wav|ogg|flac|m4a|aac)(\?|$)/.test(hint))
    return "audio";
  return "file";
}

const KIND_ICON = { image: ImagePlus, video: Video, audio: Music, file: FileIcon } as const;

/**
 * Drop a file, click, or press Enter to pick one; it uploads straight to storage
 * and shows what is there. `preview` shows an image thumbnail (covers); anything
 * else shows the file's name. Works with a keyboard and with drag and drop.
 */
export function FileField({
  id,
  accept,
  value,
  onChange,
  preview,
  hint,
  onFile,
}: {
  id: string;
  accept: string;
  value: PickedFile | null;
  onChange: (file: PickedFile | null) => void;
  preview?: boolean;
  hint?: string;
  /** The raw file that was picked, for things only the browser can read (an audio's length) */
  onFile?: (file: File) => void;
}) {
  const autoId = useId();
  const input = useRef<HTMLInputElement>(null);
  const { upload, busy } = useUpload();
  const [dragging, setDragging] = useState(false);
  const [local, setLocal] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function pick(file: File | undefined) {
    if (!file || busy) return;
    setFailed(false);
    if (file.type.startsWith("image/")) setLocal(URL.createObjectURL(file));
    try {
      onFile?.(file);
      onChange({ url: await upload(file), name: file.name, mime: file.type });
    } catch (error) {
      setFailed(true);
      toast.error(error instanceof Error ? error.message : "Couldn't upload that file.");
    } finally {
      setLocal(null);
      if (input.current) input.current.value = "";
    }
  }

  const kind = value ? kindOf(value) : "file";
  const Icon = failed ? AlertCircle : value ? KIND_ICON[kind] : UploadCloud;
  const shownImage = local ?? (value && kind === "image" && preview ? value.url : null);

  return (
    <div className="grid gap-2">
      <input
        id={id}
        ref={input}
        type="file"
        accept={accept}
        hidden
        aria-describedby={hint ? `${autoId}-hint` : undefined}
        onChange={(event) => void pick(event.target.files?.[0])}
      />
      <div
        role="button"
        tabIndex={0}
        aria-label={value ? "Replace file" : "Choose a file"}
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
          void pick(event.dataTransfer.files[0]);
        }}
        className={cn(
          "bg-surface-2/50 hover:bg-surface-2 focus-visible:ring-ring/50 flex cursor-pointer items-center gap-4 rounded-xl border-2 border-dashed p-4 transition-colors outline-none focus-visible:ring-[3px]",
          dragging && "border-primary bg-primary-soft",
          failed && "border-danger/60",
          busy && "cursor-progress",
        )}
      >
        {shownImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shownImage}
            alt=""
            className="bg-surface-2 size-20 shrink-0 rounded-lg border object-cover"
          />
        ) : (
          <span className="bg-surface text-fg-muted grid size-12 shrink-0 place-items-center rounded-lg border">
            {busy ? <Loader2 className="animate-spin" /> : <Icon className="size-5" />}
          </span>
        )}
        <span className="grid min-w-0 gap-0.5 text-sm">
          <span className="truncate font-medium">
            {busy
              ? "Uploading…"
              : value
                ? preview && kind === "image"
                  ? "Replace the image"
                  : value.name
                : dragging
                  ? "Drop it here"
                  : "Drop a file here, or click to choose"}
          </span>
          <span className="text-fg-muted text-xs">
            {failed
              ? "That didn't upload. Try again."
              : value
                ? "Click or drop another file to replace it"
                : (hint ?? "Uploads as soon as you pick it")}
          </span>
        </span>
        {value && !busy && (
          <button
            type="button"
            aria-label="Remove file"
            onClick={(event) => {
              event.stopPropagation();
              onChange(null);
            }}
            className="text-fg-muted hover:bg-surface hover:text-fg ml-auto grid size-8 shrink-0 place-items-center rounded-full"
          >
            <X className="size-4" />
          </button>
        )}
        {failed && !busy && (
          <RefreshCw className="text-danger ml-auto size-4 shrink-0" aria-hidden />
        )}
      </div>
    </div>
  );
}
