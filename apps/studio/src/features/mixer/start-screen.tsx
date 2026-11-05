"use client";

import { TallText } from "@bandcoin/ui/patterns/tall-text";

import { LyriaList, UploadZone } from "./sources";
import type { Mixer } from "./use-mixer";

/** An empty mix: what the mixer is for, and the two ways to start. */
export function StartScreen({ mixer }: { mixer: Mixer }) {
  return (
    <div className="mx-auto grid w-full max-w-3xl content-center gap-8 px-4 py-10 sm:px-6">
      <div className="grid justify-items-center gap-1 text-center">
        <TallText center className="pb-[0.12em] text-6xl sm:text-7xl">
          Mixer
        </TallText>
        <p className="marker text-primary-text -rotate-1 text-lg">
          *layer your music, cut it, fade it, export a WAV*
        </p>
        <p className="text-fg-muted mt-2 max-w-md text-sm">
          Anyone can make and edit music here. Artists can publish the finished song to Bandcoin.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <UploadZone mixer={mixer} large />
        <section className="bg-surface/80 grid content-start gap-3 rounded-[1.6rem] border-2 p-4">
          <h2 className="marker text-primary-text text-lg">*your lyria music*</h2>
          <div className="max-h-48 overflow-y-auto">
            <LyriaList mixer={mixer} />
          </div>
        </section>
      </div>
      <p className="text-fg-faint text-center text-xs">
        Tip: drop audio anywhere on this page. Space plays, S splits, ⌘Z undoes.
      </p>
    </div>
  );
}
