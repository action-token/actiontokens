"use client";

import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Clock,
  Crown,
  ExternalLink,
  FileText,
  Music,
  Trophy,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import toast from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@bandcoin/ui/components/tabs";
import { cn } from "@bandcoin/ui/lib/cn";
import { Markdown } from "@bandcoin/ui/patterns/markdown";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";
import { PageBody } from "@bandcoin/ui/patterns/page-header";

import { Money } from "~/components/money";
import { timeAgo } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

import { StickyPanel } from "../nft/sticky-panel";
import { Avatar } from "../shell/context-panel";
import { nameOf, PersonAvatar, PersonLink } from "./bounty-people";
import { BountyReports } from "./bounty-reports";
import { BountySide, canSubmitReport, useBountyTab } from "./bounty-side";

type Bounty = RouterOutputs["bounty"]["byId"];

const ARTIST_URL = process.env.NEXT_PUBLIC_ARTIST_URL ?? "https://artist.bandcoin.io";

const STATUS: Record<Bounty["status"], { label: string; tone: string }> = {
  RUNNING: { label: "Running", tone: "bg-primary text-primary-foreground border-transparent" },
  PAUSED: { label: "Paused", tone: "bg-surface-3 text-fg" },
  COMPLETED: { label: "Completed", tone: "bg-surface-2 text-fg-muted" },
};

const LASTFM_ERRORS: Record<string, string> = {
  lastfm_unavailable: "Last.fm isn't set up yet.",
  missing_token: "Last.fm didn't send a sign-in token. Try again.",
  lastfm_failed: "Could not connect your Last.fm account. Please try again.",
};

/**
 * One bounty, with everything the old Bandcoin page had: status, the brief
 * and requirements (or the songs for a listening challenge), participants,
 * your reports and listening progress. The prize pool, joining or claiming,
 * stats and winners stay in view in a card on the right (BountySide).
 * Artists manage their bounty in the artist portal.
 */
