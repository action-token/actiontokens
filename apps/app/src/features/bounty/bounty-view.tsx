"use client";

import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Crown,
  ExternalLink,
  FileText,
  Loader2,
  Lock,
  Music,
  Trophy,
  Users,
} from "lucide-react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@bandcoin/ui/components/tabs";
import { cn } from "@bandcoin/ui/lib/cn";
import { Markdown } from "@bandcoin/ui/patterns/markdown";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";
import { ToastViewport, TransactionToast } from "@bandcoin/ui/patterns/transaction-toast";
import { useConnectWalletDialogStore } from "@bandcoin/wallet";

import { Money } from "~/components/money";
import { timeAgo } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

import { Avatar } from "../shell/context-panel";
import { BountyReports } from "./bounty-reports";
import { useClaim } from "./use-claim";

type Bounty = RouterOutputs["bounty"]["byId"];
type Person = Bounty["participantList"][number]["user"];
type Tab = "description" | "participants" | "reports";

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
 * your reports and listening progress, the prize pool, stats and winners,
 * and claiming your prize from escrow. Artists manage their bounty in the
 * artist portal.
 */
export function BountyView({ initial }: { initial: Bounty }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { data: bounty = initial } = api.bounty.byId.useQuery(
    { bountyId: initial.id },
    { initialData: initial },
  );
  const tab = (params.get("tab") as Tab | null) ?? "description";
  const setTab = (next: string) => {
    const query = new URLSearchParams(params.toString());
    if (next === "description") query.delete("tab");
    else query.set("tab", next);
    router.replace(query.size ? `${pathname}?${query}` : pathname, { scroll: false });
  };

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
  const isMusicOnly = bounty.music?.mode === "MUSIC_ONLY";
  const joined = bounty.joined;
  const canSubmit = joined && bounty.status === "RUNNING" && !bounty.isCreator && !isMusicOnly;
  const art = bounty.music?.tracks.map((track) => track.albumArtUrl).filter(Boolean) ?? [];

  return (
    <>
      <section className="relative isolate overflow-hidden border-b">
        {art.length > 0 ? (
          <div aria-hidden className="absolute inset-0 -z-20 flex">
            {art.slice(0, 4).map((url) => (
              // eslint-disable-next-line @next/next/no-img-element -- covers come from many hosts
              <img
                key={url}
                src={url ?? ""}
                alt=""
                className="h-full min-w-0 flex-1 scale-110 object-cover opacity-40 blur-sm"
              />
            ))}
          </div>
        ) : bounty.artist.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- images come from many hosts
          <img
            src={bounty.artist.avatarUrl}
            alt=""
            aria-hidden
            className="absolute inset-0 -z-20 size-full scale-125 object-cover opacity-30 blur-3xl"
          />
        ) : (
          <div aria-hidden className="bg-primary/15 absolute inset-0 -z-20" />
        )}
        <div
          aria-hidden
          className="from-bg via-bg/70 to-bg/50 absolute inset-0 -z-10 bg-gradient-to-t"
        />

        <div className="mx-auto max-w-[80rem] px-4 pt-6 pb-8 sm:px-8">
          <Link
            href="/bounties"
            className="text-fg-muted hover:text-fg inline-flex items-center gap-1.5 text-sm"
          >
            <ArrowLeft className="size-4" /> Bounties
          </Link>

          <div className="mt-6 grid items-stretch gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="flex flex-col justify-between gap-5">
              <div className="grid gap-4">
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold tracking-wide uppercase">
                  <span
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-2.5 py-1",
                      status.tone,
                    )}
                  >
                    {status.label}
                  </span>
                  <span className="bg-surface/80 flex items-center gap-1 rounded-full border px-2.5 py-1 backdrop-blur">
                    <Trophy className="size-3" /> Bounty
                  </span>
                  {bounty.requiresActionCam && (
                    <span className="bg-surface/80 border-primary-text flex items-center gap-1 rounded-full border px-2.5 py-1 backdrop-blur">
                      <Camera className="size-3" /> Action Cam required
                    </span>
                  )}
                </div>
                <h1 className="display text-4xl break-words sm:text-5xl">{bounty.title}</h1>
                {bounty.summary && (
                  <p className="text-fg-muted max-w-2xl text-[15px] leading-relaxed">
                    {bounty.summary}
                  </p>
                )}
              </div>
              <div className="text-fg-muted flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                <Link
                  href={`/artist/${bounty.artist.slug}`}
                  className="hover:text-fg flex items-center gap-2"
                >
                  <span>By</span>
                  <Avatar
                    name={bounty.artist.name}
                    url={bounty.artist.avatarUrl}
                    className="bg-surface-3 grid size-6 place-items-center rounded-full object-cover text-[9px] font-bold"
                  />
                  <b className="text-fg font-semibold">{bounty.artist.name}</b>
                </Link>
                <span className="flex items-center gap-1">
                  <Clock className="size-3" /> {timeAgo(bounty.createdAt)}
                </span>
              </div>
            </div>

            <RequirementsCard
              bounty={bounty}
              canSubmit={canSubmit}
              onSubmitReport={() => setTab("reports")}
            />
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-[80rem] items-start gap-8 px-4 py-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Tabs value={tab} onValueChange={setTab} className="min-w-0">
          <TabsList>
            <TabsTrigger value="description">Description</TabsTrigger>
            <TabsTrigger value="participants">Participants</TabsTrigger>
            <TabsTrigger value="reports">
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

        <aside className="grid gap-4 lg:sticky lg:top-20">
          <RewardsCard bounty={bounty} />
          <StatsCard bounty={bounty} />
          {bounty.winnerList.length > 0 && <WinnersCard bounty={bounty} />}
        </aside>
      </div>
    </>
  );
}

