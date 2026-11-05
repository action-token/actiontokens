"use client";

import { Loader2, Plus, Save, SlidersHorizontal, UploadCloud } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@bandcoin/ui/components/button";
import { cn } from "@bandcoin/ui/lib/cn";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";
import { useConnectWalletDialogStore } from "@bandcoin/wallet";

import { api } from "~/trpc/react";

import { ARTIST_URL } from "../shell/nav";
import { ProjectsMenu } from "./projects-menu";
import { PublishButton } from "./publish-button";
import { AddAudioPanel } from "./sources";
import { StartScreen } from "./start-screen";
import { Timeline } from "./timeline";
import { Transport } from "./transport";
import { useMixer } from "./use-mixer";

/**
 * Studio › Mixer, a small audio editor anyone can use: put your Lyria music
 * and your own files on a timeline, move, trim, split, duplicate and fade
 * clips, set each track's volume and pan, mute and solo, undo anything, then
 * export a WAV. Projects save to your account; approved artists can publish
 * the song to Bandcoin.
 */
export function MixerView() {
  const { status } = useSession();
  const openSignIn = useConnectWalletDialogStore((state) => state.setIsOpen);
  const mixer = useMixer();
  const me = api.account.me.useQuery(undefined, { enabled: status === "authenticated" });
  const utils = api.useUtils();
  const search = useSearchParams();
  const fromRun = search.get("run");
  const added = useRef<string | null>(null);
  const [panel, setPanel] = useState(false);
  const [dropping, setDropping] = useState(false);

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
      <div className="px-4 py-10 sm:px-8">
        <EmptyState
          icon={SlidersHorizontal}
          title="Sign in to mix"
          description="Put your Lyria music and your own files on a timeline, cut, fade and mix them, and export a WAV."
          action={<Button onClick={() => openSignIn(true)}>Sign in</Button>}
        />
      </div>
    );

  return (
    <div
      className="relative flex h-[calc(100dvh-8.5rem)] flex-col sm:h-dvh"
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        setDropping(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDropping(false);
        mixer.uploadFiles([...event.dataTransfer.files]);
      }}
    >
      <h1 className="sr-only">Mixer</h1>
      <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 py-3 sm:px-6">
        <input
          aria-label="Project name"
          value={mixer.name}
          maxLength={80}
          onChange={(event) => mixer.setName(event.target.value)}
          className="display hover:bg-surface-2/60 focus:bg-surface-2 min-w-0 flex-1 truncate rounded-xl bg-transparent px-2 py-1 text-2xl outline-none sm:text-3xl"
        />
        {mixer.dirty && !mixer.empty && (
          <span className="text-fg-faint hidden text-xs font-semibold sm:inline">Not saved</span>
        )}
        <ProjectsMenu mixer={mixer} />
        {!mixer.empty && (
          <Button variant="outline" onClick={() => setPanel(true)}>
            <Plus /> Add audio
          </Button>
        )}
        <PublishButton
          mixer={mixer}
          status={me.data?.artist?.status ?? null}
          artistUrl={ARTIST_URL}
        />
        <Button
          disabled={mixer.saving || mixer.empty || (!mixer.dirty && mixer.projectId !== null)}
          onClick={mixer.save}
        >
          {mixer.saving ? <Loader2 className="animate-spin" /> : <Save />}
          {mixer.saving ? "Saving…" : mixer.dirty || !mixer.projectId ? "Save" : "Saved"}
        </Button>
      </div>

      {mixer.publishedUrl && (
        <a
          href={mixer.publishedUrl}
          target="_blank"
          rel="noreferrer"
          className="bg-primary-soft text-primary-text mx-4 mb-2 rounded-xl px-3 py-2 text-sm font-semibold hover:underline sm:mx-6"
        >
          Your mix and stems are ready: open the new-song form in the artist portal
        </a>
      )}

      {mixer.empty ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <StartScreen mixer={mixer} />
        </div>
      ) : (
        <div className="bg-surface/70 mx-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.6rem] border-2 sm:mx-6">
          <Timeline mixer={mixer} onAdd={() => setPanel(true)} />
        </div>
      )}

      {!mixer.empty && (
        <div className="shrink-0 px-4 pt-3 pb-4 sm:px-6">
          <Transport mixer={mixer} />
        </div>
      )}

      <AddAudioPanel mixer={mixer} open={panel} onOpenChange={setPanel} />

      <div
        aria-hidden
        className={cn(
          "bg-bg/80 border-primary pointer-events-none absolute inset-3 z-40 grid place-items-center rounded-[1.6rem] border-4 border-dashed opacity-0 transition-opacity",
          dropping && "opacity-100",
        )}
      >
        <span className="grid justify-items-center gap-2 text-lg font-bold">
          <UploadCloud className="text-primary-text size-10" />
          Drop to add as tracks
        </span>
      </div>
    </div>
  );
}
