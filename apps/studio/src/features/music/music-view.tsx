"use client";

import { AudioLines } from "lucide-react";
import { useSession } from "next-auth/react";

import { Button } from "@bandcoin/ui/components/button";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";
import { useConnectWalletDialogStore } from "@bandcoin/wallet";

import { api } from "~/trpc/react";

import { MusicGenerator } from "./generator";
import { MusicRuns } from "./runs";

/** Studio › Music: make clips and songs with Lyria, then play, download or mix them. */
export function MusicView() {
  const { status } = useSession();
  const openSignIn = useConnectWalletDialogStore((state) => state.setIsOpen);
  const balance = api.coins.balance.useQuery(undefined, { enabled: status === "authenticated" });

  if (status === "unauthenticated")
    return (
      <EmptyState
        icon={AudioLines}
        title="Sign in to make music"
        description="Describe a beat or a song and Google's Lyria makes it. Each run shows its price first."
        action={<Button onClick={() => openSignIn(true)}>Sign in</Button>}
      />
    );

  return (
    <div className="mx-auto grid max-w-4xl gap-8">
      <header className="grid gap-2">
        <p className="marker text-primary-text text-sm">*music*</p>
        <h1 className="display text-4xl">Make music</h1>
        <p className="text-fg-muted text-sm">
          Clips and full songs from a description, made by Google&apos;s Lyria.
        </p>
      </header>
      <MusicGenerator balance={balance.data?.coins ?? null} />
      <section className="grid gap-4">
        <h2 className="display text-xl">Your music</h2>
        <MusicRuns />
      </section>
    </div>
  );
}
