"use client";

import { Activity, FileText, Trophy, UserPlus, Zap } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { cn } from "@bandcoin/ui/lib/cn";

import { Money } from "~/components/money";
import { timeAgo } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

type ActivityRow = RouterOutputs["bounty"]["recent"][number];

/** The right panel on the bounties list. */
export function BountiesPanel() {
  return (
    <div className="grid content-start gap-7">
      <TopBounties />
      <RecentActivity />
    </div>
  );
}

function Panel({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Zap;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-2">
      <h2 className="display flex items-center gap-2 text-base">
        <Icon className="text-primary-text size-4" /> {title}
      </h2>
      <div className="grid gap-1">{children}</div>
    </section>
  );
}

function TopBounties() {
  const top = api.bounty.top.useQuery(undefined, { staleTime: 60_000 });
  return (
    <Panel icon={Zap} title="Top bounties">
      {top.isPending ? (
        <PanelSkeleton />
      ) : !top.data?.length ? (
        <p className="text-fg-muted py-4 text-center text-xs">No bounties yet</p>
      ) : (
        top.data.map((bounty, index) => (
          <Link
            key={bounty.id}
            href={`/bounty/${bounty.id}`}
            className="hover:bg-surface-2 flex items-center gap-3 rounded-lg p-2 transition-colors"
          >
            <span
              className={cn(
                "marker w-6 shrink-0 text-lg",
                index === 0 ? "text-primary-text" : "text-fg-faint",
              )}
            >
              #{index + 1}
            </span>
            <span className="min-w-0 flex-1">
              <b className="block truncate text-[13px] font-semibold">{bounty.title}</b>
              <Money
                amount={bounty.prize.amount}
                currency={bounty.prize.currency}
                code={bounty.prize.code}
                short
                className="text-fg-muted text-xs"
              />
            </span>
          </Link>
        ))
      )}
    </Panel>
  );
}

const ACTIVITY: Record<ActivityRow["type"], { icon: typeof Trophy; verb: string; tone: string }> = {
  win: { icon: Trophy, verb: "won", tone: "bg-primary text-primary-foreground" },
  submit: { icon: FileText, verb: "submitted on", tone: "bg-surface-3 text-fg" },
  join: { icon: UserPlus, verb: "joined", tone: "bg-surface-2 text-fg-muted" },
};

function RecentActivity() {
  const recent = api.bounty.recent.useQuery(undefined, { staleTime: 30_000 });
  return (
    <Panel icon={Activity} title="Recent activity">
      {recent.isPending ? (
        <PanelSkeleton />
      ) : !recent.data?.length ? (
        <p className="text-fg-muted py-4 text-center text-xs">No recent activity</p>
      ) : (
        recent.data.map((row) => {
          const kind = ACTIVITY[row.type];
          return (
            <div key={row.id} className="flex items-start gap-3 rounded-lg p-2">
              <span
                className={cn(
                  "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full",
                  kind.tone,
                )}
              >
                <kind.icon className="size-3.5" />
              </span>
              <span className="grid min-w-0 gap-0.5 text-xs">
                <span>
                  <b className="font-semibold">
                    {row.user.displayName ?? row.user.username ?? "Someone"}
                  </b>{" "}
                  <span className="text-fg-muted">{kind.verb}</span>
                </span>
                <Link
                  href={`/bounty/${row.bounty.id}`}
                  className="line-clamp-2 font-medium hover:underline"
                >
                  {row.bounty.title}
                </Link>
                <span className="text-fg-faint text-[11px]">{timeAgo(row.at)}</span>
              </span>
            </div>
          );
        })
      )}
    </Panel>
  );
}

function PanelSkeleton() {
  return (
    <div className="grid gap-2 p-2">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}
