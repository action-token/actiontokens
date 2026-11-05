"use client";

import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState } from "react";

import { Button } from "@bandcoin/ui/components/button";
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
      <h1 className="sr-only">Music</h1>

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

      <div className="shrink-0 px-4 pt-2 pb-4 sm:px-6">
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
