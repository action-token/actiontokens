"use client";

import { formatDistanceToNow } from "date-fns";
import {
  Download,
  ExternalLink,
  Loader2,
  MapPin,
  ScanLine,
  Ticket,
  TrendingUp,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import toast from "react-hot-toast";

import { abbreviateAddress } from "@bandcoin/utils/address";
import { Button } from "@bandcoin/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@bandcoin/ui/components/select";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { Switch } from "@bandcoin/ui/components/switch";
import { cn } from "@bandcoin/ui/lib/cn";
import { DataTable, type Column } from "@bandcoin/ui/patterns/data-table";
import { ErrorState } from "@bandcoin/ui/patterns/error-state";
import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";
import { Person } from "@bandcoin/ui/patterns/person";
import { StatCard } from "@bandcoin/ui/patterns/stat-card";
import { StatusPill } from "@bandcoin/ui/patterns/status-pill";
import { SearchInput } from "@bandcoin/ui/patterns/toolbar";

import { STATUS } from "~/features/pins/pins-view";
import { api, type RouterOutputs } from "~/trpc/react";

import {
  CollectionsChart,
  Delta,
  PeriodPicker,
  downloadCsv,
  periodLabel,
  periodRange,
  type Period,
} from "./report-kit";

type Summary = RouterOutputs["reports"]["summary"];
type PinRow = Summary["pins"][number];

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong.";

const EVERYONE = "__all";

/**
 * Reports: how pins are collected, by whom, where and when. An artist sees
 * their own; `admin` reads every artist's (or one picked) from the admin routes.
 */
export function CollectionReportView({ admin = false }: { admin?: boolean }) {
  const [period, setPeriod] = useState<Period>(() => periodRange("30d"));
  const [query, setQuery] = useState("");
  const [onlyCollected, setOnlyCollected] = useState(false);
  const [artistId, setArtistId] = useState(EVERYONE);
  const scope = { from: period.from, to: period.to };
  const adminScope = { ...scope, artistId: artistId === EVERYONE ? undefined : artistId };

  const options = { refetchOnWindowFocus: false, placeholderData: <T,>(previous: T) => previous };
  const own = api.reports.summary.useQuery(scope, { ...options, enabled: !admin });
  const all = api.admin.reports.summary.useQuery(adminScope, { ...options, enabled: admin });
  const report = admin ? all : own;
  const artists = api.admin.artists.list.useQuery(
    {},
    { enabled: admin, refetchOnWindowFocus: false },
  );
  const exportOwn = api.reports.exportCollections.useMutation();
  const exportAll = api.admin.reports.exportCollections.useMutation();
  const exporting = admin ? exportAll : exportOwn;
  const reportHref = (pinId: string) => (admin ? `/admin/reports/${pinId}` : `/reports/${pinId}`);

  const data = report.data;
  const loading = report.isPending;
  const refetching = report.isFetching && !report.isPending;

  const pins = useMemo(
    () =>
      (data?.pins ?? [])
        .filter(
          (pin) =>
            (!onlyCollected || pin.collected > 0) &&
            (!query ||
              pin.title.toLowerCase().includes(query) ||
              (admin && pin.artist.name.toLowerCase().includes(query))),
        )
        .sort(
          (a, b) => b.collected - a.collected || +new Date(b.createdAt) - +new Date(a.createdAt),
        ),
    [data, onlyCollected, query, admin],
  );
  const top = useMemo(
    () =>
      [...(data?.pins ?? [])]
        .filter((pin) => pin.collected > 0)
        .sort((a, b) => b.collected - a.collected)
        .slice(0, 5),
    [data],
  );
  const activePins = data?.pins.filter((pin) => pin.collected > 0).length ?? 0;

  const exportCsv = async () => {
    try {
      const rows = admin
        ? await exportAll.mutateAsync(adminScope)
        : await exportOwn.mutateAsync(scope);
      if (rows.length === 0) return toast("Nothing to export for this period");
      downloadCsv(
        `bandcoin-collections-${new Date().toISOString().slice(0, 10)}.csv`,
        rows.map((row) => ({
          ...(admin ? { Artist: row.artist } : {}),
          Pin: row.pin,
          "Pin ID": row.pinId,
          Latitude: row.lat,
          Longitude: row.lng,
          Collector: row.name ?? "",
          Email: row.email ?? "",
          Wallet: row.wallet ?? "",
          "Collected at": new Date(row.collectedAt).toISOString(),
          Redeemed: row.redeemed ? "yes" : "no",
        })),
      );
      toast.success(`Exported ${rows.length.toLocaleString()} collections`);
    } catch (error) {
      toast.error(messageOf(error));
    }
  };

  const columns: Column<PinRow>[] = [
    {
      id: "pin",
      header: "Pin",
      skeleton: "image",
      cell: (pin) => (
        <div className="flex min-w-0 items-center gap-3">
          {pin.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={pin.imageUrl}
              alt=""
              loading="lazy"
              className="size-10 shrink-0 rounded-lg border object-cover"
            />
          ) : (
            <span className="bg-surface-2 text-fg-muted flex size-10 shrink-0 items-center justify-center rounded-lg">
              <MapPin className="size-4" />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{pin.title}</p>
            <p className="text-fg-muted truncate text-xs">
              {admin && `${pin.artist.name} · `}
              {pin.spots.toLocaleString()} spot{pin.spots === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      skeleton: "pill",
      cell: (pin) => (
        <StatusPill tone={STATUS[pin.status].tone}>{STATUS[pin.status].label}</StatusPill>
      ),
    },
    {
      id: "collected",
      header: "Collected",
      align: "right",
      skeleton: "number",
      cell: (pin) => (
        <span className={cn("num", pin.collected ? "font-semibold" : "text-fg-muted")}>
          {pin.collected.toLocaleString()}
        </span>
      ),
    },
    {
      id: "collectors",
      header: "Collectors",
      align: "right",
      skeleton: "number",
      cell: (pin) => <span className="text-fg-muted num">{pin.collectors.toLocaleString()}</span>,
    },
    {
      id: "left",
      header: "Left",
      align: "right",
      skeleton: "number",
      mobileLabel: "Collections left",
      cell: (pin) => (
        <span className="text-fg-muted num">
          {pin.claimLimit > 0
            ? `${pin.claimsLeft.toLocaleString()} / ${pin.claimLimit.toLocaleString()}`
            : "No limit"}
        </span>
      ),
    },
    {
      id: "last",
      header: "Last collected",
      skeleton: "short",
      cell: (pin) => (
        <span className="text-fg-muted whitespace-nowrap">
          {pin.lastCollected
            ? formatDistanceToNow(new Date(pin.lastCollected), { addSuffix: true })
            : "–"}
        </span>
      ),
    },
  ];

  return (
    <PageBody wide className="grid gap-4">
      <PageHeader
        eyebrow={admin ? "Admin" : "Drops"}
        title={admin ? "Collection reports" : "Pin reports"}
        description={
          admin
            ? "How every artist's pins are collected: by whom, where and when."
            : "How your pins are collected: by whom, where and when."
        }
        actions={
          <Button
            variant="outline"
            onClick={() => void exportCsv()}
            disabled={exporting.isPending || loading}
          >
            {exporting.isPending ? <Loader2 className="animate-spin" /> : <Download />} Export CSV
          </Button>
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <PeriodPicker value={period} onChange={setPeriod} />
        {admin && (
          <Select value={artistId} onValueChange={setArtistId}>
            <SelectTrigger className="w-full lg:w-60" aria-label="Artist">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={EVERYONE}>Every artist</SelectItem>
              {artists.data
                ?.filter((artist) => artist.pins > 0)
                .map((artist) => (
                  <SelectItem key={artist.id} value={artist.id}>
                    {artist.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        )}
        {refetching && (
          <Loader2 className="text-fg-muted size-4 animate-spin" aria-label="Updating" />
        )}
      </div>

      {report.isError ? (
        <ErrorState message="Couldn't load the report." onRetry={() => void report.refetch()} />
      ) : (
        <div className={cn("grid gap-3 transition-opacity", refetching && "opacity-60")}>
          <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {loading || !data ? (
              Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-[98px] rounded-xl" />
              ))
            ) : (
              <>
                <StatCard
                  label="Collections"
                  icon={ScanLine}
                  value={data.totals.collections.toLocaleString()}
                  hint={<Delta now={data.totals.collections} before={data.previous?.collections} />}
                />
                <StatCard
                  label="Collectors"
                  icon={Users}
                  value={data.totals.collectors.toLocaleString()}
                  hint={<Delta now={data.totals.collectors} before={data.previous?.collectors} />}
                />
                <StatCard
                  label="Pins collected"
                  icon={MapPin}
                  value={`${activePins} / ${data.pins.length}`}
                  hint={`pins with a collection in ${periodLabel(period)}`}
                />
                <StatCard
                  label="Redeemed"
                  icon={Ticket}
                  value={data.totals.redeemed.toLocaleString()}
                  hint={
                    data.totals.collections
                      ? `${Math.round((data.totals.redeemed / data.totals.collections) * 100)}% of collections`
                      : "rewards claimed"
                  }
                />
              </>
            )}
          </dl>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            {loading || !data ? (
              <Skeleton className="h-[236px] rounded-xl" />
            ) : (
              <CollectionsChart daily={data.daily} from={period.from} to={period.to} />
            )}
            <Leaders
              title="Top collectors"
              icon={Users}
              loading={loading}
              empty="Nobody collected a pin in this period."
            >
              {data?.collectors.map((collector, i) => (
                <li key={collector.id} className="flex items-center gap-3 py-2">
                  <span className="text-fg-muted num w-4 text-xs">{i + 1}</span>
                  <Person
                    name={collector.name}
                    image={collector.image}
                    id={collector.wallet ?? collector.id}
                    size="sm"
                    sub={
                      collector.wallet ? (
                        <span className="font-mono">{abbreviateAddress(collector.wallet, 4)}</span>
                      ) : undefined
                    }
                  />
                  <span className="num ml-auto text-sm font-semibold">
                    {collector.n.toLocaleString()}
                  </span>
                </li>
              ))}
            </Leaders>
          </div>

          {top.length > 0 && (
            <Leaders title="Most collected pins" icon={TrendingUp} loading={false} empty="">
              {top.map((pin) => (
                <li key={pin.id}>
                  <Link href={reportHref(pin.id)} className="group flex items-center gap-3 py-2">
                    {pin.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={pin.imageUrl}
                        alt=""
                        className="size-8 shrink-0 rounded-md object-cover"
                      />
                    ) : (
                      <span className="bg-surface-2 flex size-8 shrink-0 items-center justify-center rounded-md">
                        <MapPin className="text-fg-muted size-3.5" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium group-hover:underline">
                        {pin.title}
                      </p>
                      <div className="bg-surface-2 mt-1 h-1.5 overflow-hidden rounded-full">
                        <div
                          className="bg-primary h-full rounded-full"
                          style={{ width: `${(pin.collected / (top[0]?.collected ?? 1)) * 100}%` }}
                        />
                      </div>
                    </div>
                    <span className="num w-12 text-right text-sm font-semibold">
                      {pin.collected.toLocaleString()}
                    </span>
                  </Link>
                </li>
              ))}
            </Leaders>
          )}

          <section className="mt-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div>
                <h2 className="display text-lg">All pins</h2>
                <p className="text-fg-muted text-sm">
                  Numbers are for {periodLabel(period)}. Open a pin for its map and collectors.
                </p>
              </div>
              <div className="flex items-center gap-2 sm:ml-auto">
                <label className="bg-surface flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm">
                  <Switch
                    checked={onlyCollected}
                    onCheckedChange={setOnlyCollected}
                    aria-label="Only pins with collections"
                  />
                  <span className="hidden sm:inline">Only collected</span>
                </label>
                <SearchInput
                  onSearch={(value) => setQuery(value.trim().toLowerCase())}
                  placeholder="Search pins"
                />
              </div>
            </div>
            <DataTable
              className="mt-3"
              label="Pins"
              columns={columns}
              rows={loading ? undefined : pins}
              rowKey={(pin) => pin.id}
              loading={loading}
              skeletonRows={6}
              rowHref={(pin) => reportHref(pin.id)}
              actions={(pin) => [
                { label: "Open report", icon: ExternalLink, href: reportHref(pin.id) },
              ]}
              empty={{
                icon: MapPin,
                title: query || onlyCollected ? "No pins match" : "No pins yet",
                description:
                  query || onlyCollected
                    ? "Try another search or show all pins."
                    : "Pins you drop show up here with their numbers.",
              }}
            />
          </section>
        </div>
      )}
    </PageBody>
  );
}

function Leaders({
  title,
  icon: Icon,
  loading,
  empty,
  children,
}: {
  title: string;
  icon: typeof Users;
  loading: boolean;
  empty: string;
  children: ReactNode;
}) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  return (
    <section className="bg-surface rounded-[1.4rem] border-2 p-4">
      <h2 className="text-fg-muted flex items-center gap-1.5 text-[11px] font-semibold tracking-wider uppercase">
        <Icon className="size-3.5" /> {title}
      </h2>
      {loading ? (
        <div className="mt-3 grid gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-8 rounded-full" />
              <Skeleton className="h-3.5 flex-1" />
              <Skeleton className="h-3.5 w-8" />
            </div>
          ))}
        </div>
      ) : items.length > 0 ? (
        <ol className="mt-1 divide-y">{children}</ol>
      ) : (
        <p className="text-fg-muted mt-3 rounded-lg border border-dashed px-3 py-8 text-center text-sm">
          {empty}
        </p>
      )}
    </section>
  );
}
