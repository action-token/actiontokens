"use client";

import { Camera, Loader2 } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import toast from "react-hot-toast";

import { cn } from "@bandcoin/ui/lib/cn";

import { declare, putToStorage } from "~/lib/upload";
import { api } from "~/trpc/react";

const TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Any area that uploads an image when clicked (or a file is dropped on it).
 * It uses the account's own image upload, so it works before someone is an
 * approved artist. `children` is what the area looks like.
 */
export function UploadArea({
  onChange,
  label,
  className,
  children,
}: {
  onChange: (url: string) => void;
  /** What a screen reader hears: "Add a profile picture" */
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  const sign = api.account.imageUpload.useMutation();
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) return;
    if (!TYPES.includes(file.type)) return toast.error("Use a JPG, PNG, WebP or GIF image");
    if (file.size > MAX_BYTES) return toast.error("Use an image under 10 MB");
    setBusy(true);
    try {
      const declared = await declare(file);
      const signed = await sign.mutateAsync(declared);
      await putToStorage(file, signed, declared.checksum);
      onChange(signed.fileUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't upload the image.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <label
      htmlFor={id}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        void pick(event.dataTransfer.files[0]);
      }}
      className={cn(
        "group focus-within:ring-ring relative block cursor-pointer overflow-hidden focus-within:ring-2",
        over && "ring-primary ring-2",
        className,
      )}
    >
      <span className="sr-only">{label}</span>
      {children}
      {busy && (
        <span className="bg-bg/70 absolute inset-0 flex items-center justify-center">
          <Loader2 className="size-6 animate-spin" />
        </span>
      )}
      <input
        id={id}
        type="file"
        accept={TYPES.join(",")}
        className="sr-only"
        disabled={busy}
        onChange={(event) => {
          void pick(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
    </label>
  );
}

/** The small "change" badge in a picture's corner. */
export function ChangeBadge({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "bg-fg text-bg absolute flex size-8 items-center justify-center rounded-full border-2 border-[var(--color-surface)] shadow transition-transform group-hover:scale-110",
        className,
      )}
    >
      <Camera className="size-4" />
    </span>
  );
}
