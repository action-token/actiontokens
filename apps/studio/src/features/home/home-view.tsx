"use client";

import { ArrowRight, Coins } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState } from "react";

import { cn } from "@bandcoin/ui/lib/cn";
import { TallText } from "@bandcoin/ui/patterns/tall-text";
import { useConnectWalletDialogStore } from "@bandcoin/wallet";

import { api } from "~/trpc/react";

import { buildInput, Composer, type Settings } from "../create/composer";
import { TOOL_COPY } from "../create/tool-page";
import { CreationGrid } from "../library/library-view";
import { type RunType, TOOL_PAGES } from "../shell/nav";

const CHIPS: RunType[] = ["IMAGE", "VIDEO", "MUSIC", "TEXT", "SOCIAL", "SEO"];

/**
 * Studio's front page, as on the old Bandcoin AI home and in Gemini: LET'S
 * CREATE, one prompt box with the tools as chips, then your latest creations.
 * Sending starts the run and opens its tool, where it appears in the thread.
 */
export function HomeView() {
  const router = useRouter();
  const { status } = useSession();
  const signedIn = status === "authenticated";
  const openSignIn = useConnectWalletDialogStore((state) => state.setIsOpen);
  const [tool, setTool] = useState<RunType>("IMAGE");
  const [prompt, setPrompt] = useState("");
  const [settings, setSettings] = useState<Settings>({});
  const balance = api.coins.balance.useQuery(undefined, { enabled: signedIn });
  const recent = api.generate.library.useQuery({}, { enabled: signedIn });
  const start = api.generate.start.useMutation({
    onSuccess: () => router.push(TOOL_PAGES[tool].href),
  });

  const chips = (
    <div role="tablist" aria-label="What to make" className="flex flex-wrap justify-center gap-1.5">
      {CHIPS.map((entry) => {
        const page = TOOL_PAGES[entry];
        return (
          <button
            key={entry}
            type="button"
            role="tab"
            aria-selected={tool === entry}
            onClick={() => {
              setTool(entry);
              setSettings({});
            }}
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors",
              tool === entry
                ? "bg-primary text-primary-foreground"
                : "bg-surface-2 text-fg-muted hover:text-fg",
            )}
          >
            <page.icon className="size-4" /> {page.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="mx-auto grid w-full max-w-[80rem] gap-14 px-4 pt-5 pb-10 sm:px-8 lg:pt-8">
      <section className="grid justify-items-center gap-6 text-center">
        <p className="marker text-primary-text -rotate-2 text-xl">*make it with AI*</p>
        <TallText center className="pb-[0.12em] text-7xl sm:text-8xl">
          Let&apos;s create
        </TallText>
        <p className="text-fg-muted max-w-lg">
          Images, video, music and words for your releases, with Google and OpenAI. Every run shows
          its price first, in coins: one coin is one cent.
        </p>
        <div className="w-full max-w-3xl text-left">
          {tool === "MUSIC" ? (
            <div className="grid gap-2">
              {chips}
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  router.push(`/music?prompt=${encodeURIComponent(prompt)}`);
                }}
                className="studio-prompt bg-surface/95 grid gap-2 rounded-[1.6rem] border-2 p-3"
              >
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  rows={2}
                  aria-label="Prompt"
                  placeholder="Describe the music: the genre, mood, instruments and tempo…"
                  className="placeholder:text-fg-faint min-h-14 w-full resize-none bg-transparent px-2 pt-1 text-[15px] outline-none"
                />
                <button
                  type="submit"
                  className="bg-primary text-primary-foreground flex h-10 items-center gap-2 justify-self-end rounded-full px-4 text-sm font-bold"
                >
                  Continue in Music <ArrowRight className="size-4" />
                </button>
              </form>
            </div>
          ) : (
            <Composer
              tool={tool}
              prompt={prompt}
              onPrompt={setPrompt}
              settings={settings}
              onSettings={setSettings}
              busy={start.isPending}
              placeholder={TOOL_COPY[tool].placeholder}
              above={chips}
              autoFocus
              onSubmit={() => {
                if (!signedIn) return openSignIn(true);
                start.mutate(buildInput(tool, prompt, settings));
              }}
            />
          )}
          {start.error && (
            <p role="alert" className="text-danger mt-2 px-2 text-sm">
              {start.error.message}{" "}
              {/needs \d+ coins/.test(start.error.message) && (
                <Link href="/coins" className="font-semibold underline">
                  Top up
                </Link>
              )}
            </p>
          )}
        </div>
        {signedIn && balance.data && (
          <Link
            href="/coins"
            className="text-fg-muted hover:text-fg flex items-center gap-1.5 text-sm font-semibold"
          >
            <Coins className="text-primary-text size-4" />
            {balance.data.coins.toLocaleString("en-US")} coins · top up
          </Link>
        )}
      </section>

      {signedIn && (recent.data?.items.length ?? 0) > 0 && (
        <section className="grid gap-4">
          <div className="flex items-end justify-between gap-3">
            <TallText className="pb-0 text-4xl">Recent</TallText>
            <Link href="/library" className="text-fg-muted hover:text-fg text-sm font-semibold">
              See all
            </Link>
          </div>
          <CreationGrid runs={recent.data!.items.slice(0, 8)} />
        </section>
      )}
    </div>
  );
}
