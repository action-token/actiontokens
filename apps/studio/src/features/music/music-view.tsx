"use client";

import { AudioLines } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState } from "react";

import { Button } from "@bandcoin/ui/components/button";
import { TallText } from "@bandcoin/ui/patterns/tall-text";
import { useConnectWalletDialogStore } from "@bandcoin/wallet";

import { api } from "~/trpc/react";

import { LiveJam } from "../live/live-jam";
import { MusicGenerator } from "./generator";
import { MusicRuns } from "./runs";

/**
 * Studio › Music, laid out like the other tools: your tracks (and a live jam)
 * above, the prompt box pinned under them. Clips and full songs are made by
 * Google's Lyria; play, download or take them to the mixer.
 */
export function MusicView() {
  const { status } = useSession();
  const openSignIn = useConnectWalletDialogStore((state) => state.setIsOpen);
  const balance = api.coins.balance.useQuery(undefined, { enabled: status === "authenticated" });
  // The home page's prompt box hands its text over here.
  const [prompt, setPrompt] = useState(useSearchParams().get("prompt") ?? "");

  return (
    <div className="flex h-[calc(100dvh-8.5rem)] flex-col sm:h-dvh">
      <header className="flex shrink-0 items-end gap-3 border-b px-4 py-4 sm:px-8">
        <span className="bg-primary text-primary-foreground blob flex size-10 items-center justify-center">
          <AudioLines className="size-5" strokeWidth={2.4} />
        </span>
        <span className="min-w-0">
          <TallText className="pb-0 text-4xl">Music</TallText>
          <span className="marker text-primary-text block -rotate-1 text-sm">
            *clips, full songs and live jams with Lyria*
          </span>
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-6 sm:px-6">
          {status === "unauthenticated" ? (
            <div className="grid justify-items-center gap-3 py-16 text-center">
              <p className="text-fg-muted max-w-sm">
                Sign in to make music. Each run shows its price in coins first: one coin is one
                cent.
              </p>
              <Button onClick={() => openSignIn(true)}>Sign in</Button>
            </div>
          ) : (
            <>
              <LiveJam balance={balance.data?.coins ?? null} />
              <MusicRuns mixerLink />
            </>
          )}
        </div>
      </div>

      <div className="from-bg via-bg/95 shrink-0 bg-gradient-to-t to-transparent px-4 pt-2 pb-4 sm:px-6">
        <div className="mx-auto w-full max-w-3xl">
          <MusicGenerator
            balance={balance.data?.coins ?? null}
            prompt={prompt}
            onPrompt={setPrompt}
          />
        </div>
      </div>
    </div>
  );
}
