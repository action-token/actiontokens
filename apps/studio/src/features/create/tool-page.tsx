"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@bandcoin/ui/components/button";
import { TallText } from "@bandcoin/ui/patterns/tall-text";
import { useConnectWalletDialogStore } from "@bandcoin/wallet";

import { api } from "~/trpc/react";

import { TOOL_PAGES, type ToolId } from "../shell/nav";
import { buildInput, Composer, type Settings } from "./composer";
import { Exchange } from "./result";

/** What each tool says on its empty page, and ideas to start from. */
export const TOOL_COPY: Record<ToolId, { note: string; placeholder: string; ideas: string[] }> = {
  IMAGE: {
    note: "covers, posters and art from a sentence",
    placeholder: "Describe an image: a cover, a poster, a scene…",
    ideas: [
      "Album cover: a neon-lit rainy street at night, a lone guitarist, cinematic",
      "Tour poster, bold type, 70s colours, desert road",
      "A watercolor portrait of a jazz singer on a small stage",
    ],
  },
  VIDEO: {
    note: "short clips with sound for posts and promos",
    placeholder: "Describe a short clip: the scene, the camera, the mood…",
    ideas: [
      "Slow dolly shot through a smoky club, crowd dancing, warm lights",
      "Vinyl spinning in close-up, dust in a sunbeam, lo-fi mood",
    ],
  },
  TEXT: {
    note: "bios, descriptions and lyric drafts",
    placeholder: "What should it write? A bio, a release note, lyrics…",
    ideas: [
      "A 100-word artist bio for an indie folk duo from Lisbon",
      "Liner notes for a late-night jazz EP, warm and personal",
      "A chorus about leaving a small town, hopeful, 4 lines",
    ],
  },
  SOCIAL: {
    note: "posts for your channels, in a few versions",
    placeholder: "What's the post about? A release, a show, a drop…",
    ideas: [
      "My new single drops Friday",
      "Tickets for the Berlin show are live",
      "Thank you for 10k fans",
    ],
  },
  SEO: {
    note: "articles and pages people find",
    placeholder: "What should the article be about?",
    ideas: ["How to start collecting music NFTs", "The story behind our new album"],
  },
};

/**
 * One tool, chat style: your runs as a thread (newest at the bottom, the
 * running ones refreshing), and the prompt box pinned under it.
 */
export function ToolPage({ tool }: { tool: ToolId }) {
  const page = TOOL_PAGES[tool];
  const copy = TOOL_COPY[tool];
  const { status } = useSession();
  const signedIn = status === "authenticated";
  const openSignIn = useConnectWalletDialogStore((state) => state.setIsOpen);
  const utils = api.useUtils();
  const [prompt, setPrompt] = useState("");
  const [settings, setSettings] = useState<Settings>({});
  const end = useRef<HTMLDivElement>(null);

  const runs = api.generate.library.useInfiniteQuery(
    { type: tool },
    {
      enabled: signedIn,
      getNextPageParam: (last) => last.nextCursor,
      // Keep refreshing while something is still being made.
      refetchInterval: (query) =>
        query.state.data?.pages.some((p) =>
          p.items.some((run) => run.status === "QUEUED" || run.status === "RUNNING"),
        )
          ? 3000
          : false,
    },
  );
  const prices = api.coins.prices.useQuery(undefined, { staleTime: 60_000 });
  const nameOf = (id: string | null) =>
    prices.data?.models.find((model) => model.id === id)?.name ?? id ?? "";
  const items = (runs.data?.pages.flatMap((p) => p.items) ?? []).slice().reverse();

  const start = api.generate.start.useMutation({
    onSuccess: async () => {
      setPrompt("");
      await Promise.all([utils.generate.library.invalidate(), utils.coins.balance.invalidate()]);
    },
  });

  // Open at the latest (or at the run in the link), and follow new ones.
  const count = items.length;
  useEffect(() => {
    const target = window.location.hash ? document.querySelector(window.location.hash) : null;
    (target ?? end.current)?.scrollIntoView({ block: target ? "center" : "end" });
  }, [count]);

  const short = start.error?.message.match(/needs \d+ coins/);
  return (
    <div className="flex h-[calc(100dvh-8.5rem)] flex-col sm:h-dvh">
      <header className="flex shrink-0 items-end gap-3 border-b px-4 py-4 sm:px-8">
        <span className="bg-primary text-primary-foreground blob flex size-10 items-center justify-center">
          <page.icon className="size-5" strokeWidth={2.4} />
        </span>
        <span className="min-w-0">
          <TallText className="pb-0 text-4xl">{page.label}</TallText>
          <span className="marker text-primary-text block -rotate-1 text-sm">*{copy.note}*</span>
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid w-full max-w-3xl gap-8 px-4 py-6 sm:px-6">
          {runs.hasNextPage && (
            <Button
              variant="ghost"
              size="sm"
              className="justify-self-center"
              disabled={runs.isFetchingNextPage}
              onClick={() => void runs.fetchNextPage()}
            >
              Show earlier
            </Button>
          )}
          {signedIn && items.length === 0 && !runs.isPending && (
            <Ideas ideas={copy.ideas} onPick={setPrompt} />
          )}
          {!signedIn && status !== "loading" && (
            <div className="grid justify-items-center gap-3 py-16 text-center">
              <p className="text-fg-muted max-w-sm">
                Sign in to make {page.label.toLowerCase()}. Each run shows its price in coins first:
                one coin is one cent.
              </p>
              <Button onClick={() => openSignIn(true)}>Sign in</Button>
            </div>
          )}
          <ol className="grid gap-10">
            {items.map((run) => (
              <Exchange key={run.id} run={run} modelName={nameOf(run.model)} onReuse={setPrompt} />
            ))}
          </ol>
          <div ref={end} />
        </div>
      </div>

      <div className="from-bg via-bg/95 shrink-0 bg-gradient-to-t to-transparent px-4 pt-2 pb-4 sm:px-6">
        <div className="mx-auto w-full max-w-3xl">
          {start.error && (
            <p role="alert" className="text-danger mb-2 px-2 text-sm">
              {start.error.message}{" "}
              {short && (
                <Link href="/coins" className="font-semibold underline">
                  Top up
                </Link>
              )}
            </p>
          )}
          <Composer
            tool={tool}
            prompt={prompt}
            onPrompt={setPrompt}
            settings={settings}
            onSettings={setSettings}
            busy={start.isPending}
            placeholder={copy.placeholder}
            onSubmit={() => {
              if (!signedIn) return openSignIn(true);
              start.mutate(buildInput(tool, prompt, settings));
            }}
          />
        </div>
      </div>
    </div>
  );
}

function Ideas({ ideas, onPick }: { ideas: string[]; onPick: (idea: string) => void }) {
  return (
    <div className="grid gap-3 py-10">
      <p className="marker text-fg-muted text-center text-lg">*try one of these*</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {ideas.map((idea) => (
          <button
            key={idea}
            type="button"
            onClick={() => onPick(idea)}
            className="bg-surface hover:border-fg/40 rounded-2xl border-2 p-4 text-left text-sm transition-colors"
          >
            {idea}
          </button>
        ))}
      </div>
    </div>
  );
}
