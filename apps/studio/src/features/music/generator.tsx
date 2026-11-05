"use client";

import { ArrowUp, Check, ChevronDown, Coins, Loader2, Wand2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import toast from "react-hot-toast";

import { Popover, PopoverContent, PopoverTrigger } from "@bandcoin/ui/components/popover";
import { cn } from "@bandcoin/ui/lib/cn";

import { api } from "~/trpc/react";

type Kind = "CLIP" | "SONG";

/** Music's two "models": Google's Lyria 3 Clip and Lyria 3 Pro. */
const KINDS: { value: Kind; label: string; hint: string; tool: "MUSIC_CLIP" | "MUSIC_SONG" }[] = [
  { value: "CLIP", label: "Lyria 3 Clip", hint: "About 30 seconds", tool: "MUSIC_CLIP" },
  {
    value: "SONG",
    label: "Lyria 3 Pro",
    hint: "A full song, with lyrics if you write them",
    tool: "MUSIC_SONG",
  },
];

/**
 * Music's prompt box, like the other tools': describe the music, pick a clip
 * or a full song in the model menu, Enhance, and Generate with its price.
 * The coins are held until it's ready and come back if it doesn't work.
 */
export function MusicGenerator({
  balance,
  prompt,
  onPrompt,
}: {
  balance: number | null;
  prompt: string;
  onPrompt: (prompt: string) => void;
}) {
  const utils = api.useUtils();
  const prices = api.coins.prices.useQuery(undefined, { staleTime: 60_000 });
  const enhance = api.generate.enhance.useMutation({
    onSuccess: (result) => onPrompt(result.prompt),
  });
  const [kind, setKind] = useState<Kind>("CLIP");
  const start = api.music.start.useMutation({
    onSuccess: () => {
      toast.success("Started. It shows above when it's ready.");
      onPrompt("");
      void Promise.all([
        utils.music.recent.invalidate(),
        utils.generate.library.invalidate(),
        utils.coins.balance.invalidate(),
        utils.coins.ledger.invalidate(),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });
  const chosen = KINDS.find((entry) => entry.value === kind)!;
  const price = prices.data?.music[chosen.tool] ?? null;
  const short = price !== null && balance !== null && balance < price;
  const ready = prompt.trim().length >= 3 && !short && !start.isPending;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) start.mutate({ kind, prompt });
      }}
      className="bg-surface focus-within:border-fg/40 grid gap-2 rounded-[1.6rem] border-2 p-3 shadow-[0_10px_40px_-20px_rgb(0_0_0/0.5)]"
    >
      <textarea
        aria-label="Describe the music"
        value={prompt}
        rows={2}
        maxLength={2000}
        placeholder="Describe the genre, mood, instruments and tempo. For a song, add your own lyrics."
        onChange={(event) => onPrompt(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            if (ready) start.mutate({ kind, prompt });
          }
        }}
        className="placeholder:text-fg-faint [field-sizing:content] max-h-60 min-h-14 w-full resize-none bg-transparent px-2 pt-1 text-[15px] outline-none"
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <Popover>
          <PopoverTrigger className="bg-fg text-bg flex h-8 items-center gap-1.5 rounded-full pr-2 pl-3 text-[13px] font-bold">
            {chosen.label} <ChevronDown className="size-3.5" />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-1.5">
            <p className="marker text-fg-muted px-2 py-1 text-sm">*google*</p>
            {KINDS.map((entry) => (
              <button
                key={entry.value}
                type="button"
                onClick={() => setKind(entry.value)}
                className={cn(
                  "hover:bg-surface-2 grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-xl px-2.5 py-2 text-left",
                  entry.value === kind && "bg-surface-2",
                )}
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    {entry.label}
                    {entry.value === kind && <Check className="text-primary-text size-3.5" />}
                  </span>
                  <span className="text-fg-muted block text-xs">{entry.hint}</span>
                </span>
                <span className="text-fg-faint flex items-center gap-1 text-xs font-semibold tabular-nums">
                  <Coins className="size-3" /> {prices.data?.music[entry.tool] ?? "…"}
                </span>
              </button>
            ))}
          </PopoverContent>
        </Popover>
        <button
          type="button"
          title="Enhance: rewrite your prompt with more detail (free)"
          disabled={prompt.trim().length < 3 || enhance.isPending}
          onClick={() => enhance.mutate({ tool: "MUSIC", prompt })}
          className="text-fg-muted hover:text-fg hover:bg-surface-2 flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-semibold transition-colors disabled:opacity-40"
        >
          {enhance.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Wand2 className="size-3.5" />
          )}
          Enhance
        </button>
        {short && (
          <Link
            href="/coins"
            className="text-primary-text text-[13px] font-semibold hover:underline"
          >
            Not enough coins: top up
          </Link>
        )}
        <span className="flex-1" />
        <button
          type="submit"
          disabled={!ready}
          className="bg-primary text-primary-foreground flex h-10 items-center gap-2 rounded-full pr-1.5 pl-4 text-sm font-bold transition-transform hover:scale-[1.02] disabled:opacity-40 disabled:hover:scale-100"
        >
          {start.isPending ? "Starting…" : "Generate"}
          <span className="bg-primary-foreground text-primary flex h-7 items-center gap-1 rounded-full px-2 text-xs tabular-nums">
            <Coins className="size-3.5" />
            {price ?? "…"}
            <ArrowUp className="size-3.5" strokeWidth={3} />
          </span>
        </button>
      </div>
      {enhance.error && (
        <p role="alert" className="text-danger px-2 text-xs">
          {enhance.error.message}
        </p>
      )}
    </form>
  );
}
