"use client";

import { Coins, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import { Textarea } from "@bandcoin/ui/components/textarea";
import { cn } from "@bandcoin/ui/lib/cn";

import { api } from "~/trpc/react";

type Kind = "CLIP" | "SONG";

const KINDS: { value: Kind; label: string; hint: string; tool: "MUSIC_CLIP" | "MUSIC_SONG" }[] = [
  { value: "CLIP", label: "Clip", hint: "About 30 seconds", tool: "MUSIC_CLIP" },
  {
    value: "SONG",
    label: "Full song",
    hint: "A couple of minutes, with lyrics if you write them",
    tool: "MUSIC_SONG",
  },
];

const IDEAS = [
  "A warm lo-fi hip hop beat with soft piano and vinyl crackle, 85 BPM",
  "Upbeat Afrobeats groove with bright guitars and shakers, instrumental",
  "Cinematic ambient pad that slowly builds, no drums",
];

/**
 * Describe the music, pick a clip or a full song, and generate. The price is
 * on the button; the coins are held until it's ready and come back if it
 * doesn't work.
 */
export function MusicGenerator({ balance }: { balance: number | null }) {
  const utils = api.useUtils();
  const prices = api.coins.prices.useQuery();
  const [kind, setKind] = useState<Kind>("CLIP");
  const [prompt, setPrompt] = useState("");
  const start = api.music.start.useMutation({
    onSuccess: () => {
      toast.success("Started. It shows below when it's ready.");
      setPrompt("");
      void Promise.all([
        utils.music.recent.invalidate(),
        utils.coins.balance.invalidate(),
        utils.coins.ledger.invalidate(),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });
  const price = prices.data?.[KINDS.find((entry) => entry.value === kind)!.tool] ?? null;
  const short = price !== null && balance !== null && balance < price;
  const ready = prompt.trim().length >= 3 && !short;

  return (
    <section className="bg-surface grid gap-4 rounded-[1.4rem] border-2 p-5 sm:p-6">
      <h2 className="display flex items-center gap-2 text-xl">
        <Sparkles className="text-primary-text size-5" /> Make music with Lyria
      </h2>
      <div role="radiogroup" aria-label="Length" className="grid gap-2 sm:grid-cols-2">
        {KINDS.map((entry) => {
          const on = kind === entry.value;
          return (
            <button
              key={entry.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setKind(entry.value)}
              className={cn(
                "grid gap-0.5 rounded-xl border-2 p-3 text-left transition-colors",
                on ? "border-primary bg-primary-soft" : "hover:bg-surface-2",
              )}
            >
              <span className="flex items-center justify-between gap-2 text-sm font-semibold">
                {entry.label}
                {prices.data && (
                  <span className="text-fg-muted text-xs font-medium">
                    {prices.data[entry.tool]} coins
                  </span>
                )}
              </span>
              <span className="text-fg-muted text-xs">{entry.hint}</span>
            </button>
          );
        })}
      </div>
      <Textarea
        aria-label="Describe the music"
        value={prompt}
        rows={4}
        maxLength={2000}
        placeholder="Describe the genre, mood, instruments and tempo. For a song, add your own lyrics."
        onChange={(event) => setPrompt(event.target.value)}
      />
      <div className="flex flex-wrap gap-1.5">
        {IDEAS.map((idea) => (
          <button
            key={idea}
            type="button"
            onClick={() => setPrompt(idea)}
            className="bg-surface-2 text-fg-muted hover:text-fg rounded-full px-3 py-1 text-xs"
          >
            {idea.split(",")[0]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={!ready || start.isPending} onClick={() => start.mutate({ kind, prompt })}>
          {start.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {price === null ? "Generate" : `Generate · ${price} coins`}
        </Button>
        {short && (
          <Link
            href="/coins"
            className="text-primary-text flex items-center gap-1 text-sm font-semibold hover:underline"
          >
            <Coins className="size-4" /> Not enough coins: top up
          </Link>
        )}
        <p className="text-fg-faint text-xs">Coins come back if a run doesn&apos;t work.</p>
      </div>
    </section>
  );
}
