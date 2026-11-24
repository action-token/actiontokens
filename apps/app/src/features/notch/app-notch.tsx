"use client";

import {
  Bell,
  SkipBack,
  Check,
  Crosshair,
  Info,
  ListMusic,
  Loader2,
  LogIn,
  MessageCircle,
  Music,
  Package,
  Pause,
  Play,
  Search,
  SkipForward,
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
import { usePlayer, usePlayerProgress } from "~/features/player/player-store";
import { clock } from "~/features/player/time";
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
 *   2. the music panel, when tapped open or for a moment when a song starts
 *   3. an action you just took (joining a bounty or a crew, following…): busy, then done
 *   4. a message (any react-hot-toast success / error, so call sites don't change)
 *   5. a new notification (community replies, new drops from orgs you follow…)
 *   6. the page's idle feed (the home page's new drops and bounties)
 *
 * Moves are transform and opacity only.
 */
export function AppNotch({ hero = false }: { hero?: boolean }) {
  const { status } = useSession();
  const signedIn = status === "authenticated";
  const openWallet = useConnectWalletDialogStore((state) => state.setIsOpen);

  const hasTrack = usePlayer((state) => state.queue.length > 0);
  const txBusy = useTxSlot();
  const music = useMusicPanel();
  const activity = useActivity();
  const message = useLatestToast();
  const note = useNotes(signedIn, !txBusy && !music.shown && !activity && !message);
  const show: "tx" | "music" | "activity" | "toast" | "note" | null = txBusy
    ? "tx"
    : music.shown
      ? "music"
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
      {/* With a song on, the player takes the room and search folds to an icon. */}
      {hasTrack ? (
        <button
          type="button"
          onClick={openSearch}
          className="hm-notch-search hm-notch-search--icon"
          aria-label="Search"
          title="Search (Ctrl or ⌘ + K)"
        >
          <Search className="size-4" />
        </button>
      ) : (
        <button type="button" onClick={openSearch} className="hm-notch-search">
          <Search className="size-4 shrink-0" />
          <span className="truncate max-sm:hidden">Search drops, bounties, orgs…</span>
          <span className="truncate sm:hidden">Search</span>
          <kbd className="max-sm:hidden">⌘K</kbd>
        </button>
      )}
      <NowPlaying open={music.shown} onToggle={music.toggle} />
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
        {show === "music" && <MusicPanel onClose={music.close} />}
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

/* ── music: the island's compact and expanded states ───────────────────── */

/** Compact, like the iPhone island: the cover on the left, the bars on the right. Tap to open. */
function NowPlaying({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const track = usePlayer((state) => state.queue[state.index]);
  const playing = usePlayer((state) => state.playing);
  if (!track) return null;
  return (
    <button
      type="button"
      className="app-notch-play"
      data-playing={playing || undefined}
      data-open={open || undefined}
      onClick={onToggle}
      aria-expanded={open}
      aria-label={`${playing ? "Playing" : "Paused"}: ${track.title}. Show the player`}
    >
      <NotchCover key={track.coverUrl} src={track.coverUrl} className="app-notch-cover--sm" />
      <Bars />
    </button>
  );
}

function Bars() {
  return (
    <span className="app-notch-bars" aria-hidden>
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

/** Expanded, kept small: cover, title and the controls on one line, a hairline of progress under it. */
function MusicPanel({ onClose }: { onClose: () => void }) {
  const track = usePlayer((state) => state.queue[state.index]);
  const playing = usePlayer((state) => state.playing);
  const toggle = usePlayer((state) => state.toggle);
  const next = usePlayer((state) => state.next);
  const previous = usePlayer((state) => state.previous);
  const index = usePlayer((state) => state.index);
  const last = usePlayer((state) => state.queue.length - 1);
  const openFull = usePlayer((state) => state.setFullOpen);
  const { value, current, duration } = usePlayerProgress();
  if (!track) return null;
  return (
    <div className="app-notch-music" data-playing={playing || undefined}>
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
          onClick={() => {
            openFull(true);
            onClose();
          }}
          title="Open the full player"
        >
          <NotchCover key={track.coverUrl} src={track.coverUrl} className="app-notch-cover--md" />
          <span className="min-w-0">
            <b className="block truncate text-[13px] leading-tight">{track.title}</b>
            <span className="text-fg-muted block truncate text-[11px]">{track.artistName}</span>
          </span>
        </button>
        <button
          type="button"
          className="app-notch-ctl"
          onClick={previous}
          disabled={index === 0}
          aria-label="Previous song"
        >
          <SkipBack className="size-4" fill="currentColor" strokeWidth={0} />
        </button>
        <button
          type="button"
          className="app-notch-ctl app-notch-ctl--main"
          onClick={toggle}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? (
            <Pause className="size-4" fill="currentColor" strokeWidth={0} />
          ) : (
            <Play className="size-4 translate-x-px" fill="currentColor" strokeWidth={0} />
          )}
        </button>
        <button
          type="button"
          className="app-notch-ctl"
          onClick={next}
          disabled={index >= last}
          aria-label="Next song"
        >
          <SkipForward className="size-4" fill="currentColor" strokeWidth={0} />
        </button>
      </div>
      <div className="app-notch-time">
        <span>{clock(current)}</span>
        <span className="app-notch-progress" aria-hidden>
          <i style={{ transform: `scaleX(${value})` }} />
        </span>
        <span>{duration > 0 ? clock(duration) : "--:--"}</span>
      </div>
    </div>
  );
}

/**
 * Whether the music panel is open: tapped open, or for a few seconds when a new song starts
 * (as the iPhone island does). A tap outside the notch or Escape closes it.
 */
function useMusicPanel() {
  const trackId = usePlayer((state) => state.queue[state.index]?.id ?? null);
  const [open, setOpen] = useState(false);
  const [peekId, setPeekId] = useState<string | null>(null);

  useEffect(() => {
    if (!trackId) return;
    const show = window.setTimeout(() => setPeekId(trackId), 0);
    const hide = window.setTimeout(() => setPeekId(null), 3600);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
    };
  }, [trackId]);

  const shown = Boolean(trackId) && (open || peekId === trackId);
  useEffect(() => {
    if (!shown) return;
    const close = () => {
      setOpen(false);
      setPeekId(null);
    };
    const onDown = (event: PointerEvent) => {
      if (!(event.target as Element | null)?.closest(".app-notch")) close();
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && close();
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [shown]);

  return {
    shown,
    toggle: () => {
      setPeekId(null);
      setOpen(!shown);
    },
    close: () => {
      setOpen(false);
      setPeekId(null);
    },
  };
}

/** The cover, or a tile with a note when there is none or it fails to load. */
function NotchCover({ src, className }: { src: string | null | undefined; className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={cn("app-notch-cover", className)}>
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- covers come from many hosts
        <img src={src} alt="" onError={() => setFailed(true)} />
      ) : (
        <Music className="size-4" strokeWidth={2.4} />
      )}
    </span>
  );
}
