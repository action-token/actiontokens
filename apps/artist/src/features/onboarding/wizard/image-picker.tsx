"use client";

import { ImagePlus, Loader2, X } from "lucide-react";
import { useId, useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import { cn } from "@bandcoin/ui/lib/cn";

import { declare, putToStorage } from "~/lib/upload";
import { api } from "~/trpc/react";

const TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Pick an image and upload it straight to storage. It uses the account's own
 * image upload, so it works before someone is an approved artist.
 */
export function ImagePicker({
  value,
  onChange,
  label,
  hint,
  shape = "square",
  className,
}: {
  value: string;
  onChange: (url: string) => void;
  label: string;
  hint?: string;
  shape?: "round" | "square" | "wide";
  className?: string;
}) {
  const id = useId();
  const sign = api.account.imageUpload.useMutation();
  const [busy, setBusy] = useState(false);

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

  const frame = {
    round: "size-32 rounded-full",
    square: "size-32 rounded-2xl",
    wide: "aspect-[3/1] w-full rounded-2xl",
  }[shape];

  return (
    <div className={cn("grid justify-items-start gap-2", className)}>
      <label
        htmlFor={id}
        className={cn(
          "border-border bg-surface-2 hover:border-fg/40 relative flex cursor-pointer items-center justify-center overflow-hidden border-2 border-dashed transition-colors",
          frame,
          value && "border-solid",
        )}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element -- images come from our storage
          <img src={value} alt="" className="size-full object-cover" />
        ) : (
          <span className="text-fg-muted grid justify-items-center gap-1 p-3 text-center text-xs font-medium">
            <ImagePlus className="size-6" />
            {label}
          </span>
        )}
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
      <div className="flex items-center gap-2">
        {hint && <p className="text-fg-faint text-xs">{hint}</p>}
        {value && (
          <Button type="button" variant="ghost" size="xs" onClick={() => onChange("")}>
            <X /> Remove
          </Button>
        )}
      </div>
    </div>
  );
}
