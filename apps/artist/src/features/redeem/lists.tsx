"use client";

import { keepPreviousData } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { CheckCircle2, ChevronDown, Ticket, Users } from "lucide-react";
import { useState } from "react";

import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { cn } from "@bandcoin/ui/lib/cn";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";
import { ErrorState } from "@bandcoin/ui/patterns/error-state";
import { StatusPill } from "@bandcoin/ui/patterns/status-pill";
import { SearchInput } from "@bandcoin/ui/patterns/toolbar";

import { api, type RouterOutputs } from "~/trpc/react";

import { FanAvatar, Info, LoadMore, PlaceLabel, TypeIcon, plural } from "./parts";

type Reward = RouterOutputs["redeem"]["rewards"]["items"][number];
type Redeemed = RouterOutputs["redeem"]["history"]["items"][number];

const range = (start: Date | string, end: Date | string) =>
  `${format(new Date(start), "MMM d")} – ${format(new Date(end), "MMM d, yyyy")}`;

function ListSkeleton() {
  return (
    <div className="grid gap-2">
      {Array.from({ length: 3 }, (_, i) => (
        <Skeleton key={i} className="h-[76px] rounded-xl" />
      ))}
    </div>
  );
}

/** Each pin, how many fans collected and redeemed it, and who is still waiting. */
export function RewardsTab() {
  const [search, setSearch] = useState("");
  const list = api.redeem.rewards.useInfiniteQuery(
    { search: search || undefined, limit: 10 },
    { getNextPageParam: (last) => last.nextCursor, placeholderData: keepPreviousData },
  );
  const rewards = list.data?.pages.flatMap((page) => page.items) ?? [];
  const total = list.data?.pages[0]?.total;

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3">
        <SearchInput
          onSearch={setSearch}
          placeholder="Search rewards by title"
          className="sm:w-full"
        />
        {total !== undefined && (
          <span className="text-fg-muted text-xs whitespace-nowrap">{plural(total, "result")}</span>
        )}
      </div>
      {list.isPending ? (
        <ListSkeleton />
      ) : list.isError ? (
        <ErrorState message="Couldn't load your rewards." onRetry={() => void list.refetch()} />
      ) : rewards.length === 0 ? (
        <EmptyState
          icon={Ticket}
          title={search ? "No matches" : "No rewards yet"}
          description={
            search
              ? `Nothing called “${search}”.`
              : "Pins give fans a code to redeem with you. Drop one to get started."
          }
        />
      ) : (
        <>
          <ul className="grid gap-2">
            {rewards.map((reward) => (
              <RewardRow key={reward.id} reward={reward} />
            ))}
          </ul>
          <LoadMore query={list} />
        </>
      )}
    </div>
  );
}

function RewardRow({ reward }: { reward: Reward }) {
  const [open, setOpen] = useState(false);
  const waiting = reward.collected - reward.redeemed;
  const percent = reward.collected ? Math.round((reward.redeemed / reward.collected) * 100) : 0;

  return (
    <li className="bg-surface overflow-hidden rounded-[1.4rem] border-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-3 text-left sm:p-4"
      >
        {reward.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={reward.imageUrl} alt="" className="size-12 shrink-0 rounded-lg object-cover" />
        ) : (
          <TypeIcon type={reward.type} className="size-12 rounded-lg" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{reward.title}</p>
          <div className="mt-1.5 flex items-center gap-3">
            <div
              className="bg-surface-2 h-1.5 max-w-48 flex-1 overflow-hidden rounded-full"
              aria-hidden
            >
              <div className="bg-primary h-full rounded-full" style={{ width: `${percent}%` }} />
            </div>
            <span className="text-fg-muted num text-xs">
              {reward.redeemed}/{reward.collected} redeemed
            </span>
          </div>
        </div>
        <div className="hidden shrink-0 gap-4 text-right sm:flex">
          <Stat label="Collected" value={reward.collected} />
          <Stat label="Waiting" value={waiting} highlight={waiting > 0} />
          <Stat label="Limit" value={reward.claimLimit} />
        </div>
        <ChevronDown
          className={cn("text-fg-muted size-4 shrink-0 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="bg-surface-2 border-t p-3 sm:p-4">
          <p className="text-fg-muted mb-2 text-xs">
            {range(reward.startsAt, reward.endsAt)} · {plural(reward.spots, "spot")} ·{" "}
            {plural(reward.collected, "fan")} collected
          </p>
          {reward.fans.length === 0 ? (
            <p className="text-fg-muted py-4 text-center text-sm">Nobody has collected this yet.</p>
          ) : (
            <ul className="bg-surface divide-y rounded-lg border">
              {reward.fans.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <FanAvatar fan={entry.fan} className="size-8" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {entry.fan.name ?? entry.fan.email ?? "Fan"}
                    </span>
                    <span className="text-fg-muted text-xs">
                      Collected{" "}
                      {formatDistanceToNow(new Date(entry.collectedAt), { addSuffix: true })}
                    </span>
                  </span>
                  {entry.isRedeemed ? (
                    <StatusPill tone="success" icon={CheckCircle2}>
                      Redeemed
                    </StatusPill>
                  ) : (
                    <StatusPill tone="warning">Waiting</StatusPill>
                  )}
                </li>
              ))}
            </ul>
          )}
          {reward.collected > reward.fans.length && (
            <p className="text-fg-muted mt-2 text-center text-xs">
              Showing the latest {reward.fans.length}. Use the code checker for anyone else.
            </p>
          )}
        </div>
      )}
    </li>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div>
      <p className={cn("display num text-2xl", highlight && "text-warning")}>
        {value.toLocaleString()}
      </p>
      <p className="text-fg-muted text-[11px]">{label}</p>
    </div>
  );
}

