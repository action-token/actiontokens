"use client";

import {
  Bell,
  Check,
  Crosshair,
  Info,
  ListMusic,
  Loader2,
  LogIn,
  MessageCircle,
  Package,
  Pause,
  Play,
  Search,
  UserPlus,
  UserRound,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import toast, { resolveValue, useToasterStore } from "react-hot-toast";

import { cn } from "@actiontokens/ui/lib/cn";
import { BrandMark } from "@actiontokens/ui/patterns/boot-screen";
import { NOTCH_TX_SLOT } from "@actiontokens/ui/patterns/transaction-toast";
import { useConnectWalletDialogStore } from "@actiontokens/wallet";

import { AccountButton } from "~/features/account/account-button";
import { usePlayer } from "~/features/player/player-store";
import { api } from "~/trpc/react";

import { openSearch } from "../shell/search-dialog";
import { SidebarTools } from "../shell/sidebar-tools";
import { type Activity, type ActivityKind, useActivity } from "./notch-activity";
import { type NotchNote, useNotchFeed } from "./notch-feed";

/** How long a new notification or an idle note stays open. */
const PEEK_MS = 4200;

/**
 * The notch on every page: brand, search, what's playing and the bell. Like an
 * iPhone island it grows down to show what is happening, one thing at a time, most important
 * first:
 *
 *   1. a transaction in progress (the flows' own toast, countdown and buttons, portalled in)
 *   2. an action you just took (joining a bounty or a crew, following…): busy, then done
 *   3. a message (any react-hot-toast success / error, so call sites don't change)
 *   4. a new notification (community replies, new drops from orgs you follow…)
 *   5. the page's idle feed (the home page's new drops and bounties)
 *
 * Moves are transform and opacity only.
 */
export function AppNotch({ hero = false }: { hero?: boolean }) {
  const { status } = useSession();
  const signedIn = status === "authenticated";
  const openWallet = useConnectWalletDialogStore((state) => state.setIsOpen);

  const txBusy = useTxSlot();
  const activity = useActivity();
  const message = useLatestToast();
  const note = useNotes(signedIn, !txBusy && !activity && !message);
  const show: "tx" | "activity" | "toast" | "note" | null = txBusy
    ? "tx"
    : activity
      ? "activity"
      : message
        ? "toast"
        : note
          ? "note"
          : null;

  // While the notch speaks, the page's own toaster stays hidden: there is one place for messages.
  useEffect(() => {
    document.documentElement.dataset.notch = "";
    return () => {
      delete document.documentElement.dataset.notch;
    };
  }, []);

  return (
    <header
      className={cn("lp-top hm-notch app-notch", hero && "app-notch--hero")}
      data-open={show ? "" : undefined}
      data-show={show ?? undefined}
    >
      <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="Action-Tokens home">
        <span className="gx-logo grid size-9 place-items-center rounded-xl bg-white">
          <BrandMark className="h-6" />
        </span>
        <span className="gx-brand text-[1.2rem]! max-lg:hidden">Action-Tokens</span>
      </Link>
      <button type="button" onClick={openSearch} className="hm-notch-search">
        <Search className="size-4 shrink-0" />
        <span className="truncate max-sm:hidden">Search drops, bounties, orgs…</span>
        <span className="truncate sm:hidden">Search</span>
        <kbd className="max-sm:hidden">⌘K</kbd>
      </button>
      <NowPlaying />
      {signedIn ? (
        <>
          <SidebarTools className="max-sm:hidden" />
          <span className="sm:hidden">
            <AccountButton />
          </span>
        </>
      ) : (
        <button
          type="button"
          onClick={() => openWallet(true)}
          className="lp-cta !h-10 shrink-0 !px-4 !text-[1.05rem]"
        >
          <LogIn className="size-4" strokeWidth={2.4} />
          <span className="max-sm:hidden">Sign in</span>
        </button>
      )}

      <div className="lp-feed app-notch-drop" data-open={show ? "" : undefined} aria-live="polite">
        {/* Transaction toasts render in here (ToastViewport portals into this slot). */}
        <div id={NOTCH_TX_SLOT} className="app-notch-tx" hidden={!txBusy} />
        {show === "activity" && activity && <ActivityRow activity={activity} />}
        {show === "toast" && message && <MessageRow message={message} />}
        {show === "note" && note && <NoteRow note={note} />}
      </div>
    </header>
  );
}

/* ── 1 · transactions: is anything in the slot? ─────────────────────────── */

function useTxSlot() {
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const slot = document.getElementById(NOTCH_TX_SLOT);
    if (!slot) return;
    const check = () => setBusy(slot.childElementCount > 0);
    const observer = new MutationObserver(check);
    observer.observe(slot, { childList: true });
    check();
    return () => observer.disconnect();
  }, []);
  return busy;
}