/** The hero's right card: what to do (songs or steps), then the one action that fits. */
function RequirementsCard({
  bounty,
  canSubmit,
  onSubmitReport,
}: {
  bounty: Bounty;
  canSubmit: boolean;
  onSubmitReport: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const isMusicOnly = bounty.music?.mode === "MUSIC_ONLY";
  const tracks = bounty.music?.tracks ?? [];
  const steps = showAll ? bounty.instructions : bounty.instructions.slice(0, 3);
  const extra = bounty.instructions.length - 3;
  const status = STATUS[bounty.status];

  return (
    <div className="bg-surface/95 grid content-start gap-4 rounded-[1.4rem] border-2 p-5 shadow-sm backdrop-blur">
      <div className="flex items-center justify-between">
        <span className="label-caps text-fg-faint">
          {isMusicOnly ? "Listening challenge" : "Requirements"}
        </span>
        <span
          className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-bold", status.tone)}
        >
          {status.label}
        </span>
      </div>

      {tracks.length > 0 && bounty.music && (
        <div
          className={cn(
            "grid gap-2",
            !isMusicOnly && bounty.instructions.length > 0 && "border-b pb-3",
          )}
        >
          {tracks.slice(0, 3).map((track) => (
            <div key={track.id} className="flex items-center gap-3">
              {track.albumArtUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- covers come from many hosts
                <img
                  src={track.albumArtUrl}
                  alt=""
                  className="size-9 shrink-0 rounded-lg border object-cover"
                />
              ) : (
                <span className="bg-surface-2 grid size-9 shrink-0 place-items-center rounded-lg border">
                  <Music className="text-fg-muted size-4" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <b className="block truncate text-xs font-semibold">{track.title}</b>
                <span className="text-fg-muted block truncate text-[11px]">{track.artistName}</span>
              </span>
              <span className="font-mono text-[11px] font-semibold">{track.targetPlays}×</span>
            </div>
          ))}
          <p className="text-fg-muted flex justify-between border-t pt-2 text-[11px]">
            <span>
              {bounty.music.ruleType === "ALL"
                ? `All ${tracks.length} tracks required`
                : bounty.music.ruleType === "ANY_N"
                  ? `${Math.min(bounty.music.requiredTracks ?? 1, tracks.length)} of ${tracks.length} tracks`
                  : "Total plays across all tracks"}
            </span>
            {tracks.length > 3 && <span>+{tracks.length - 3} more</span>}
          </p>
        </div>
      )}

      {!isMusicOnly && bounty.instructions.length > 0 && (
        <div className="grid gap-2">
          {steps.map((step, index) => (
            <p
              key={index}
              className="text-fg-muted flex items-start gap-2.5 text-[13px] leading-snug"
            >
              <CheckCircle2 className="text-primary-text mt-0.5 size-4 shrink-0" /> {step}
            </p>
          ))}
          {extra > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(!showAll)}
              className="flex items-center gap-1 text-xs font-semibold"
            >
              {showAll ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
              {showAll ? "Show less" : `+${extra} more`}
            </button>
          )}
        </div>
      )}
      {!isMusicOnly && bounty.instructions.length === 0 && tracks.length === 0 && (
        <p className="text-fg-muted text-[13px] italic">No specific requirements listed.</p>
      )}

      <BountyAction bounty={bounty} canSubmit={canSubmit} onSubmitReport={onSubmitReport} />
    </div>
  );
}

/** Join, Submit report, Claim, or why none of those applies right now. */
function BountyAction({
  bounty,
  canSubmit,
  onSubmitReport,
}: {
  bounty: Bounty;
  canSubmit: boolean;
  onSubmitReport?: () => void;
}) {
  const { status } = useSession();
  const openSignIn = useConnectWalletDialogStore((state) => state.setIsOpen);
  const utils = api.useUtils();
  const claim = useClaim(bounty.id);
  const join = api.bounty.join.useMutation({
    onSuccess: async () => {
      toast.success("Joined!");
      await Promise.all([
        utils.bounty.byId.invalidate({ bountyId: bounty.id }),
        utils.bounty.list.invalidate(),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });
  const winner = bounty.me?.winner;
  const prize = <Money amount={winner?.prize ?? "0"} currency={bounty.prize.currency} />;

  let action: ReactNode = null;
  if (bounty.isCreator) {
    action = (
      <Button asChild size="lg" className="w-full">
        <a href={`${ARTIST_URL}/bounties/${bounty.id}`}>
          Manage in artist portal <ExternalLink className="size-4" />
        </a>
      </Button>
    );
  } else if (winner && !winner.claimed) {
    action = (
      <Button
        size="lg"
        className="w-full font-bold"
        disabled={claim.busy}
        onClick={() => claim.claim(<>Claim {prize} from the bounty escrow.</>)}
      >
        {claim.busy ? <Loader2 className="size-4 animate-spin" /> : <Crown className="size-4" />}
        Claim {prize}
      </Button>
    );
  } else if (winner?.claimed) {
    action = (
      <p className="flex items-center justify-center gap-2 py-2 text-sm font-semibold">
        <CheckCircle2 className="text-primary-text size-4" /> Reward claimed
      </p>
    );
  } else if (status !== "authenticated") {
    if (bounty.status === "RUNNING")
      action = (
        <Button size="lg" className="w-full" onClick={() => openSignIn(true)}>
          <Users className="size-4" /> Join bounty
        </Button>
      );
  } else if (bounty.status === "PAUSED" && bounty.joined) {
    action = (
      <p className="text-fg-muted flex items-start gap-2.5 text-sm">
        <Lock className="mt-0.5 size-4 shrink-0" /> Submissions are paused.
      </p>
    );
  } else if (!bounty.joined && bounty.status === "RUNNING") {
    action = (
      <Button
        size="lg"
        className="w-full"
        disabled={join.isPending}
        onClick={() => join.mutate({ bountyId: bounty.id })}
      >
        {join.isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Users className="size-4" />
        )}
        Join bounty
      </Button>
    );
  } else if (canSubmit) {
    action = (
      <Button
        size="lg"
        className="w-full"
        onClick={() => {
          onSubmitReport?.();
          requestAnimationFrame(() =>
            document.getElementById("reports")?.scrollIntoView({ behavior: "smooth" }),
          );
        }}
      >
        <FileText className="size-4" /> Submit report <ArrowRight className="ml-auto size-4" />
      </Button>
    );
  } else if (bounty.status === "COMPLETED" && !bounty.joined) {
    action = <p className="text-fg-muted py-1 text-center text-xs">This bounty has ended</p>;
  }

  return (
    <>
      {action && <div className="pt-1">{action}</div>}
      {claim.step && (
        <ToastViewport>
          <TransactionToast
            key={claim.step.kind}
            step={claim.step}
            onSend={claim.send}
            onCancel={claim.stop}
            actions={
              <Button
                size="sm"
                variant={claim.step.kind === "confirm" ? "secondary" : "ghost"}
                className="h-8 px-3 text-[13px]"
                onClick={claim.step.kind === "confirm" ? claim.stop : claim.close}
              >
                {claim.step.kind === "confirm" ? "Cancel" : "Close"}
              </Button>
            }
          />
        </ToastViewport>
      )}
    </>
  );
}

function RewardsCard({ bounty }: { bounty: Bounty }) {
  const perWinner = Number(bounty.prize.amount) / Math.max(1, bounty.maxWinners);
  return (
    <section className="bg-surface grid gap-4 rounded-[1.4rem] border-2 p-5">
      <h2 className="display flex items-center gap-2 text-sm">
        <Trophy className="text-primary-text size-4" /> Rewards
      </h2>
      <div className="grid gap-1">
        <p className="label-caps text-fg-faint">Prize pool</p>
        <p className="flex flex-wrap items-baseline gap-x-2">
          <Money
            amount={bounty.prize.amount}
            currency={bounty.prize.currency}
            className="display text-2xl"
          />
          <a
            href={bounty.prize.explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={`View ${bounty.prize.currency} on Stellar Expert`}
            className="text-fg-muted hover:text-fg inline-flex items-center gap-0.5 text-xs font-semibold"
          >
            {bounty.prize.currency} <ExternalLink className="size-3" />
          </a>
        </p>
      </div>
      {bounty.maxWinners > 1 && (
        <p className="flex justify-between border-t pt-2 text-xs">
          <span className="text-fg-muted">Per winner</span>
          <Money amount={perWinner} currency={bounty.prize.currency} className="font-semibold" />
        </p>
      )}
    </section>
  );
}

function StatsCard({ bounty }: { bounty: Bounty }) {
  const rows = [
    { icon: Users, label: "Participants", value: bounty.participants.toLocaleString() },
    { icon: FileText, label: "Submissions", value: bounty.submissions.toLocaleString() },
    { icon: Crown, label: "Winners", value: `${bounty.winners} / ${bounty.maxWinners}` },
  ];
  return (
    <section className="bg-surface grid gap-1 rounded-[1.4rem] border-2 p-5">
      <p className="label-caps text-fg-faint pb-2">Stats</p>
      {rows.map(({ icon: Icon, label, value }) => (
        <p
          key={label}
          className="flex items-center justify-between border-b py-1.5 text-xs last:border-0"
        >
          <span className="text-fg-muted flex items-center gap-2">
            <Icon className="size-3.5" /> {label}
          </span>
          <b className="font-bold">{value}</b>
        </p>
      ))}
    </section>
  );
}

function WinnersCard({ bounty }: { bounty: Bounty }) {
  return (
    <section className="bg-surface grid gap-3 rounded-[1.4rem] border-2 p-5">
      <h2 className="display flex items-center gap-2 text-sm">
        <Crown className="text-primary-text size-4" /> Winners
        <span className="text-fg-muted text-xs font-normal">
          ({bounty.winnerList.length}/{bounty.maxWinners})
        </span>
      </h2>
      {bounty.winnerList.map((winner, index) => (
        <div key={index} className="flex items-center gap-2.5">
          <span className="marker text-fg-faint w-6 shrink-0 text-base">#{index + 1}</span>
          <PersonAvatar person={winner.user} className="size-8" />
          <span className="min-w-0 flex-1">
            <b className="block truncate text-xs font-semibold">{nameOf(winner.user)}</b>
            <Money
              amount={winner.prize}
              currency={bounty.prize.currency}
              className="text-fg-muted text-[11px]"
            />
          </span>
          {winner.claimed && (
            <CheckCircle2 aria-label="Claimed" className="text-primary-text size-4 shrink-0" />
          )}
        </div>
      ))}
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

const nameOf = (person: Person) =>
  person.displayName ?? (person.username ? `@${person.username}` : "Anonymous");

function PersonAvatar({ person, className }: { person: Person; className?: string }) {
  return (
    <Avatar
      name={nameOf(person).replace(/^@/, "")}
      url={person.avatarUrl}
      className={cn(
        "bg-surface-3 grid shrink-0 place-items-center rounded-full object-cover text-[10px] font-bold",
        className,
      )}
    />
  );
}

function PersonLink({
  person,
  className,
  children,
}: {
  person: Person;
  className?: string;
  children: ReactNode;
}) {
  return person.username ? (
    <Link href={`/u/${person.username}`} className={cn("hover:underline", className)}>
      {children}
    </Link>
  ) : (
    <span className={className}>{children}</span>
  );
}
