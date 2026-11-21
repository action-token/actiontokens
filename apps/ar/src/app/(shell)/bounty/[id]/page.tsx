"use client";

import { motion } from "framer-motion";
import {
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Crown,
  ExternalLink,
  FileText,
  Headphones,
  Lock,
  Music,
  Share2,
  Trophy,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { site } from "@actiontokens/ar-core/site";
import { cn } from "@actiontokens/ui/lib/cn";
import { TransactionToast } from "@actiontokens/ui/patterns/transaction-toast";

import { ArtistAvatar } from "~/components/artist/ArtistAvatar";
import { PrizeIcon } from "~/components/bounty/PrizeIcon";
import { Markdown } from "~/components/bounty/Markdown";
import { MinePanel } from "~/components/bounty/MinePanel";
import { ReportSheet } from "~/components/bounty/ReportSheet";
import { AppShell } from "~/components/shell/AppShell";
import { ArButton, ArLinkButton } from "~/components/ui/ArButton";
import { StatBlock } from "~/components/ui/Badges";
import { SegmentedTabs } from "~/components/ui/SegmentedTabs";
import { Skeleton, SkeletonText } from "~/components/ui/Skeleton";
import {
  type BountyDetail,
  type BountyPerson,
  formatAmount,
  musicRuleLabel,
  nameOf,
  perWinner,
  TONE_CLASS,
  timeAgo,
  viewerBadge,
} from "~/lib/ar/bounty";
import { useAuth } from "~/lib/ar/store";
import { useBountyClaim } from "~/lib/ar/useRewardClaim";
import { useQueryParams, useRouter } from "~/lib/navigation";
import { api } from "~/trpc/react";

type Section = "brief" | "people" | "mine";
const SECTIONS: Section[] = ["brief", "people", "mine"];

const LASTFM_ERRORS: Record<string, string> = {
  lastfm_unavailable: "Last.fm isn't set up yet.",
  missing_token: "Last.fm didn't send a sign-in token. Try again.",
  lastfm_failed: "Could not connect your Last.fm account. Please try again.",
};

/**
 * ── /bounty/[id] ───────────────────────────────────────────────────────────
 *
 * One bounty, and one clear next step. The pinned bar at the bottom always
 * says the single thing you can do right now (sign in, join, submit a
 * report, claim your prize), so the page never asks you to work out where
 * you stand.
 *
 * Everything the old Bandcoin bounty page had is here: the brief and its
 * requirements (or the songs for a listening challenge), participants and
 * winners, your reports and Last.fm progress, the prize pool and claiming
 * your prize from escrow. Artists run their bounty from the artist portal.
 */
export default function BountyDetailScreen() {
  const router = useRouter();
  const { query: urlQuery } = useQueryParams();
  const id = typeof urlQuery.id === "string" ? urlQuery.id : "";

  // Deep links (and the way back from Last.fm) land on a section; read once, on arrival.
  const sectionParam = typeof urlQuery.section === "string" ? urlQuery.section : null;
  const lastFm = typeof urlQuery.lastfm === "string" ? urlQuery.lastfm : null;
  const lastFmError = typeof urlQuery.error === "string" ? urlQuery.error : null;
  const [lastFmNote] = useState(() =>
    lastFm === "connected"
      ? { ok: true, text: "Last.fm account connected. Tap Sync to count your plays." }
      : lastFmError
        ? { ok: false, text: LASTFM_ERRORS[lastFmError] ?? LASTFM_ERRORS.lastfm_failed! }
        : null,
  );
  const [section, setSection] = useState<Section>(() =>
    lastFmNote
      ? "mine"
      : sectionParam && (SECTIONS as string[]).includes(sectionParam)
        ? (sectionParam as Section)
        : "brief",
  );
  const [reporting, setReporting] = useState(false);

  // Tidy Last.fm's flags out of the URL once the note has taken them.
  useEffect(() => {
    if (lastFm || lastFmError) void router.replace(`/bounty/${id}`, undefined, { scroll: false });
  }, [lastFm, lastFmError, id, router]);

  const detail = api.bounty.byId.useQuery(
    { bountyId: id },
    { enabled: Boolean(id), retry: (n, e) => e.data?.code !== "NOT_FOUND" && n < 2 },
  );
  const bounty = detail.data;

  if (!id || detail.isLoading) return <DetailSkeleton />;

  if (!bounty) {
    return (
      <AppShell tabs={false}>
        <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
          <p className="font-hud text-ar-dim text-[15px] font-bold tracking-[0.12em] uppercase">
            {detail.error?.data?.code === "NOT_FOUND"
              ? "Bounty not found"
              : "Couldn't load this bounty"}
          </p>
          <ArLinkButton href="/bounty" variant="primary">
            All bounties
          </ArLinkButton>
        </div>
      </AppShell>
    );
  }

  const won = Boolean(bounty.me?.winner);
  const badge = viewerBadge({ ...bounty, won });
  const isMusicOnly = bounty.music?.mode === "MUSIC_ONLY";
  const canSubmit =
    bounty.joined && bounty.status === "RUNNING" && !bounty.isCreator && !isMusicOnly;
  const locked = section === "mine" && !bounty.joined && !bounty.isCreator;

  return (
    <AppShell tabs={false}>
      <div className="flex h-full flex-col">
        <div className="ar-scroll relative flex-1">
          <Hero bounty={bounty} />

          {/* ── Identity ─────────────────────────────────────────── */}
          <div className="relative -mt-8 px-5">
            <Link href={`/artists/${bounty.artist.id}`} className="flex w-fit items-end gap-2.5">
              <ArtistAvatar
                src={bounty.artist.avatarUrl}
                loading="eager"
                className="ring-ar-bg h-[56px] w-[56px] rounded-[16px] ring-[3px]"
              />
              <span className="font-hud text-ar-dim mb-1 text-[11px] font-semibold tracking-[0.14em] uppercase">
                {bounty.artist.name}
              </span>
            </Link>

            <h1 className="text-ar-text mt-3 text-[21px] leading-tight font-semibold">
              {bounty.title}
            </h1>
            {bounty.summary && (
              <p className="text-ar-dim mt-1.5 text-[13px] leading-relaxed">{bounty.summary}</p>
            )}

            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "font-hud inline-flex h-[22px] items-center rounded-full border px-2.5 text-[10px] font-semibold tracking-[0.12em] uppercase",
                  TONE_CLASS[badge.tone],
                )}
              >
                {badge.label}
              </span>
              {bounty.requiresActionCam && (
                <span className="font-hud border-ar-line-bright text-ar-dim inline-flex h-[22px] items-center gap-1 rounded-full border bg-white/[0.05] px-2.5 text-[10px] font-semibold tracking-[0.12em] uppercase">
                  <Camera size={10} strokeWidth={2.6} /> Action Cam required
                </span>
              )}
              <span className="font-hud text-ar-faint text-[10px] font-semibold tracking-[0.1em] uppercase">
                Posted {timeAgo(bounty.createdAt)}
              </span>
            </div>
          </div>

          {/* ── Reward ───────────────────────────────────────────── */}
          <div className="rounded-ar-lg from-ar-accent/15 via-ar-surface to-ar-surface mx-5 mt-4 overflow-hidden border-2 border-[hsl(var(--st-line)/0.85)] bg-linear-to-br shadow-[var(--st-off)_var(--st-off)_0_0_hsl(var(--st-pop)/0.9)]">
            <div className="flex items-end justify-between gap-3 px-4 pt-3.5 pb-3">
              <div className="min-w-0">
                <p className="font-hud text-ar-faint text-[9.5px] font-semibold tracking-[0.22em] uppercase">
                  Prize pool
                </p>
                <p className="font-hud text-glow-soft text-ar-accent-hot mt-1 flex items-center gap-2 text-[30px] leading-none font-bold tabular-nums">
                  <PrizeIcon prize={bounty.prize} className="size-[0.8em]" />
                  {formatAmount(bounty.prize.amount)}
                </p>
              </div>
              <div className="mb-0.5 text-right">
                <a
                  href={bounty.prize.explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`View ${bounty.prize.currency} on Stellar Expert`}
                  className="font-hud text-ar-dim hover:text-ar-text inline-flex items-center gap-1 text-[11px] font-semibold"
                >
                  {bounty.prize.currency} <ExternalLink size={10} strokeWidth={2.4} />
                </a>
                {bounty.maxWinners > 1 && (
                  <p className="font-hud text-ar-faint mt-0.5 text-[10px] font-semibold tabular-nums">
                    {formatAmount(perWinner(bounty))} per winner
                  </p>
                )}
              </div>
            </div>
            <div className="border-ar-line flex items-center justify-around border-t py-2.5">
              <StatBlock label="Joined" value={bounty.participants} />
              <span className="bg-ar-line h-7 w-px" />
              <StatBlock label="Reports" value={bounty.submissions} />
              <span className="bg-ar-line h-7 w-px" />
              <StatBlock
                label="Winners"
                value={`${bounty.winners}/${bounty.maxWinners}`}
                accent={bounty.status === "RUNNING"}
              />
            </div>
          </div>

          {bounty.me?.winner && (
            <WinnerBanner
              bounty={bounty}
              prize={bounty.me.winner.prize}
              claimed={bounty.me.winner.claimed}
            />
          )}

          {/* ── Sections ─────────────────────────────────────────── */}
          <SegmentedTabs
            layoutId="bounty-detail-sections"
            value={section}
            onChange={setSection}
            className="mx-5 mt-5"
            tabs={[
              { id: "brief", label: "Brief" },
              { id: "people", label: "People", count: bounty.participants || undefined },
              {
                id: "mine",
                label: bounty.isCreator ? "Reports" : "Mine",
                count:
                  bounty.joined && bounty.me?.submissions.length
                    ? bounty.me.submissions.length
                    : undefined,
                icon: bounty.joined || bounty.isCreator ? undefined : Lock,
              },
            ]}
          />

          <div className="px-5 pt-4 pb-6">
            {section === "brief" ? (
              <Brief bounty={bounty} />
            ) : section === "people" ? (
              <People bounty={bounty} />
            ) : bounty.isCreator ? (
              <ManageInPortal bountyId={bounty.id} />
            ) : locked ? (
              <LockedNote />
            ) : (
              <MinePanel bounty={bounty} lastFmNote={lastFmNote} />
            )}
          </div>
        </div>

        {/* ── Pinned bottom bar ────────────────────────────────────── */}
        <div
          className="ar-tabbar-surface rounded-t-ar-xl relative z-30 px-4 pt-3"
          style={{ paddingBottom: "max(12px, var(--ar-safe-bottom))" }}
        >
          <PrimaryAction
            bounty={bounty}
            canSubmit={canSubmit}
            onSubmit={() => {
              setSection("mine");
              setReporting(true);
            }}
            onShowProgress={() => setSection("mine")}
          />
        </div>
      </div>

      <ReportSheet bountyId={bounty.id} open={reporting} onClose={() => setReporting(false)} />
    </AppShell>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────

/** Album art for a listening challenge, else the artist's picture, else the grid. */
function Hero({ bounty }: { bounty: BountyDetail }) {
  const router = useRouter();
  const art = (bounty.music?.tracks ?? [])
    .map((t) => t.albumArtUrl)
    .filter((url): url is string => Boolean(url));

  return (
    <div className="relative h-[220px] overflow-hidden">
      {art.length > 0 ? (
        <div className="flex h-full">
          {art.slice(0, 4).map((url) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={url} src={url} alt="" className="h-full min-w-0 flex-1 object-cover" />
          ))}
        </div>
      ) : bounty.artist.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={bounty.artist.avatarUrl}
          alt=""
          className="h-full w-full scale-110 object-cover opacity-70 blur-xl"
        />
      ) : (
        <div className="ar-grid from-ar-accent/25 via-ar-surface to-ar-bg h-full w-full bg-linear-to-br" />
      )}
      <div className="from-ar-void/70 to-ar-bg pointer-events-none absolute inset-0 bg-linear-to-b via-transparent" />

      <div
        className="absolute inset-x-0 top-0 flex items-center justify-between px-4"
        style={{ paddingTop: "calc(var(--ar-top-inset) + 14px)" }}
      >
        <button
          onClick={() => {
            if (window.history.length > 1) router.back();
            else void router.push("/bounty");
          }}
          aria-label="Back"
          className="ar-glass text-ar-text flex h-9 w-9 items-center justify-center rounded-full"
        >
          <ChevronLeft size={17} strokeWidth={2.4} />
        </button>
        <button
          aria-label="Share this bounty"
          onClick={() => {
            void navigator
              .share?.({ title: bounty.title, url: window.location.href })
              .catch(() => undefined);
          }}
          className="ar-glass text-ar-text flex h-9 w-9 items-center justify-center rounded-full"
        >
          <Share2 size={15} strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-hud text-ar-faint mb-2.5 text-[9.5px] font-semibold tracking-[0.24em] uppercase">
      {children}
    </h2>
  );
}

