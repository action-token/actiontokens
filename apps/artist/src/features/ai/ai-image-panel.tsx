"use client";

import { Check, ImagePlus, Loader2, RefreshCw, Sparkles, X } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

import type { FillForm } from "@bandcoin/api";
import { Button } from "@bandcoin/ui/components/button";
import { Textarea } from "@bandcoin/ui/components/textarea";
import { cn } from "@bandcoin/ui/lib/cn";

import { api } from "~/trpc/react";

import { AiQuota } from "./shared";

const ASPECT_CLASS = {
  square: "aspect-square max-w-64",
  wide: "aspect-[3/2]",
  portrait: "aspect-[2/3] max-w-56",
} as const;

/**
 * "Generate with AI" for an image field. It opens in place (no popup): a brief
 * written from the form, a preview, then "Use this image". Nothing changes
 * until the artist picks it.
 */
export function AiImagePanel({
  form,
  suggestedPrompt,
  aspect = "wide",
  onImage,
  label = "Generate with AI",
}: {
  form: FillForm;
  /** A starting brief built from the form (title and description, or the AI fill's image brief). */
  suggestedPrompt: string;
  aspect?: keyof typeof ASPECT_CLASS;
  onImage: (url: string) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState(suggestedPrompt);
  const [url, setUrl] = useState<string | null>(null);
  const utils = api.useUtils();
  const generate = api.ai.generateImage.useMutation({
    onSuccess: (result) => {
      setUrl(result.url);
      void utils.ai.usage.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="justify-self-start"
        onClick={() => {
          if (!url && suggestedPrompt) setPrompt(suggestedPrompt);
          setOpen(true);
        }}
      >
        <Sparkles className="text-primary-text" /> {label}
      </Button>
    );
  }

  return (
    <div className="bg-surface-2 grid gap-3 rounded-xl border p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <ImagePlus className="text-primary-text size-4" /> Generate an image
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Close"
          disabled={generate.isPending}
          onClick={() => setOpen(false)}
        >
          <X />
        </Button>
      </div>
      <div
        className={cn(
          "bg-surface relative w-full overflow-hidden rounded-lg border",
          ASPECT_CLASS[aspect],
        )}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Generated" className="size-full object-cover" />
        ) : (
          <div className="text-fg-muted flex size-full flex-col items-center justify-center gap-2 p-4 text-center text-sm">
            {generate.isPending ? (
              <>
                <Loader2 className="text-primary-text size-6 animate-spin" />
                Creating your image. This takes up to a minute…
              </>
            ) : (
              <>
                <ImagePlus className="text-fg-faint size-8" />
                Your image appears here
              </>
            )}
          </div>
        )}
      </div>
      <Textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        rows={3}
        maxLength={1500}
        className="bg-surface resize-none"
        aria-label="Image description"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <AiQuota kind="image" />
        <div className="flex gap-2">
          <Button
            type="button"
            variant={url ? "outline" : "default"}
            disabled={generate.isPending || prompt.trim().length < 3}
            onClick={() => generate.mutate({ form, prompt, aspect })}
          >
            {generate.isPending ? (
              <Loader2 className="animate-spin" />
            ) : url ? (
              <RefreshCw />
            ) : (
              <Sparkles />
            )}
            {generate.isPending ? "Generating…" : url ? "Try again" : "Generate"}
          </Button>
          {url && (
            <Button
              type="button"
              disabled={generate.isPending}
              onClick={() => {
                onImage(url);
                setOpen(false);
                setUrl(null);
              }}
            >
              <Check /> Use this image
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