/** Everything you've redeemed, newest first. */
export function HistoryTab() {
  const [search, setSearch] = useState("");
  const list = api.redeem.history.useInfiniteQuery(
    { search: search || undefined, limit: 20 },
    { getNextPageParam: (last) => last.nextCursor, placeholderData: keepPreviousData },
  );
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const total = list.data?.pages[0]?.total;

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3">
        <SearchInput
          onSearch={setSearch}
          placeholder="Search by fan, email, code or reward"
          className="sm:w-full"
        />
        {total !== undefined && (
          <span className="text-fg-muted text-xs whitespace-nowrap">{plural(total, "result")}</span>
        )}
      </div>
      {list.isPending ? (
        <ListSkeleton />
      ) : list.isError ? (
        <ErrorState message="Couldn't load the history." onRetry={() => void list.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Users}
          title={search ? "No matches" : "No redemptions yet"}
          description={search ? "Try another search." : "Codes you redeem show up here."}
        />
      ) : (
        <>
          <ul className="bg-surface divide-y overflow-hidden rounded-[1.4rem] border-2">
            {items.map((item) => (
              <HistoryRow key={item.id} item={item} />
            ))}
          </ul>
          <LoadMore query={list} />
        </>
      )}
    </div>
  );
}

function HistoryRow({ item }: { item: Redeemed }) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="hover:bg-surface-2 flex w-full items-center gap-3 px-3 py-2.5 text-left sm:px-4"
      >
        <FanAvatar fan={item.fan} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {item.fan.name ?? item.fan.email ?? "Fan"}
          </span>
          <span className="text-fg-muted block truncate text-xs">{item.pin.title}</span>
        </span>
        <span className="text-fg-muted hidden font-mono text-xs tracking-widest sm:block">
          {item.code}
        </span>
        <span className="text-fg-muted shrink-0 text-right text-xs">
          {item.redeemedAt ? format(new Date(item.redeemedAt), "MMM d, HH:mm") : "–"}
        </span>
        <ChevronDown
          className={cn("text-fg-muted size-4 shrink-0 transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <dl className="bg-surface-2 grid gap-3 border-t px-4 py-3 text-sm sm:grid-cols-4">
          <Info label="Code">
            <span className="font-mono tracking-widest">{item.code}</span>
          </Info>
          <Info label="Email">{item.fan.email ?? "–"}</Info>
          <Info label="Collected">{format(new Date(item.collectedAt), "PPp")}</Info>
          <Info label="Redeemed">
            {item.redeemedAt ? format(new Date(item.redeemedAt), "PPp") : "–"}
          </Info>
          <div className="sm:col-span-4">
            <dt className="text-fg-muted text-xs">Spot</dt>
            <dd className="text-fg-muted">
              <PlaceLabel latitude={item.latitude} longitude={item.longitude} />
            </dd>
          </div>
        </dl>
      )}
    </li>
  );
}
