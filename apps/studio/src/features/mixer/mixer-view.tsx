"use client";

import { Loader2, Rocket, Save, SlidersHorizontal } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useRef } from "react";

import { Button } from "@bandcoin/ui/components/button";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";
import { useConnectWalletDialogStore } from "@bandcoin/wallet";

import { api } from "~/trpc/react";

const ARTIST_URL = process.env.NEXT_PUBLIC_ARTIST_URL ?? "https://artist.bandcoin.io";

import { ProjectsMenu } from "./projects-menu";
import { Sources } from "./sources";
import { Timeline } from "./timeline";
import { Transport } from "./transport";
import { useMixer } from "./use-mixer";

/**
 * Studio › Mixer, ported from bandfan's music studio: put your Lyria music and
 * your own files on a timeline, move and trim them, set each track's volume,
 * mute and solo, then export a WAV. Projects save to your account.
 */
export function MixerView() {
  const { status } = useSession();
  const openSignIn = useConnectWalletDialogStore((state) => state.setIsOpen);
  const mixer = useMixer();
  const me = api.account.me.useQuery(undefined, { enabled: status === "authenticated" });
  const isArtist = me.data?.artist?.status === "APPROVED";
  const utils = api.useUtils();
  const search = useSearchParams();
  const fromRun = search.get("run");
  const added = useRef<string | null>(null);

  // "Add to the mixer" on the Music page opens the mixer with that run as a track.
  useEffect(() => {
    if (!fromRun || status !== "authenticated" || added.current === fromRun) return;
    added.current = fromRun;
    void utils.music.run
      .fetch({ generationId: fromRun })
      .then((run) => {
        const audio = run.outputs[0];
        if (audio) mixer.addAudio({ name: run.prompt.slice(0, 40), url: audio.url });
      })
      .catch(() => undefined);
  }, [fromRun, status, utils, mixer]);

  if (status === "unauthenticated")
    return (
      <EmptyState
        icon={SlidersHorizontal}
        title="Sign in to mix"
        description="Put your Lyria music and your own files on a timeline, mix them and export a WAV."
        action={<Button onClick={() => openSignIn(true)}>Sign in</Button>}
      />
    );

  return (
    <div className="grid gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <div className="grid min-w-0 flex-1 gap-1">
          <p className="marker text-primary-text text-sm">*mixer*</p>
          <input
            aria-label="Project name"
            value={mixer.name}
            maxLength={80}
            onChange={(event) => mixer.setName(event.target.value)}
            className="display min-w-0 bg-transparent text-3xl outline-none"
          />
        </div>
        <ProjectsMenu mixer={mixer} />
        {isArtist && (
          <Button
            variant="outline"
            disabled={mixer.project.tracks.length === 0 || mixer.publishing !== null}
            onClick={() => mixer.publish(ARTIST_URL)}
            title="Render the mix and its stems and open the portal's new-song form"
          >
            {mixer.publishing ? <Loader2 className="animate-spin" /> : <Rocket />}
            {mixer.publishing ?? "Publish as a song"}
          </Button>
        )}
        <Button
          disabled={mixer.saving || (!mixer.dirty && mixer.projectId !== null)}
          onClick={mixer.save}
        >
          {mixer.saving ? <Loader2 className="animate-spin" /> : <Save />}
          {mixer.saving ? "Saving…" : mixer.dirty || !mixer.projectId ? "Save" : "Saved"}
        </Button>
      </header>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="grid min-w-0 content-start gap-3">
          <Transport mixer={mixer} />
          {mixer.project.tracks.length === 0 ? (
            <div className="bg-surface text-fg-muted grid min-h-48 place-items-center rounded-xl border border-dashed p-6 text-center text-sm">
              Add audio from the right: your Lyria music or files from your device.
            </div>
          ) : (
            <Timeline mixer={mixer} />
          )}
          {mixer.publishedUrl && (
            <a
              href={mixer.publishedUrl}
              target="_blank"
              rel="noreferrer"
              className="bg-primary-soft text-primary-text rounded-lg px-3 py-2 text-sm font-semibold hover:underline"
            >
              Your mix and stems are ready: open the new-song form in the artist portal
            </a>
          )}
          <p className="text-fg-faint text-xs">
            Drag a clip to move it, drag its edges to trim. Mute and solo on each track; click the
            ruler to jump.
          </p>
        </div>
        <Sources mixer={mixer} />
      </div>
    </div>
  );
}