/** What to do (songs or steps), the description, and how the reward is delivered. */
function Brief({ bounty }: { bounty: BountyDetail }) {
  const [showAll, setShowAll] = useState(false);
  const isMusicOnly = bounty.music?.mode === "MUSIC_ONLY";
  const tracks = bounty.music?.tracks ?? [];
  const steps = showAll ? bounty.instructions : bounty.instructions.slice(0, 3);
  const extra = bounty.instructions.length - 3;

  return (
    <div className="space-y-5">
      <section>
        <SectionLabel>{isMusicOnly ? "Listening challenge" : "Requirements"}</SectionLabel>
        <div className="ar-bevel rounded-ar space-y-3 p-3.5">
          {tracks.length > 0 && bounty.music && (
            <div
              className={cn(
                "space-y-2",
                !isMusicOnly && bounty.instructions.length > 0 && "border-ar-line border-b pb-3",
              )}
            >
              {tracks.map((track) => (
                <div key={track.id} className="flex items-center gap-2.5">
                  {track.albumArtUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={track.albumArtUrl}
                      alt=""
                      className="h-9 w-9 shrink-0 rounded-[9px] object-cover"
                    />
                  ) : (
                    <span className="bg-ar-surface-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px]">
                      <Music size={14} className="text-ar-faint" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="text-ar-text block truncate text-[12.5px] font-semibold">
                      {track.title}
                    </span>
                    <span className="text-ar-faint block truncate text-[11px]">
                      {track.artistName}
                    </span>
                  </span>
                  <span className="font-hud text-ar-dim text-[11px] font-bold tabular-nums">
                    {track.targetPlays}×
                  </span>
                </div>
              ))}
              <p className="font-hud text-ar-faint border-ar-line border-t pt-2 text-[10px] font-semibold tracking-[0.08em] uppercase">
                {musicRuleLabel(bounty.music)}
              </p>
            </div>
          )}

          {!isMusicOnly && bounty.instructions.length > 0 && (
            <div className="space-y-2">
              {steps.map((step, index) => (
                <p
                  key={index}
                  className="text-ar-dim flex items-start gap-2 text-[12.5px] leading-snug"
                >
                  <CheckCircle2
                    size={14}
                    strokeWidth={2.3}
                    className="text-ar-accent-hot mt-0.5 shrink-0"
                  />{" "}
                  {step}
                </p>
              ))}
              {extra > 0 && (
                <button
                  onClick={() => setShowAll(!showAll)}
                  className="font-hud text-ar-text flex items-center gap-1 text-[11px] font-semibold tracking-[0.08em] uppercase"
                >
                  {showAll ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  {showAll ? "Show less" : `+${extra} more`}
                </button>
              )}
            </div>
          )}

          {!isMusicOnly && bounty.instructions.length === 0 && tracks.length === 0 && (
            <p className="text-ar-faint text-[12.5px] italic">No specific requirements listed.</p>
          )}
        </div>
      </section>

      <section>
        <SectionLabel>Description</SectionLabel>
        {bounty.description ? (
          <Markdown content={bounty.description} />
        ) : (
          <p className="text-ar-faint text-[12.5px] italic">No description provided.</p>
        )}
      </section>

      {bounty.rewardNote && (
        <section className="ar-bevel rounded-ar px-3.5 py-3">
          <SectionLabel>Reward delivery</SectionLabel>
          <p className="text-ar-dim text-[12.5px] leading-relaxed whitespace-pre-wrap">
            {bounty.rewardNote}
          </p>
        </section>
      )}
    </div>
  );
}

/** Winners first, then everyone who joined, newest first (the old participants table). */
function People({ bounty }: { bounty: BountyDetail }) {
  const submitted = (bounty.me?.submissions.length ?? 0) > 0;

  return (
    <div className="space-y-5">
      {bounty.winnerList.length > 0 && (
        <section>
          <SectionLabel>
            Winners · {bounty.winnerList.length}/{bounty.maxWinners}
          </SectionLabel>
          <ul className="ar-bevel divide-ar-line rounded-ar divide-y">
            {bounty.winnerList.map((winner, index) => (
              <li key={index} className="flex items-center gap-2.5 px-3.5 py-2.5">
                <span className="font-hud text-rarity-legendary w-6 shrink-0 text-[13px] font-bold">
                  #{index + 1}
                </span>
                <PersonAvatar person={winner.user} />
                <span className="min-w-0 flex-1">
                  <PersonName person={winner.user} />
                  <span className="font-hud text-ar-dim flex items-center gap-1 text-[10.5px] font-semibold tabular-nums">
                    <PrizeIcon prize={bounty.prize} className="size-3" />
                    {formatAmount(winner.prize)}
                  </span>
                </span>
                {winner.claimed && (
                  <CheckCircle2
                    size={15}
                    aria-label="Claimed"
                    className="text-ar-accent-hot shrink-0"
                  />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <SectionLabel>Participants · {bounty.participants}</SectionLabel>
        {bounty.participantList.length === 0 ? (
          <div className="py-10 text-center">
            <Users size={20} strokeWidth={2.2} className="text-ar-faint mx-auto" />
            <p className="font-hud text-ar-dim mt-2 text-[12px] font-bold tracking-[0.14em] uppercase">
              No participants yet
            </p>
            <p className="text-ar-faint mt-1 text-[12px]">Be the first to join!</p>
          </div>
        ) : (
          <ul className="ar-bevel divide-ar-line rounded-ar divide-y">
            {bounty.participantList.map((row, index) => (
              <li
                key={index}
                className={cn(
                  "flex items-center gap-2.5 px-3.5 py-2.5",
                  row.prize && "bg-rarity-legendary/[0.06]",
                )}
              >
                <span className="w-5 shrink-0 text-center">
                  {row.prize ? (
                    <Crown size={14} className="text-rarity-legendary mx-auto" />
                  ) : (
                    <span className="font-hud text-ar-faint text-[10.5px] font-semibold">
                      {index + 1}
                    </span>
                  )}
                </span>
                <PersonAvatar person={row.user} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <PersonName person={row.user} />
                    {row.isMe && (
                      <span className="font-hud bg-ar-accent/15 text-ar-accent-hot rounded-full px-1.5 py-px text-[9px] font-bold tracking-[0.08em] uppercase">
                        You
                      </span>
                    )}
                  </span>
                  <span className="text-ar-faint block text-[10.5px]">
                    Joined {timeAgo(row.joinedAt)}
                  </span>
                </span>
                {row.isMe && submitted && (
                  <FileText
                    size={14}
                    aria-label="Report sent"
                    className="text-ar-accent-hot shrink-0"
                  />
                )}
                {row.prize && (
                  <span className="font-hud text-ar-text flex shrink-0 items-center gap-1 text-[11px] font-bold tabular-nums">
                    <PrizeIcon prize={bounty.prize} className="size-3" />
                    {formatAmount(row.prize)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PersonAvatar({ person }: { person: BountyPerson }) {
  return person.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={person.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
  ) : (
    <span className="font-hud bg-ar-surface-3 text-ar-dim flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold uppercase">
      {nameOf(person).replace(/^@/, "").slice(0, 1)}
    </span>
  );
}

/** Fan profiles live in the fan app. */
function PersonName({ person }: { person: BountyPerson }) {
  const name = (
    <span className="text-ar-text truncate text-[12.5px] font-semibold">{nameOf(person)}</span>
  );
  return person.username ? (
    <a
      href={`${site.urls.fanApp}/u/${person.username}`}
      target="_blank"
      rel="noopener noreferrer"
      className="block min-w-0 truncate hover:underline"
    >
      {name}
    </a>
  ) : (
    <span className="block min-w-0 truncate">{name}</span>
  );
}

function LockedNote() {
  return (
    <div className="py-10 text-center">
      <span className="border-ar-line-bright text-ar-faint mx-auto flex h-11 w-11 items-center justify-center rounded-full border bg-white/[0.04]">
        <Lock size={17} strokeWidth={2.3} />
      </span>
      <p className="font-hud text-ar-dim mt-3 text-[13px] font-bold tracking-[0.14em] uppercase">
        Join to unlock
      </p>
      <p className="text-ar-faint mx-auto mt-1.5 max-w-[17rem] text-[12.5px] leading-relaxed">
        Once you&rsquo;ve joined, your reports and listening progress show up here.
      </p>
    </div>
  );
}

function ManageInPortal({ bountyId }: { bountyId: string }) {
  return (
    <div className="py-10 text-center">
      <FileText size={20} strokeWidth={2.2} className="text-ar-faint mx-auto" />
      <p className="font-hud text-ar-dim mt-3 text-[13px] font-bold tracking-[0.14em] uppercase">
        Review reports in the organization portal
      </p>
      <p className="text-ar-faint mx-auto mt-1.5 max-w-[17rem] text-[12.5px] leading-relaxed">
        Read entries, pick winners and change the bounty&rsquo;s status from your artist portal.
      </p>
      <a
        href={`${site.urls.orgPortal}/bounties/${bountyId}`}
        className="ar-key text-ar-text rounded-ar mt-4 inline-flex h-11 items-center gap-2 px-4 text-[13.5px] font-semibold"
      >
        Open artist portal <ExternalLink size={15} strokeWidth={2.3} />
      </a>
    </div>
  );
}

function WinnerBanner({
  bounty,
  prize,
  claimed,
}: {
  bounty: BountyDetail;
  prize: string;
  claimed: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-ar-lg border-rarity-legendary/50 bg-rarity-legendary/10 mx-5 mt-3 flex items-center gap-3 border p-3.5"
    >
      <span className="bg-rarity-legendary/20 text-rarity-legendary flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]">
        <Trophy size={19} strokeWidth={2.3} />
      </span>
      <div className="min-w-0">
        <p className="text-ar-text text-[14px] font-semibold">You won this bounty</p>
        <p className="text-ar-dim mt-0.5 text-[12px] leading-snug">
          {formatAmount(prize)} {bounty.prize.currency}{" "}
          {claimed ? "is in your wallet." : "is waiting in escrow. Claim it below."}
        </p>
      </div>
    </motion.div>
  );
}

/**
 * The one thing you can do next, in the old page's order: manage it if it's
 * yours, claim what you won, sign in, join, then submit a report.
 */
function PrimaryAction({
  bounty,
  canSubmit,
  onSubmit,
  onShowProgress,
}: {
  bounty: BountyDetail;
  canSubmit: boolean;
  onSubmit: () => void;
  onShowProgress: () => void;
}) {
  const user = useAuth((s) => s.user);
  const requireAuth = useAuth((s) => s.requireAuth);
  const utils = api.useUtils();
  const claim = useBountyClaim(bounty.id);
  const join = api.bounty.join.useMutation({
    onSuccess: () =>
      Promise.all([
        utils.bounty.byId.invalidate({ bountyId: bounty.id }),
        utils.bounty.list.invalidate(),
      ]),
  });

  const note = (text: string) => (
    <p className="font-hud text-ar-faint mb-2 text-center text-[10px] font-semibold tracking-[0.12em] uppercase">
      {text}
    </p>
  );
  const winner = bounty.me?.winner;

  if (claim.step) {
    const finished = claim.step.kind === "success";
    return (
      <div className="[&>*]:w-full">
        <TransactionToast
          key={claim.step.kind}
          step={claim.step}
          onSend={claim.send}
          onCancel={claim.stop}
          actions={
            claim.step.kind === "confirm" ? (
              <ArButton variant="ghost" size="sm" onClick={claim.stop}>
                Cancel
              </ArButton>
            ) : (
              <ArButton variant="ghost" size="sm" onClick={claim.reset}>
                {finished ? "Done" : "Close"}
              </ArButton>
            )
          }
        />
      </div>
    );
  }

  if (bounty.isCreator) {
    return (
      <>
        {note("You posted this bounty")}
        <a
          href={`${site.urls.orgPortal}/bounties/${bounty.id}`}
          className="ar-key ar-key-primary rounded-ar-lg flex h-[54px] w-full items-center justify-center gap-2.5 px-6 text-[15px] font-semibold"
        >
          Manage in artist portal <ExternalLink size={18} strokeWidth={2.3} />
        </a>
      </>
    );
  }

  if (winner && !winner.claimed) {
    return (
      <ArButton
        block
        size="lg"
        variant="gold"
        icon={Crown}
        onClick={() =>
          claim.claim(
            <>
              Claim {formatAmount(winner.prize)} {bounty.prize.currency} from the bounty escrow.
            </>,
          )
        }
      >
        Claim {formatAmount(winner.prize)} {bounty.prize.currency}
      </ArButton>
    );
  }

  if (winner?.claimed) {
    return (
      <ArButton block size="lg" disabled icon={CheckCircle2}>
        Prize claimed
      </ArButton>
    );
  }

  if (!user) {
    return bounty.status === "RUNNING" ? (
      <ArButton
        block
        size="lg"
        variant="primary"
        icon={Wallet}
        onClick={() => requireAuth("bounty")}
      >
        Sign in to join
      </ArButton>
    ) : (
      <ArButton block size="lg" disabled>
        {bounty.status === "PAUSED" ? "Bounty paused" : "Bounty ended"}
      </ArButton>
    );
  }

  if (bounty.status === "PAUSED") {
    return (
      <>
        {bounty.joined && note("Submissions are paused")}
        <ArButton block size="lg" disabled icon={Lock}>
          Bounty paused
        </ArButton>
      </>
    );
  }

  if (bounty.status === "COMPLETED") {
    return (
      <>
        {bounty.joined && note("Results are final")}
        <ArButton block size="lg" disabled>
          Bounty ended
        </ArButton>
      </>
    );
  }

  if (!bounty.joined) {
    return (
      <>
        {join.error && (
          <p className="text-ar-danger mb-2 text-center text-[12px]">{join.error.message}</p>
        )}
        <ArButton
          block
          size="lg"
          variant="primary"
          icon={Users}
          busy={join.isPending}
          onClick={() => join.mutate({ bountyId: bounty.id })}
        >
          {join.isPending ? "Joining" : "Join bounty"}
        </ArButton>
      </>
    );
  }

  if (canSubmit) {
    return (
      <ArButton block size="lg" variant="primary" icon={FileText} onClick={onSubmit}>
        {(bounty.me?.submissions.length ?? 0) > 0 ? "Submit another report" : "Submit report"}
      </ArButton>
    );
  }

  return (
    <ArButton block size="lg" variant="primary" icon={Headphones} onClick={onShowProgress}>
      Your listening progress
    </ArButton>
  );
}

function DetailSkeleton() {
  return (
    <AppShell tabs={false}>
      <div className="h-full" role="status" aria-label="Loading bounty">
        <Skeleton className="h-[220px] w-full" rounded="rounded-none" />
        <div className="px-5">
          <Skeleton className="-mt-8 h-[56px] w-[56px]" rounded="rounded-[16px]" />
          <Skeleton rounded="rounded-full" className="mt-3 h-5 w-4/5" />
          <Skeleton rounded="rounded-full" className="mt-3 h-5 w-24" />
          <Skeleton className="mt-4 h-[118px] w-full" rounded="rounded-ar-lg" />
          <Skeleton className="mt-5 h-11 w-full" />
          <SkeletonText lines={4} className="mt-4" />
        </div>
      </div>
    </AppShell>
  );
}
