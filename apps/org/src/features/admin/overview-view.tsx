"use client";

import {
  Aperture,
  BellRing,
  CircleSlash,
  Coins,
  Frame,
  Globe,
  History,
  Hourglass,
  type LucideIcon,
  MapPinned,
  Mic2,
  Package,
  ShoppingBag,
  Users,
  Wallet,
  Workflow,
} from "lucide-react";
import Link from "next/link";

import { Skeleton } from "@actiontokens/ui/components/skeleton";
import { cn } from "@actiontokens/ui/lib/cn";
import { ErrorState } from "@actiontokens/ui/patterns/error-state";
import { PageBody, PageHeader } from "@actiontokens/ui/patterns/page-header";
import { StatCard } from "@actiontokens/ui/patterns/stat-card";

import { api, type RouterOutputs } from "~/trpc/react";

type Overview = RouterOutputs["admin"]["overview"];
type Tile<Key extends string> = {
  key: Key;
  label: string;
  hint: string;
  href: string;
  icon: LucideIcon;
};

const ATTENTION: Tile<keyof Overview["attention"]>[] = [
  {
    key: "artistsWaiting",
    label: "Artists waiting",
    hint: "Applied, not approved yet",
    href: "/admin/artists",
    icon: Mic2,
  },
  {
    key: "pinsToReview",
    label: "Pins to review",
    hint: "New pins wait for approval",
    href: "/admin/pins",
    icon: MapPinned,
  },
  {
    key: "muralsToReview",
    label: "Murals to review",
    hint: "Sent in for approval",
    href: "/admin/murals",
    icon: Frame,
  },
  {
    key: "openAlerts",
    label: "Open alerts",
    hint: "Not marked reviewed",
    href: "/admin/alerts",
    icon: BellRing,
  },
  {
    key: "stuckPayments",
    label: "Stuck payments",
    hint: "Still waiting for the network",
    href: "/admin/alerts",
    icon: Hourglass,
  },
  {
    key: "failedPaymentsToday",
    label: "Failed payments",
    hint: "In the last 24 hours",
    href: "/admin/activity",
    icon: CircleSlash,
  },
  {
    key: "failedJobsToday",
    label: "Failed jobs",
    hint: "In the last 24 hours",
    href: "/admin/jobs",
    icon: Workflow,
  },
  {
    key: "brokenDomains",
    label: "Broken domains",
    hint: "Custom domains that stopped working",
    href: "/admin/domains",
    icon: Globe,
  },
];

const TOTALS: Tile<keyof Overview["totals"]>[] = [
  { key: "users", label: "Users", hint: "Everyone signed up", href: "/admin/users", icon: Users },
  { key: "artists", label: "Artists", hint: "Approved", href: "/admin/artists", icon: Mic2 },
  { key: "items", label: "Items", hint: "Not deleted", href: "/admin/items", icon: Package },
  {
    key: "salesThisWeek",
    label: "Sales this week",
    hint: "Items sold in the last 7 days",
    href: "/admin/activity",
    icon: ShoppingBag,
  },
  {
    key: "liveStories",
    label: "Live stories",
    hint: "Up right now",
    href: "/admin/stories",
    icon: Aperture,
  },
];

const count = (value: number) => value.toLocaleString("en-US");

/** Admin › Overview: what needs a look, each number linking to its page, and a few totals. */
export function OverviewView() {
  const overview = api.admin.overview.useQuery();

  return (
    <PageBody className="grid gap-6">
      <PageHeader
        title="Overview"
        description="What needs a look right now. Each number opens its page."
      />
      {overview.isError ? (
        <ErrorState message="Couldn't load the overview." onRetry={() => void overview.refetch()} />
      ) : (
        <>
          <TileGroup
            title="Needs attention"
            tiles={ATTENTION}
            values={overview.data?.attention}
            hintFor={(tile) =>
              tile.key === "stuckPayments" && overview.data
                ? `Waiting for the network over ${overview.data.stuckMinutes} minutes`
                : tile.hint
            }
            highlight
          />
          <TileGroup title="Totals" tiles={TOTALS} values={overview.data?.totals} />
        </>
      )}
    </PageBody>
  );
}

function TileGroup<Key extends string>({
  title,
  tiles,
  values,
  hintFor,
  highlight,
}: {
  title: string;
  tiles: Tile<Key>[];
  values: Record<Key, number> | undefined;
  hintFor?: (tile: Tile<Key>) => string;
  /** A number above zero stands out; a zero is muted */
  highlight?: boolean;
}) {
  return (
    <section className="grid gap-3" aria-label={title}>
      <h2 className="eyebrow">{title}</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => {
          const value = values?.[tile.key];
          const quiet = highlight && value === 0;
          return (
            <Link
              key={tile.key}
              href={tile.href}
              className="focus-visible:ring-primary-text/40 rounded-xl outline-none focus-visible:ring-[3px]"
            >
              <StatCard
                icon={tile.icon}
                label={tile.label}
                value={
                  value === undefined ? (
                    <Skeleton className="h-8 w-12" />
                  ) : (
                    <span className={cn(quiet && "text-muted-foreground")}>{count(value)}</span>
                  )
                }
                hint={hintFor ? hintFor(tile) : tile.hint}
                active={highlight && value !== undefined && value > 0}
                className="hover:border-line-bright h-full"
              />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
