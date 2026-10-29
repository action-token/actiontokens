"use client";

import { FileUp, Loader2, X } from "lucide-react";
import { useRef } from "react";
import toast from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";

import { useUpload } from "./use-upload";

export type PickedFile = { url: string; name: string; mime: string };

/**
 * Pick a file, upload it, show what is there. `preview` shows an image thumbnail
 * (covers); anything else shows the file's name.
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
  const input = useRef<HTMLInputElement>(null);
  const { upload, busy } = useUpload();

  async function pick(file: File | undefined) {
    if (!file) return;
    try {
      onFile?.(file);
      onChange({ url: await upload(file), name: file.name, mime: file.type });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't upload that file.");
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="grid gap-2">
      <input id={id} ref={input} type="file" accept={accept} hidden onChange={(event) => void pick(event.target.files?.[0])} />
      <div className="flex flex-wrap items-center gap-3">
        {preview && value && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value.url} alt="" className="bg-surface-2 size-20 rounded-lg border object-cover" />
        )}
        <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? <Loader2 className="animate-spin" /> : <FileUp />}
          {busy ? "Uploading…" : value ? "Replace" : "Choose a file"}
        </Button>
        {value && !busy && (
          <>
            {!preview && <span className="text-fg-muted max-w-56 truncate text-sm">{value.name}</span>}
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
              <X /> Remove
            </Button>
          </>
        )}
      </div>
      {hint && <p className="text-fg-faint text-xs">{hint}</p>}
    </div>
  );
}