export function BountyView({ initial }: { initial: Bounty }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { data: bounty = initial } = api.bounty.byId.useQuery(
    { bountyId: initial.id },
    { initialData: initial },
  );
  const { tab, setTab } = useBountyTab();

  // Back from Last.fm: say how it went, then tidy the URL.
  const lastFm = params.get("lastfm");
  const lastFmError = params.get("error");
  useEffect(() => {
    if (!lastFm && !lastFmError) return;
    if (lastFm === "connected") toast.success("Last.fm account connected!");
    else if (lastFmError)
      toast.error(
        LASTFM_ERRORS[lastFmError] ?? "Could not connect your Last.fm account. Please try again.",
      );
    const query = new URLSearchParams(params.toString());
    query.delete("lastfm");
    query.delete("error");
    router.replace(query.size ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [lastFm, lastFmError, params, pathname, router]);

  const status = STATUS[bounty.status];
  const canSubmit = canSubmitReport(bounty);
  const art = bounty.music?.tracks.map((track) => track.albumArtUrl).find(Boolean);
  const cover = art ?? bounty.artist.avatarUrl;

  return (
    <>
      <section className="relative isolate overflow-hidden text-white">
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element -- images come from many hosts
          <img
            src={cover}
            alt=""
            aria-hidden
            className="absolute inset-0 -z-10 size-full scale-110 object-cover opacity-60 blur-sm"
          />
        )}
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-gradient-to-r from-black/95 via-black/80 to-black/45"
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-gradient-to-t from-black/80 via-transparent to-transparent"
        />

        <div className="mx-auto max-w-[80rem] px-4 pt-6 pb-10 sm:px-8 lg:pb-12">
          <Link
            href="/bounties"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-white/70 hover:text-white"
          >
            <ArrowLeft className="size-4" /> Bounties
          </Link>

          <div className="grid items-center gap-8 pt-6 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] md:gap-10">
            <div className="grid min-w-0 gap-4">
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold tracking-wider uppercase">
                <span className={cn("rounded-full border px-2.5 py-1", status.tone)}>
                  {status.label}
                </span>
                <span className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1">
                  <Trophy className="size-3" /> Bounty
                </span>
                {bounty.requiresActionCam && (
                  <span className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1">
                    <Camera className="size-3" /> Action Cam required
                  </span>
                )}
              </div>
              <h1 className="display text-4xl break-words sm:text-5xl xl:text-6xl">
                {bounty.title}
              </h1>
              {bounty.summary && (
                <p className="max-w-2xl text-[15px] leading-relaxed text-white/75">
                  {bounty.summary}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-white/70">
                <Link
                  href={`/artist/${bounty.artist.slug}`}
                  className="flex items-center gap-2 hover:text-white"
                >
                  <span>By</span>
                  <Avatar
                    name={bounty.artist.name}
                    url={bounty.artist.avatarUrl}
                    className="bg-surface-3 text-fg grid size-6 place-items-center rounded-full object-cover text-[9px] font-bold"
                  />
                  <b className="font-semibold text-white">{bounty.artist.name}</b>
                </Link>
                <span className="flex items-center gap-1">
                  <Clock className="size-3" /> {timeAgo(bounty.createdAt)}
                </span>
              </div>
            </div>

            {cover && (
              <div className="mx-auto hidden w-full max-w-[18rem] md:block">
                <div className="bg-surface overflow-hidden rounded-[1.4rem] border-[3px] border-white shadow-[10px_12px_0_0_var(--color-primary)] lg:rotate-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- images come from many hosts */}
                  <img src={cover} alt="" className="aspect-square w-full object-cover" />
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <PageBody wide>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(23rem,1fr)] xl:items-start">
          <StickyPanel className="border-fg bg-surface rounded-[1.6rem] border-[3px] p-5 shadow-[8px_9px_0_0_var(--color-primary)] sm:p-6 xl:sticky xl:col-start-2 xl:row-start-1 xl:self-start">
            <BountySide bounty={bounty} />
          </StickyPanel>

          <div className="grid min-w-0 gap-6 xl:col-start-1 xl:row-start-1">
            <Requirements bounty={bounty} />

            <Tabs value={tab} onValueChange={setTab} className="min-w-0">
              <TabsList variant="line" className="w-full justify-start overflow-x-auto border-b">
                <TabsTrigger value="description" className="flex-none">
                  Description
                </TabsTrigger>
                <TabsTrigger value="participants" className="flex-none">
                  Participants
                </TabsTrigger>
                <TabsTrigger value="reports" className="flex-none">
                  {bounty.isCreator ? "Submissions" : "My reports"}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="description" className="mt-6 grid gap-5">
                {bounty.description ? (
                  <Markdown content={bounty.description} />
                ) : (
                  <p className="text-fg-muted text-sm italic">No description provided.</p>
                )}
                {bounty.rewardNote && (
                  <div className="bg-surface grid gap-1 rounded-xl border p-4">
                    <p className="label-caps text-fg-faint">Reward delivery</p>
                    <p className="text-fg-muted text-sm whitespace-pre-wrap">{bounty.rewardNote}</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="participants" className="mt-6">
                <ParticipantsTable bounty={bounty} />
              </TabsContent>

              <TabsContent value="reports" id="reports" className="mt-6 scroll-mt-24">
                {bounty.isCreator ? (
                  <ManageInPortal bountyId={bounty.id} />
                ) : (
                  <BountyReports bounty={bounty} canSubmit={canSubmit} />
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </PageBody>
    </>
  );
}

/** What to do: the songs, the steps, or both. */
function Requirements({ bounty }: { bounty: Bounty }) {
  const isMusicOnly = bounty.music?.mode === "MUSIC_ONLY";
  const tracks = bounty.music?.tracks ?? [];

  return (
    <section className="bg-surface grid content-start gap-4 rounded-[1.4rem] border-2 p-5">
      <h2 className="display text-lg">{isMusicOnly ? "Listening challenge" : "Requirements"}</h2>

      {tracks.length > 0 && bounty.music && (
        <div className="grid gap-3">
          <ul className="grid gap-2 sm:grid-cols-2">
            {tracks.map((track) => (
              <li
                key={track.id}
                className="bg-surface-2/60 flex items-center gap-3 rounded-xl border p-2.5"
              >
                {track.albumArtUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- covers come from many hosts
                  <img
                    src={track.albumArtUrl}
                    alt=""
                    className="size-10 shrink-0 rounded-lg border object-cover"
                  />
                ) : (
                  <span className="bg-surface-2 grid size-10 shrink-0 place-items-center rounded-lg border">
                    <Music className="text-fg-muted size-4" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[13px] font-semibold">{track.title}</b>
                  <span className="text-fg-muted block truncate text-xs">{track.artistName}</span>
                </span>
                <span className="font-mono text-xs font-semibold">{track.targetPlays}×</span>
              </li>
            ))}
          </ul>
          <p className="text-fg-muted text-xs">
            {bounty.music.ruleType === "ALL"
              ? `All ${tracks.length} tracks required`
              : bounty.music.ruleType === "ANY_N"
                ? `${Math.min(bounty.music.requiredTracks ?? 1, tracks.length)} of ${tracks.length} tracks`
                : "Total plays across all tracks"}
          </p>
        </div>
      )}

      {!isMusicOnly && bounty.instructions.length > 0 && (
        <ol className="grid gap-2.5">
          {bounty.instructions.map((step, index) => (
            <li key={index} className="text-fg-muted flex items-start gap-2.5 text-sm leading-snug">
              <CheckCircle2 className="text-primary-text mt-0.5 size-4 shrink-0" /> {step}
            </li>
          ))}
        </ol>
      )}
      {!isMusicOnly && bounty.instructions.length === 0 && tracks.length === 0 && (
        <p className="text-fg-muted text-sm italic">No specific requirements listed.</p>
      )}
    </section>
  );
}

function ParticipantsTable({ bounty }: { bounty: Bounty }) {
  const rows = bounty.participantList;
  if (rows.length === 0)
    return (
      <EmptyState icon={Users} title="No participants yet" description="Be the first to join!" />
    );
  const submitted = (bounty.me?.submissions.length ?? 0) > 0;

  return (
    <div className="bg-surface overflow-hidden rounded-[1.4rem] border-2">
      <table className="w-full text-sm">
        <thead className="bg-surface-2 text-fg-muted text-left text-[11px] font-bold tracking-wide uppercase">
          <tr>
            <th className="w-12 px-4 py-3">#</th>
            <th className="px-4 py-3">Participant</th>
            <th className="hidden px-4 py-3 sm:table-cell">Joined</th>
            <th className="px-4 py-3 text-center">Submitted</th>
            <th className="px-4 py-3">Result</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className={cn("border-t", row.prize && "bg-primary/10")}>
              <td className="px-4 py-3">
                {row.prize ? (
                  <Crown className="text-primary-text size-4" />
                ) : (
                  <span className="text-fg-faint text-xs">{index + 1}</span>
                )}
              </td>
              <td className="px-4 py-3">
                <PersonLink person={row.user} className="flex min-w-0 items-center gap-2.5">
                  <PersonAvatar person={row.user} className="size-7" />
                  <span className="truncate font-medium">{nameOf(row.user)}</span>
                  {row.isMe && (
                    <span className="bg-surface-3 rounded-full px-1.5 py-0.5 text-[10px] font-bold">
                      You
                    </span>
                  )}
                </PersonLink>
              </td>
              <td className="text-fg-muted hidden px-4 py-3 text-xs sm:table-cell">
                {timeAgo(row.joinedAt)}
              </td>
              <td className="px-4 py-3 text-center">
                {row.isMe && submitted ? (
                  <CheckCircle2 className="text-primary-text mx-auto size-4" />
                ) : (
                  <span className="text-fg-faint text-xs">—</span>
                )}
              </td>
              <td className="px-4 py-3 text-xs">
                {row.prize ? (
                  <Money
                    amount={row.prize}
                    currency={bounty.prize.currency}
                    code={bounty.prize.code}
                    className="font-bold"
                  />
                ) : (
                  <span className="text-fg-faint">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ManageInPortal({ bountyId }: { bountyId: string }) {
  return (
    <EmptyState
      icon={FileText}
      title="Review submissions in the artist portal"
      description="Read entries, pick winners and change the bounty's status from your artist portal."
      action={
        <Button asChild>
          <a href={`${ARTIST_URL}/bounties/${bountyId}`}>
            Open artist portal <ExternalLink className="size-4" />
          </a>
        </Button>
      }
    />
  );
}
