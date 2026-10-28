import { CheckCircle2, Disc3, Download, FileText, Headphones, MonitorPlay, Music, Radio, RefreshCw, Video, X } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@bandcoin/ui/lib/cn";

import { ArButton } from "~/components/ui/ArButton";
import { type BountyDetail, musicRuleLabel, timeAgo } from "~/lib/ar/bounty";
import { api } from "~/trpc/react";

import { Markdown } from "./Markdown";

type Music = NonNullable<BountyDetail["music"]>;
type Media = { url: string; type: string };

const TRUNCATE = 250;

/**
 * "My reports", as on the old Bandcoin: listening progress on music bounties
 * (connect Last.fm, sync, per-song plays), then everything you've sent.
 */
export function MinePanel({ bounty, lastFmNote }: { bounty: BountyDetail; lastFmNote: { ok: boolean; text: string } | null }) {
  const [media, setMedia] = useState<Media | null>(null);
  const takesReports = !bounty.music || bounty.music.mode === "HYBRID";

  return (
    <div className="space-y-5">
      {lastFmNote && (
        <p
          className={cn(
            "rounded-ar border px-3.5 py-2.5 text-[12px] leading-relaxed",
            lastFmNote.ok ? "border-ar-accent/40 bg-ar-accent/10 text-ar-accent-hot" : "border-ar-danger/40 bg-ar-danger/10 text-ar-danger",
          )}
        >
          {lastFmNote.text}
        </p>
      )}
      {bounty.music && bounty.me?.joinedAt && <ListeningProgress bounty={bounty} music={bounty.music} />}
      {takesReports && <MyReports submissions={bounty.me?.submissions ?? []} onOpen={setMedia} />}
      <MediaViewer media={media} onClose={() => setMedia(null)} />
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <h3 className="font-hud text-ar-faint mb-2.5 text-[9.5px] font-semibold tracking-[0.24em] uppercase">{children}</h3>;
}

function MyReports({ submissions, onOpen }: { submissions: NonNullable<BountyDetail["me"]>["submissions"]; onOpen: (media: Media) => void }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  return (
    <section>
      <Label>Your reports</Label>
      {submissions.length === 0 ? (
        <div className="py-8 text-center">
          <FileText size={20} strokeWidth={2.2} className="text-ar-faint mx-auto" />
          <p className="font-hud text-ar-dim mt-2 text-[12px] font-bold tracking-[0.14em] uppercase">You haven&rsquo;t submitted yet</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {submissions.map((entry) => {
            const open = expanded.has(entry.id);
            const long = entry.body.length > TRUNCATE;
            return (
              <li key={entry.id} className="ar-bevel rounded-ar overflow-hidden p-3.5">
                <p className="font-hud text-ar-faint text-[10px] font-semibold tracking-[0.1em] uppercase">Sent {timeAgo(entry.createdAt)}</p>
                <Markdown content={open || !long ? entry.body : `${entry.body.slice(0, TRUNCATE)}…`} className="mt-2" />
                {long && (
                  <button
                    onClick={() =>
                      setExpanded((current) => {
                        const next = new Set(current);
                        if (next.has(entry.id)) next.delete(entry.id);
                        else next.add(entry.id);
                        return next;
                      })
                    }
                    className="font-hud text-ar-accent-hot mt-2 text-[11px] font-semibold tracking-[0.08em] uppercase"
                  >
                    {open ? "Show less" : "Continue reading"}
                  </button>
                )}
                {entry.attachments.length > 0 && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {entry.attachments.map((file) => (
                      <button
                        key={file.id}
                        onClick={() => onOpen({ url: file.url, type: file.type })}
                        className="rounded-ar border-ar-line relative aspect-square overflow-hidden border bg-white/[0.04]"
                      >
                        {file.type === "IMAGE" ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={file.url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-ar-dim flex h-full w-full flex-col items-center justify-center gap-1 text-[10px]">
                            {file.type === "VIDEO" ? <Video size={20} /> : <FileText size={20} />}
                            <span className="max-w-[90%] truncate">{file.fileName ?? file.type.toLowerCase()}</span>
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
      )}
    </section>
  );
}

function ListeningProgress({ bounty, music }: { bounty: BountyDetail; music: Music }) {
  const utils = api.useUtils();
  const refresh = () => utils.bounty.byId.invalidate({ bountyId: bounty.id });
  const sync = api.bounty.syncProgress.useMutation({ onSuccess: refresh });
  const disconnect = api.bounty.disconnectLastFm.useMutation({ onSuccess: refresh });
  const error = sync.error ?? disconnect.error;

  if (!bounty.me?.lastFm) {
    const back = `/bounty/${bounty.id}?section=mine`;
    return (
      <section className="rounded-ar-lg border-ar-line-bright border border-dashed px-5 py-7 text-center">
        <span className="ar-key ar-key-primary mx-auto flex h-14 w-14 items-center justify-center rounded-full">
          <Disc3 size={26} className="animate-spin [animation-duration:8s]" />
        </span>
        <p className="font-hud text-ar-text mt-3 text-[13px] font-bold tracking-[0.1em] uppercase">Connect Last.fm to track progress</p>
        <p className="text-ar-faint mx-auto mt-1.5 max-w-[17rem] text-[12px] leading-relaxed">
          Your listening progress is synced from your Last.fm scrobbles.
        </p>
        <a href={`/api/lastfm/auth?redirect=${encodeURIComponent(back)}`} className="ar-key ar-key-primary rounded-ar mt-4 inline-flex h-11 items-center gap-2 px-4 text-[13.5px] font-semibold">
          <Radio size={15} strokeWidth={2.3} /> Connect Last.fm
        </a>
      </section>
    );
  }

  const progress = bounty.me.progress;
  if (!progress || music.tracks.length === 0) {
    return (
      <div className="py-8 text-center">
        <Headphones size={20} strokeWidth={2.2} className="text-ar-faint mx-auto" />
        <p className="font-hud text-ar-dim mt-2 text-[12px] font-bold tracking-[0.14em] uppercase">No tracks configured yet</p>
      </div>
    );
  }

  const total = music.tracks.length;
  const required = music.ruleType === "ALL" ? total : music.ruleType === "ANY_N" ? Math.min(music.requiredTracks ?? 1, total) : null;
  const complete = required !== null ? progress.doneCount >= required : progress.percent >= 100;
  const byTrack = new Map(progress.tracks.map((row) => [row.trackId, row]));

  return (
    <section>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="font-hud text-ar-faint flex items-center gap-1.5 text-[9.5px] font-semibold tracking-[0.24em] uppercase">
          <Headphones size={11} strokeWidth={2.4} /> Listening progress
        </h3>
        <div className="flex gap-1.5">
          <ArButton variant="ghost" size="sm" busy={disconnect.isPending} onClick={() => disconnect.mutate()} aria-label={`Disconnect ${bounty.me.lastFm}`}>
            Disconnect
          </ArButton>
          <ArButton variant="outline" size="sm" icon={RefreshCw} busy={sync.isPending} onClick={() => sync.mutate({ bountyId: bounty.id })}>
            {sync.isPending ? "Syncing" : "Sync"}
          </ArButton>
        </div>
      </div>

      {error && <p className="rounded-ar bg-ar-danger/10 text-ar-danger mb-2.5 px-3 py-2 text-[12px]">{error.message}</p>}

      <ProgressBand art={music.tracks.map((t) => t.albumArtUrl)} percent={progress.percent} done={complete} className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-hud text-ar-text text-[16px] font-bold tabular-nums">
              {progress.doneCount} of {total} tracks done
            </p>
            <p className="text-ar-dim mt-0.5 text-[11.5px]">{musicRuleLabel(music)}</p>
            {complete && (
              <p className="text-ar-accent-hot mt-1 flex items-center gap-1 text-[11.5px] font-semibold">
                <CheckCircle2 size={13} /> Challenge complete — you qualify!
              </p>
            )}
          </div>
          <span className="font-hud text-ar-accent-hot text-glow-soft shrink-0 text-[26px] font-bold tabular-nums">{progress.percent}%</span>
        </div>
      </ProgressBand>
      <p className="text-ar-faint mt-1.5 text-[10.5px]">Synced from {bounty.me.lastFm} on Last.fm</p>

      <ul className="mt-3 space-y-2">
        {music.tracks.map((track, index) => {
          const row = byTrack.get(track.id);
          return (
            <li key={track.id}>
              <ProgressBand art={[track.albumArtUrl]} percent={row?.percent ?? 0} done={row?.done ?? false} className="px-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  {track.albumArtUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={track.albumArtUrl} alt="" className="h-10 w-10 shrink-0 rounded-[10px] object-cover" />
                  ) : (
                    <span className="bg-ar-surface-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]">
                      <Music size={15} className="text-ar-faint" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-ar-text flex items-center gap-1.5 text-[12.5px] font-semibold">
                      <span className="font-hud text-ar-faint text-[9.5px]">#{index + 1}</span>
                      <span className="truncate">{track.title}</span>
                      {row?.done && <CheckCircle2 size={13} className="text-ar-accent-hot shrink-0" />}
                    </p>
                    <p className="text-ar-faint truncate text-[11px]">{track.artistName}</p>
                    <p className="font-hud text-ar-dim mt-0.5 text-[10.5px] font-semibold tabular-nums">
                      {row?.plays ?? 0}/{track.targetPlays} plays · {row?.percent ?? 0}%
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <PlayLink href={track.lastFmUrl} label="Last.fm" icon={Radio} />
                    {track.spotifyUrl && <PlayLink href={track.spotifyUrl} label="Spotify" icon={Music} />}
                    {track.youtubeUrl && <PlayLink href={track.youtubeUrl} label="YouTube" icon={MonitorPlay} />}
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
    <div className={cn("ar-bevel rounded-ar relative isolate overflow-hidden", done && "border-ar-accent/60", className)}>
      <div aria-hidden className="absolute inset-0 -z-20 flex">
        {art.map((url, index) =>
          url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={index} src={url} alt="" className="h-full min-w-0 flex-1 scale-125 object-cover opacity-30 blur-[6px]" />
          ) : (
            <span key={index} className="flex-1" />
          ),
        )}
      </div>
      <div aria-hidden className="from-ar-surface/95 via-ar-surface/80 to-ar-surface/50 absolute inset-0 -z-10 bg-linear-to-r" />
      {percent > 0 && (
        <div
          aria-hidden
          className={cn("absolute inset-y-0 left-0 -z-10 transition-[width] duration-1000 ease-out", done ? "bg-ar-accent/25" : "bg-ar-accent/12")}
          style={{ width: `${percent}%` }}
        />
      )}
      {children}
    </div>
  );
}

function PlayLink({ href, label, icon: Icon }: { href: string; label: string; icon: typeof Radio }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={`Play on ${label}`}
      aria-label={`Play on ${label}`}
      className="ar-key font-hud text-ar-text flex h-7 items-center gap-1 rounded-full px-2.5 text-[9.5px] font-bold tracking-[0.08em] uppercase"
    >
      <Icon size={11} strokeWidth={2.4} /> Play
    </a>
  );
}

/** Full-screen view of an attachment, over the phone screen, with download. */
function MediaViewer({ media, onClose }: { media: Media | null; onClose: () => void }) {
  if (!media || typeof document === "undefined") return null;
  const frame = document.querySelector("[data-ar-app-frame]") ?? document.body;
  return createPortal(
    <div role="dialog" aria-modal aria-label="Attachment" className="bg-ar-void/95 absolute inset-0 z-[80] flex flex-col">
      <div className="flex items-center justify-end gap-2 px-4" style={{ paddingTop: "calc(var(--ar-top-inset) + 12px)" }}>
        <a href={media.url} target="_blank" rel="noopener noreferrer" aria-label="Download" className="ar-glass text-ar-text flex h-9 w-9 items-center justify-center rounded-full">
          <Download size={16} strokeWidth={2.3} />
        </a>
        <button onClick={onClose} aria-label="Close" className="ar-glass text-ar-text flex h-9 w-9 items-center justify-center rounded-full">
          <X size={17} strokeWidth={2.4} />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-4">
        {media.type === "IMAGE" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={media.url} alt="" className="rounded-ar max-h-full max-w-full object-contain" />
        ) : media.type === "VIDEO" ? (
          <video src={media.url} className="rounded-ar max-h-full max-w-full" controls autoPlay playsInline />
        ) : (
          <div className="text-center">
            <FileText size={32} className="text-ar-faint mx-auto" />
            <p className="text-ar-dim mt-3 text-[13px]">No preview for this file.</p>
          </div>
        )}
      </div>
    </div>,
    frame,
  );
}