/* ── 2 · the action you just took ───────────────────────────────────────── */

const ACTIVITY_ICON: Record<ActivityKind, typeof Check> = {
  bounty: Crosshair,
  community: Users,
  follow: UserPlus,
  playlist: ListMusic,
  profile: UserRound,
  comment: MessageCircle,
};

function ActivityRow({ activity }: { activity: Activity }) {
  const Icon = ACTIVITY_ICON[activity.kind];
  const busy = activity.phase === "busy";
  return (
    <div
      key={activity.id}
      className="lp-feed-item app-notch-msg"
      data-tone={busy ? "info" : "ok"}
      aria-busy={busy || undefined}
    >
      <span className="app-notch-icon">
        {busy ? (
          <Loader2 className="size-[18px] animate-spin" strokeWidth={2.6} />
        ) : (
          <Check className="size-[18px]" strokeWidth={2.6} />
        )}
      </span>
      <span className="min-w-0 flex-1 text-[13px] leading-snug font-semibold">{activity.text}</span>
      <Icon className="text-fg-faint size-4 shrink-0" aria-hidden />
    </div>
  );
}

/* ── 3 · messages: the newest visible react-hot-toast ───────────────────── */

type Message = { id: string; tone: "ok" | "bad" | "info"; text: string };

function useLatestToast(): Message | null {
  const { toasts } = useToasterStore();
  const latest = toasts.find((t) => t.visible && t.type !== "custom");
  if (!latest) return null;
  const value = resolveValue(latest.message, latest);
  return {
    id: latest.id,
    tone: latest.type === "success" ? "ok" : latest.type === "error" ? "bad" : "info",
    text:
      typeof value === "string"
        ? value
        : latest.type === "error"
          ? "Something went wrong."
          : "Done.",
  };
}

