"use client";

import { Loader2, Sparkles, Undo2, Wand2 } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

import type { FillForm, FillResult } from "@bandcoin/api";
import { Button } from "@bandcoin/ui/components/button";
import { Textarea } from "@bandcoin/ui/components/textarea";

import { api } from "~/trpc/react";

import { AiQuota, localNow } from "./shared";

/**
 * "Fill with AI" at the top of a create form: describe it in a sentence and
 * every field is filled in for review. `apply` writes the result into the form
 * and returns an undo function, so the artist can take it all back.
 */
export function AiFillCard<F extends FillForm>({
  form,
  context,
  apply,
  examples,
}: {
  form: F;
  /** Current form values, so the AI can build on what's there. */
  context?: Record<string, string>;
  apply: (result: FillResult<F>) => (() => void) | void;
  examples?: string[];
}) {
  const [prompt, setPrompt] = useState("");
  const [undo, setUndo] = useState<(() => void) | null>(null);
  const fill = api.ai.fillForm.useMutation({
    onSuccess: (result) => {
      setUndo(() => apply(result as FillResult<F>) ?? null);
      toast.success("Filled in. Review everything before you save.");
    },
    onError: (error) => toast.error(error.message),
  });

  const ready = prompt.trim().length >= 3;
  const run = () => fill.mutate({ form, prompt, ...localNow(), context: context ?? {} });

  return (
    <section className="border-primary/30 from-primary/10 via-surface to-surface relative overflow-hidden rounded-[1.4rem] border-2 bg-linear-to-br p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="bg-primary text-primary-foreground flex size-7 -rotate-6 items-center justify-center rounded-lg">
          <Sparkles className="size-4" />
        </span>
        <h2 className="display text-xl">Fill with AI</h2>
        <AiQuota kind="text" className="ml-auto" />
      </div>
      <Textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && ready) {
            event.preventDefault();
            run();
          }
        }}
        rows={2}
        maxLength={2000}
        placeholder="Describe what you want in a sentence or two…"
        className="bg-surface resize-none"
        aria-label="Describe what you want the AI to fill in"
      />
      {examples && !prompt && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {examples.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setPrompt(example)}
              className="bg-surface text-fg-muted hover:border-primary/40 hover:text-fg rounded-full border px-2.5 py-1 text-xs transition-colors"
            >
              {example}
            </button>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center gap-2">
        <p className="text-fg-muted hidden text-xs sm:block">
          Nothing is saved. You review every field first.
        </p>
        <div className="ml-auto flex gap-2">
          {undo && !fill.isPending && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                undo();
                setUndo(null);
              }}
            >
              <Undo2 /> Undo
            </Button>
          )}
          <Button type="button" size="sm" onClick={run} disabled={fill.isPending || !ready}>
            {fill.isPending ? <Loader2 className="animate-spin" /> : <Wand2 />}
            {fill.isPending ? "Filling…" : "Fill form"}
          </Button>
        </div>
      </div>
    </section>
  );
}
