"use client";

import {
  CheckCircle2,
  Disc3,
  Download,
  FileText,
  Headphones,
  Loader2,
  Music,
  Radio,
  RefreshCw,
  Video,
  X,
  MonitorPlay,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@actiontokens/ui/components/button";
import { Dialog, DialogContent, DialogTitle } from "@actiontokens/ui/components/dialog";
import { cn } from "@actiontokens/ui/lib/cn";
import { Markdown } from "@actiontokens/ui/patterns/markdown";
import { MarkdownEditor } from "@actiontokens/ui/patterns/markdown-editor";
import { EmptyState } from "@actiontokens/ui/patterns/empty-state";

import { timeAgo } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

type Bounty = RouterOutputs["bounty"]["byId"];
type Music = NonNullable<Bounty["music"]>;
type Media = { url: string; type: string };

const TRUNCATE = 250;

/**
 * "My Reports", as before: your listening progress on music bounties
 * (connect Last.fm, sync, per-song plays), the report editor while you can
 * submit, and everything you've sent.
 */
export function BountyReports({ bounty, canSubmit }: { bounty: Bounty; canSubmit: boolean }) {
  const [media, setMedia] = useState<Media | null>(null);
  const me = bounty.me;
  const takesReports = !bounty.music || bounty.music.mode === "HYBRID";

  return (
    <div className="grid gap-6">
      {bounty.music && me?.joinedAt && <ListeningProgress bounty={bounty} music={bounty.music} />}
      {takesReports && (
        <>
          {canSubmit && <ReportForm bountyId={bounty.id} />}
          <MyReports submissions={me?.submissions ?? []} onOpen={setMedia} />
        </>
      )}
      <MediaViewer media={media} onClose={() => setMedia(null)} />
    </div>
  );
}

function ReportForm({ bountyId }: { bountyId: string }) {
  const [content, setContent] = useState("");
  const utils = api.useUtils();
  const submit = api.bounty.submitReport.useMutation({
    onSuccess: async () => {
      toast.success("Submission sent!");
      setContent("");
      await utils.bounty.byId.invalidate({ bountyId });
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="bg-surface grid gap-3 rounded-[1.4rem] border-2 p-4 sm:p-5">
      <p className="display text-xl">Submit your entry</p>
      <MarkdownEditor
        value={content}
        onChange={setContent}
        placeholder="Describe your submission…"
        minHeight={200}
        disabled={submit.isPending}
      />
      <Button
        className="justify-self-start"
        disabled={!content.trim() || submit.isPending}
        onClick={() => submit.mutate({ bountyId, content })}
      >
        {submit.isPending && <Loader2 className="size-4 animate-spin" />}
        Submit
      </Button>
    </div>
  );
}

function MyReports({
  submissions,
  onOpen,
}: {
  submissions: NonNullable<Bounty["me"]>["submissions"];
  onOpen: (media: Media) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  if (submissions.length === 0)
    return <EmptyState icon={FileText} title="You haven't submitted yet" />;

  return (
    <ul className="grid gap-3">
      {submissions.map((entry) => {
        const open = expanded.has(entry.id);
        const long = entry.body.length > TRUNCATE;
        return (
          <li key={entry.id} className="bg-surface overflow-hidden rounded-[1.4rem] border-2">
            <p className="text-fg-muted px-4 pt-4 text-xs">Sent {timeAgo(entry.createdAt)}</p>
            <div className="px-4 pt-2 pb-4">
              <Markdown
                content={open || !long ? entry.body : `${entry.body.slice(0, TRUNCATE)}…`}
                compact
              />
              {long && (
                <button
                  type="button"
                  onClick={() =>
                    setExpanded((current) => {
                      const next = new Set(current);
                      if (next.has(entry.id)) next.delete(entry.id);
                      else next.add(entry.id);
                      return next;
                    })
                  }
                  className="text-primary-text mt-2 text-xs font-semibold"
                >
                  {open ? "Show less" : "Continue reading"}
                </button>
              )}
            </div>
            {entry.attachments.length > 0 && (
              <div className="grid grid-cols-3 gap-2 px-4 pb-4 sm:grid-cols-4">
                {entry.attachments.map((file) => (
                  <button
                    key={file.id}
                    type="button"
                    onClick={() => onOpen({ url: file.url, type: file.type })}
                    className="group bg-surface-2 hover:border-fg relative aspect-square overflow-hidden rounded-xl border transition-colors"
                  >
                    {file.type === "IMAGE" ? (
                      // eslint-disable-next-line @next/next/no-img-element -- uploads come from storage
                      <img
                        src={file.url}
                        alt=""
                        className="size-full object-cover transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <span className="text-fg-muted grid size-full place-content-center justify-items-center gap-1.5 text-[10px]">
                        {file.type === "VIDEO" ? (
                          <Video className="size-6" />
                        ) : (
                          <FileText className="size-6" />
                        )}
                        <span className="max-w-[90%] truncate px-1">
                          {file.fileName ?? file.type.toLowerCase()}
                        </span>
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ListeningProgress({ bounty, music }: { bounty: Bounty; music: Music }) {
  const pathname = usePathname();
  const utils = api.useUtils();
  const refresh = () => utils.bounty.byId.invalidate({ bountyId: bounty.id });
  const sync = api.bounty.syncProgress.useMutation({
    onSuccess: async () => {
      toast.success("Progress synced");
      await refresh();
    },
    onError: (error) => toast.error(error.message),
  });
  const disconnect = api.bounty.disconnectLastFm.useMutation({
    onSuccess: async () => {
      toast.success("Last.fm account disconnected");
      await refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  if (!bounty.me?.lastFm) {
    return (
      <div className="bg-surface grid justify-items-center gap-4 rounded-[1.4rem] border-2 border-dashed p-8 text-center">
        <span className="bg-primary text-primary-foreground grid size-16 place-items-center rounded-full">
          <Disc3 className="size-8 animate-spin [animation-duration:8s]" />
        </span>
        <div className="grid gap-1.5">
          <p className="display text-xl">Connect Last.fm to track your progress</p>
          <p className="text-fg-muted mx-auto max-w-xs text-sm">
            Your listening progress is synced from Last.fm scrobbles. Connect your account to see
            how far you&apos;ve come.
          </p>
        </div>
        <Button asChild>
          <a href={`/api/lastfm/auth?redirect=${encodeURIComponent(`${pathname}?tab=reports`)}`}>
            <Radio className="size-4" /> Connect Last.fm account
          </a>
        </Button>
      </div>
    );
  }

  const progress = bounty.me.progress;
  if (!progress || music.tracks.length === 0) {
    return (
      <EmptyState
        icon={Headphones}
        title="No tracks configured yet"
        description="The organization hasn't added any tracks yet."
      />
    );
  }

  const total = music.tracks.length;
  const required =
    music.ruleType === "ALL"
      ? total
      : music.ruleType === "ANY_N"
        ? Math.min(music.requiredTracks ?? 1, total)
        : null;
  const rule =
    music.ruleType === "ALL"
      ? `Complete all ${total} tracks`
      : music.ruleType === "ANY_N"
        ? `Complete any ${required} of ${total} tracks`
        : "Accumulate total plays across all tracks";
  const complete = required !== null ? progress.doneCount >= required : progress.percent >= 100;
  const byTrack = new Map(progress.tracks.map((row) => [row.trackId, row]));

  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="display flex items-center gap-2 text-xl">
          <Headphones className="text-primary-text size-4" /> My listening progress
        </h3>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={disconnect.isPending}
            onClick={() => disconnect.mutate()}
          >
            {disconnect.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Radio className="size-3.5" />
            )}
            <span className="hidden sm:inline">
              {disconnect.isPending ? "Disconnecting…" : `Disconnect ${bounty.me.lastFm}`}
            </span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={sync.isPending}
            onClick={() => sync.mutate({ bountyId: bounty.id })}
          >
            {sync.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            {sync.isPending ? "Syncing…" : "Sync"}
          </Button>
        </div>
      </div>

      <ProgressBand
        art={music.tracks.map((track) => track.albumArtUrl)}
        percent={progress.percent}
        done={complete}
        className="min-h-24 p-5"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="display text-2xl tabular-nums">
              {progress.doneCount} of {total} tracks completed
            </p>
            <p className="text-fg-muted mt-0.5 text-xs">{rule}</p>
            {complete && (
              <p className="text-primary-text mt-1 flex items-center gap-1 text-xs font-bold">
                <CheckCircle2 className="size-3.5" /> Challenge complete — you qualify!
              </p>
            )}
          </div>
          <span className="display shrink-0 text-4xl tabular-nums">{progress.percent}%</span>
        </div>
      </ProgressBand>

      <p className="label-caps text-fg-faint px-0.5 pt-1">Track breakdown</p>
      <ul className="grid gap-2.5">
        {music.tracks.map((track, index) => {
          const row = byTrack.get(track.id);
          return (
            <li key={track.id}>
              <ProgressBand
                art={[track.albumArtUrl]}
                percent={row?.percent ?? 0}
                done={row?.done ?? false}
                className="px-4 py-3"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <Cover url={track.albumArtUrl} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-bold">
                      <span className="text-fg-faint font-mono text-[10px]">#{index + 1}</span>
                      <span className="truncate">{track.title}</span>
                      {row?.done && <CheckCircle2 className="text-primary-text size-4 shrink-0" />}
                    </p>
                    <p className="text-fg-muted truncate text-xs">{track.artistName}</p>
                  </div>
                  <span
                    className={cn(
                      "rounded-md border px-2.5 py-1 font-mono text-[11px] tabular-nums",
                      row?.done ? "border-primary-text text-fg font-bold" : "text-fg-muted",
                    )}
                  >
                    {row?.plays ?? 0}/{track.targetPlays} plays{" "}
                    <span className="opacity-70">({row?.percent ?? 0}%)</span>
                  </span>
                  <div className="flex gap-1.5">
                    <PlayLink href={track.lastFmUrl} label="Last.fm" icon={Radio} />
                    {track.spotifyUrl && (
                      <PlayLink href={track.spotifyUrl} label="Spotify" icon={Music} />
                    )}
                    {track.youtubeUrl && (
                      <PlayLink href={track.youtubeUrl} label="YouTube" icon={MonitorPlay} />
                    )}
                  </div>
                </div>
              </ProgressBand>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** A card with the album art blurred behind and a fill showing progress. */
function ProgressBand({
  art,
  percent,
  done,
  className,
  children,
}: {
  art: (string | null)[];
  percent: number;
  done: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "bg-surface relative isolate overflow-hidden rounded-[1.2rem] border-2",
        done && "border-primary-text",
        className,
      )}
    >
      <div aria-hidden className="absolute inset-0 -z-20 flex">
        {art.map((url, index) =>
          url ? (
            // eslint-disable-next-line @next/next/no-img-element -- covers come from many hosts
            <img
              key={index}
              src={url}
              alt=""
              className="h-full min-w-0 flex-1 scale-125 object-cover opacity-50 blur-[5px]"
            />
          ) : (
            <span key={index} className="bg-surface-2 flex-1" />
          ),
        )}
      </div>
      <div
        aria-hidden
        className="from-surface/95 via-surface/75 to-surface/40 absolute inset-0 -z-10 bg-gradient-to-r"
      />
      {percent > 0 && (
        <div
          aria-hidden
          className={cn(
            "absolute inset-y-0 left-0 -z-10 transition-[width] duration-1000 ease-out",
            done ? "bg-primary/30" : "bg-primary/15",
          )}
          style={{ width: `${percent}%` }}
        />
      )}
      {children}
    </div>
  );
}

function Cover({ url }: { url: string | null }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- covers come from many hosts
    <img src={url} alt="" className="size-11 shrink-0 rounded-lg border object-cover shadow-md" />
  ) : (
    <span className="bg-surface-3 grid size-11 shrink-0 place-items-center rounded-lg border">
      <Music className="text-fg-muted size-4" />
    </span>
  );
}

function PlayLink({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: typeof Radio;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={`Play on ${label}`}
      className="bg-surface-2 hover:bg-surface-3 flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11px] font-bold"
    >
      <Icon className="size-3.5" /> Play
    </a>
  );
}

/** Full-screen view of an attachment, with download. */
function MediaViewer({ media, onClose }: { media: Media | null; onClose: () => void }) {
  return (
    <Dialog open={media !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[92dvh] max-w-[min(96vw,72rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,72rem)]"
      >
        {media && (
          <>
            <div className="flex items-center justify-between border-b px-4 py-3">
              <DialogTitle className="display text-lg">
                {media.type === "VIDEO" ? "Video" : media.type === "IMAGE" ? "Image" : "File"}
              </DialogTitle>
              <div className="flex gap-1">
                <Button asChild variant="ghost" size="icon" title="Download">
                  <a href={media.url} target="_blank" rel="noopener noreferrer">
                    <Download className="size-4" />
                  </a>
                </Button>
                <Button variant="ghost" size="icon" title="Close" onClick={onClose}>
                  <X className="size-4" />
                </Button>
              </div>
            </div>
            <div className="bg-surface-2 grid flex-1 place-items-center overflow-hidden p-4">
              {media.type === "IMAGE" ? (
                // eslint-disable-next-line @next/next/no-img-element -- uploads come from storage
                <img
                  src={media.url}
                  alt=""
                  className="max-h-full max-w-full rounded-xl object-contain"
                />
              ) : media.type === "VIDEO" ? (
                <video
                  src={media.url}
                  className="max-h-full max-w-full rounded-xl"
                  controls
                  autoPlay
                  playsInline
                />
              ) : (
                <div className="grid justify-items-center gap-4">
                  <FileText className="text-fg-muted size-10" />
                  <p className="text-sm font-semibold">No preview available</p>
                  <Button asChild variant="secondary" size="sm">
                    <a href={media.url} target="_blank" rel="noopener noreferrer">
                      <Download className="size-4" /> Download file
                    </a>
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