function MessageRow({ message }: { message: Message }) {
  const Icon = message.tone === "ok" ? Check : message.tone === "bad" ? X : Info;
  return (
    <div key={message.id} className="lp-feed-item app-notch-msg" data-tone={message.tone}>
      <span className="app-notch-icon">
        <Icon className="size-[18px]" strokeWidth={2.6} />
      </span>
      <span className="min-w-0 flex-1 text-[13px] leading-snug font-semibold">{message.text}</span>
      <button
        type="button"
        className="app-notch-close"
        aria-label="Dismiss"
        onClick={() => toast.dismiss(message.id)}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

/* ── 4 + 5 · new notifications, then the page's idle feed ───────────────── */

const isCommunity = (type: string) => type.startsWith("COMMUNITY_");

function useNotes(signedIn: boolean, free: boolean): NotchNote | null {
  const feed = useNotchFeed((state) => state.feed);
  const latest = api.notification.latest.useQuery(undefined, {
    enabled: signedIn,
    refetchInterval: 30_000,
  });
  const known = useRef<Set<string> | null>(null);
  const [queue, setQueue] = useState<NotchNote[]>([]);
  const [current, setCurrent] = useState<NotchNote | null>(null);
  const [idle, setIdle] = useState(0);

  // New unseen notifications since the page opened go in the queue (the first load is the baseline).
  useEffect(() => {
    const items = latest.data?.items;
    if (!items) return;
    if (known.current === null) {
      known.current = new Set(items.map((item) => item.id));
      return;
    }
    const fresh = items.filter((item) => !item.seen && !known.current!.has(item.id));
    for (const item of items) known.current.add(item.id);
    if (fresh.length === 0) return;
    setQueue((q) => [
      ...q,
      ...fresh.reverse().map((item): NotchNote => ({
        key: `n-${item.id}`,
        href: item.href,
        icon: isCommunity(item.type) ? "community" : "bell",
        title: isCommunity(item.type) ? "Your crew" : item.actorName,
        text: item.text,
        avatarUrl: item.avatarUrl,
      })),
    ]);
  }, [latest.data]);

  // Show one at a time while nothing more important is on; then the idle feed, every few seconds.
  useEffect(() => {
    if (!free || current) return;
    if (queue.length > 0) {
      const id = window.setTimeout(() => {
        setCurrent(queue[0]!);
        setQueue((q) => q.slice(1));
      }, 250);
      return () => window.clearTimeout(id);
    }
    if (feed.length === 0) return;
    const id = window.setTimeout(
      () => {
        if (document.hidden) return setIdle((n) => n + 1);
        setCurrent(feed[idle % feed.length]!);
        setIdle((n) => n + 1);
      },
      idle === 0 ? 1200 : 1600,
    );
    return () => window.clearTimeout(id);
  }, [free, current, queue, feed, idle]);

  useEffect(() => {
    if (!current) return;
    const id = window.setTimeout(() => setCurrent(null), PEEK_MS);
    return () => window.clearTimeout(id);
  }, [current]);

  return free ? current : null;
}

const NOTE_ICON = { drop: Package, bounty: Crosshair, community: Users, bell: Bell };

function NoteRow({ note }: { note: NotchNote }) {
  const Icon = NOTE_ICON[note.icon];
  const body = (
    <>
      <span className="app-notch-icon" data-kind={note.icon}>
        {note.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- avatars come from many hosts
          <img src={note.avatarUrl} alt="" className="size-full rounded-[inherit] object-cover" />
        ) : (
          <Icon className="size-[18px]" />
        )}
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <b className="block truncate text-[12px]">{note.title}</b>
        <span className="text-fg-muted block truncate text-[12px]">{note.text}</span>
      </span>
    </>
  );
  return note.href ? (
    <Link key={note.key} href={note.href} className="lp-feed-item">
      {body}
    </Link>
  ) : (
    <div key={note.key} className="lp-feed-item">
      {body}
    </div>
  );
}

/* ── Now playing: the cover and moving bars, tap to play / pause ────────── */

function NowPlaying() {
  const track = usePlayer((state) => state.queue[state.index]);
  const playing = usePlayer((state) => state.playing);
  const toggle = usePlayer((state) => state.toggle);
  const open = usePlayer((state) => state.setFullOpen);
  if (!track) return null;
  return (
    <span className="app-notch-play" data-playing={playing || undefined}>
      <button
        type="button"
        className="app-notch-cover"
        onClick={toggle}
        aria-label={playing ? `Pause ${track.title}` : `Play ${track.title}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- covers come from many hosts */}
        <img src={track.coverUrl} alt="" />
        <span className="app-notch-cover-btn">
          {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
        </span>
      </button>
      <button
        type="button"
        className="app-notch-track max-lg:hidden"
        onClick={() => open(true)}
        title="Open the player"
      >
        <b className="block truncate">{track.title}</b>
        <span className="text-fg-faint block truncate">{track.artistName}</span>
      </button>
      <span className="app-notch-bars" aria-hidden>
        <i />
        <i />
        <i />
        <i />
      </span>
    </span>
  );
}
