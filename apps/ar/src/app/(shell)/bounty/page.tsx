"use client";

import { keepPreviousData } from "@tanstack/react-query";
import { Crown, FileText, Search, Users, Wallet, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { cn } from "@bandcoin/ui/lib/cn";

import { BountyCard, BountyCardSkeleton } from "~/components/bounty/BountyCard";
import { PrizeIcon } from "~/components/bounty/PrizeIcon";
import { AppShell, ScreenHeader } from "~/components/shell/AppShell";
import { ArButton } from "~/components/ui/ArButton";
import { Chip } from "~/components/ui/Badges";
import { SegmentedTabs } from "~/components/ui/SegmentedTabs";
import { formatAmount, nameOf, timeAgo } from "~/lib/ar/bounty";
import { useAuth } from "~/lib/ar/store";
import { useDragScroll } from "~/lib/ar/useDragScroll";
import { api } from "~/trpc/react";

type Segment = "all" | "not_joined" | "joined";
type Sort = "newest" | "prize";

const SORTS: { id: Sort; label: string }[] = [
  { id: "newest", label: "Newest" },
  { id: "prize", label: "Highest prize" },
];

const ACTIVITY = {
  join: { icon: Users, verb: "joined" },
  submit: { icon: FileText, verb: "sent a report to" },
  win: { icon: Crown, verb: "won" },
} as const;

/**
 * ── /bounty ────────────────────────────────────────────────────────────────
 *
 * Tasks artists are paying for, with the old Bandcoin's browse: All, Not
 * joined and Joined, search, newest or biggest prize, the top bounties and
 * who's been doing what lately.
 *
 * Browsable signed out, like everything else; joining is what asks for a
 * wallet.
 */
export default function BountyScreen() {
  const user = useAuth((s) => s.user);
  const requireAuth = useAuth((s) => s.requireAuth);
  const topRailRef = useDragScroll<HTMLDivElement>();

  const [segment, setSegment] = useState<Segment>("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");

  // Debounced so each keystroke isn't its own round trip.
  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const needsUser = segment !== "all" && !user;
  const list = api.bounty.list.useInfiniteQuery(
    { filter: segment, sort, search: search || undefined },
    {
      getNextPageParam: (last) => last.nextCursor ?? undefined,
      enabled: !needsUser,
      placeholderData: keepPreviousData,
    },
  );
  const top = api.bounty.top.useQuery(undefined, { staleTime: 60_000 });
  const recent = api.bounty.recent.useQuery(undefined, { staleTime: 60_000 });

  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const browsing = segment === "all" && !search;

  return (
    <AppShell>
      <div className="flex h-full flex-col">
        <ScreenHeader eyebrow="Earn from artists" title="Bounty" />

        <div className="ar-scroll flex-1 pb-6">
          {/* ── Top bounties ───────────────────────────────────────── */}
          {browsing && (top.data?.length ?? 0) > 0 && (
            <section className="pb-4">
              <h2 className="font-hud text-ar-faint mb-2 px-5 text-[9.5px] font-semibold tracking-[0.24em] uppercase">
                Top bounties
              </h2>
              <div ref={topRailRef} className="ar-scroll-x flex gap-3 px-5 pb-1">
                {top.data?.map((b, i) => (
                  <Link
                    key={b.id}
                    href={`/bounty/${b.id}`}
                    className="ar-bevel group rounded-ar-lg relative block h-[132px] w-[168px] shrink-0 overflow-hidden"
                  >
                    {b.artist.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={b.artist.avatarUrl}
                        alt=""
                        loading="lazy"
                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                      />
                    ) : (
                      <div className="ar-grid from-ar-accent/25 via-ar-surface to-ar-surface absolute inset-0 bg-linear-to-br" />
                    )}
                    <div className="from-ar-surface via-ar-surface/85 absolute inset-0 bg-linear-to-t to-transparent" />

                    <span
                      className={cn(
                        "font-hud absolute top-2 left-2 flex h-6 min-w-6 items-center justify-center rounded-full border px-1.5 text-[11px] font-bold backdrop-blur-xs",
                        i === 0
                          ? "border-rarity-legendary/60 bg-rarity-legendary/20 text-rarity-legendary"
                          : "border-ar-line-bright bg-ar-void/50 text-ar-text",
                      )}
                    >
                      #{i + 1}
                    </span>

                    <div className="absolute inset-x-0 bottom-0 p-2.5">
                      <p className="font-hud text-ar-faint truncate text-[9.5px] font-semibold tracking-[0.12em] uppercase">
                        {b.artist.name}
                      </p>
                      <p className="text-ar-text mt-0.5 line-clamp-1 text-[13px] leading-snug font-semibold">
                        {b.title}
                      </p>
                      <p className="font-hud text-ar-accent-hot text-glow-soft mt-1 flex items-center gap-1 text-[15px] leading-none font-bold tabular-nums">
                        <PrizeIcon prize={b.prize} className="size-3.5" />
                        {formatAmount(b.prize.amount)}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <SegmentedTabs
            layoutId="bounty-segments"
            value={segment}
            onChange={setSegment}
            className="mx-5"
            tabs={[
              { id: "all", label: "All" },
              { id: "not_joined", label: "Not joined" },
              { id: "joined", label: "Joined" },
            ]}
          />

          {needsUser ? (
            <div className="px-7 py-14 text-center">
              <p className="font-hud text-ar-dim text-[13px] font-bold tracking-[0.14em] uppercase">
                Your bounties live here
              </p>
              <p className="text-ar-faint mx-auto mt-1.5 max-w-[17rem] text-[12.5px] leading-relaxed">
                Sign in to join bounties, send reports and claim what you win.
              </p>
              <ArButton
                variant="primary"
                icon={Wallet}
                className="mt-5"
                onClick={() => requireAuth("bounty")}
              >
                Connect wallet
              </ArButton>
            </div>
          ) : (
            <>
              {/* ── Search + sort ──────────────────────────────────── */}
              <div className="mx-5 mt-3">
                <div className="ar-bevel rounded-ar flex h-11 items-center gap-2.5 px-3.5">
                  <Search size={15} strokeWidth={2.2} className="text-ar-faint shrink-0" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search bounties"
                    aria-label="Search bounties"
                    className="text-ar-text placeholder:text-ar-faint min-w-0 flex-1 bg-transparent text-[13px] outline-hidden"
                  />
                  {query && (
                    <button
                      onClick={() => setQuery("")}
                      aria-label="Clear search"
                      className="text-ar-faint hover:text-ar-text shrink-0"
                    >
                      <X size={15} strokeWidth={2.4} />
                    </button>
                  )}
                </div>
              </div>

              <div className="ar-scroll-x mt-3 flex gap-1.5 px-5">
                {SORTS.map((s) => (
                  <Chip key={s.id} active={sort === s.id} onClick={() => setSort(s.id)}>
                    {s.label}
                  </Chip>
                ))}
              </div>

              <div className="mt-3.5 space-y-3 px-5">
                {list.isLoading &&
                  Array.from({ length: 3 }).map((_, i) => <BountyCardSkeleton key={i} />)}

                {items.map((b) => (
                  <BountyCard key={b.id} bounty={b} />
                ))}

                {list.isError && <ErrorNote onRetry={() => void list.refetch()} />}

                {!list.isLoading && !list.isError && items.length === 0 && (
                  <Empty
                    title={
                      search
                        ? "No matches"
                        : segment === "joined"
                          ? "Nothing joined yet"
                          : "No open bounties"
                    }
                    body={
                      search
                        ? "Nothing matches that search."
                        : segment === "joined"
                          ? "Join a bounty and it'll show up here with your reports and results."
                          : "Artists post bounties here. Check back soon."
                    }
                  />
                )}

                {list.hasNextPage && (
                  <div className="flex justify-center pt-2">
                    <ArButton
                      variant="outline"
                      busy={list.isFetchingNextPage}
                      onClick={() => void list.fetchNextPage()}
                    >
                      Show more
                    </ArButton>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── Recent activity ────────────────────────────────────── */}
          {browsing && (recent.data?.length ?? 0) > 0 && (
            <section className="mt-6 px-5">
              <h2 className="font-hud text-ar-faint mb-2.5 text-[9.5px] font-semibold tracking-[0.24em] uppercase">
                Recent activity
              </h2>
              <ul className="ar-bevel divide-ar-line rounded-ar divide-y">
                {recent.data?.map((event) => {
                  const { icon: Icon, verb } = ACTIVITY[event.type];
                  return (
                    <li key={event.id}>
                      <Link
                        href={`/bounty/${event.bounty.id}`}
                        className="flex items-center gap-3 px-3.5 py-2.5"
                      >
                        <span
                          className={
                            event.type === "win"
                              ? "border-rarity-legendary/50 bg-rarity-legendary/15 text-rarity-legendary flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] border"
                              : "border-ar-line text-ar-dim flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] border bg-white/[0.04]"
                          }
                        >
                          <Icon size={13} strokeWidth={2.3} />
                        </span>
                        <span className="text-ar-dim min-w-0 flex-1 text-[12px] leading-snug">
                          <b className="text-ar-text font-semibold">{nameOf(event.user)}</b> {verb}{" "}
                          <span className="text-ar-text">{event.bounty.title}</span>
                        </span>
                        <span className="font-hud text-ar-faint shrink-0 text-[10px] font-semibold">
                          {timeAgo(event.at)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="py-14 text-center">
      <p className="font-hud text-ar-dim text-[13px] font-bold tracking-[0.14em] uppercase">
        {title}
      </p>
      <p className="text-ar-faint mx-auto mt-1.5 max-w-[17rem] text-[12.5px] leading-relaxed">
        {body}
      </p>
    </div>
  );
}

function ErrorNote({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-ar border-ar-danger/40 bg-ar-danger/10 flex items-center justify-between gap-3 border px-3.5 py-2.5">
      <p className="text-ar-danger text-[12px]">Couldn&rsquo;t load bounties.</p>
      <button
        onClick={onRetry}
        className="font-hud text-ar-text text-[11px] font-semibold tracking-[0.1em] uppercase"
      >
        Retry
      </button>
    </div>
  );
}
