"use client";

import { format, formatDistanceToNow } from "date-fns";
import {
  ExternalLink,
  CalendarDays,
  Copy,
  Download,
  Link2,
  MapPin,
  Pencil,
  ScanLine,
  Ticket,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Marker } from "react-map-gl/mapbox";

import { abbreviateAddress } from "@actiontokens/utils/address";
import { Button } from "@actiontokens/ui/components/button";
import { Skeleton } from "@actiontokens/ui/components/skeleton";
import { DataTable, type Column } from "@actiontokens/ui/patterns/data-table";
import { EmptyState } from "@actiontokens/ui/patterns/empty-state";
import { ErrorState } from "@actiontokens/ui/patterns/error-state";
import { PageBody } from "@actiontokens/ui/patterns/page-header";
import { Person } from "@actiontokens/ui/patterns/person";
import { StatCard } from "@actiontokens/ui/patterns/stat-card";
import { StatusPill } from "@actiontokens/ui/patterns/status-pill";
import { SearchInput } from "@actiontokens/ui/patterns/toolbar";

import { BaseMap } from "~/features/pins/map-kit/base-map";
import { MAPBOX_TOKEN } from "~/features/pins/mapbox";
import { STATUS } from "~/features/pins/pins-view";
import { api, type RouterOutputs } from "~/trpc/react";

import { CollectionsChart, downloadCsv } from "./report-kit";

type Report = RouterOutputs["reports"]["pin"];
type Collector = Report["collectors"][number];

/** One pin's report: where its spots are, how it's been collected, and by whom. */
export function PinReportView({ pinId, admin = false }: { pinId: string; admin?: boolean }) {
  const options = { retry: false, refetchOnWindowFocus: false } as const;
  const own = api.reports.pin.useQuery({ pinId }, { ...options, enabled: !admin });
  const any = api.admin.reports.pin.useQuery({ pinId }, { ...options, enabled: admin });
  const report = admin ? any : own;
  return (
    <PageBody wide className="grid gap-4">
      <Link
        href={admin ? "/admin/reports" : "/reports"}
        className="text-fg-muted hover:text-fg inline-flex items-center gap-1 text-xs font-semibold tracking-wider uppercase"
      >
        ‹ Reports
      </Link>
      {report.isPending ? (
        <ReportSkeleton />
      ) : report.isError ? (
        report.error.data?.code === "NOT_FOUND" ? (
          <EmptyState icon={MapPin} title="Pin not found" description="It may have been deleted." />
        ) : (
          <ErrorState message="Couldn't load this report." onRetry={() => void report.refetch()} />
        )
      ) : (
        <Body report={report.data} admin={admin} />
      )}
    </PageBody>
  );
}

function Body({ report: r, admin }: { report: Report; admin: boolean }) {
  const [now] = useState(() => Date.now());
  const [query, setQuery] = useState("");
  const [selectedSpot, setSelectedSpot] = useState<string | null>(null);

  const status = STATUS[r.status];
  const index = useMemo(() => new Map(r.spots.map((spot, i) => [spot.id, i + 1])), [r.spots]);
  const collectors = new Set(r.collectors.map((c) => c.user.id)).size;
  const redeemed = r.collectors.filter((c) => c.isRedeemed).length;
  const total = r.spots.reduce((n, spot) => n + spot.collected, 0);

  const rows = useMemo(() => {
    const q = query.toLowerCase();
    return r.collectors.filter(
      (c) =>
        (!selectedSpot || c.spotId === selectedSpot) &&
        (!q ||
          [c.user.name, c.user.email, c.user.wallet, c.user.id].some((v) =>
            v?.toLowerCase().includes(q),
          )),
    );
  }, [r.collectors, selectedSpot, query]);

  const exportCsv = () =>
    downloadCsv(
      `${r.title.replace(/[^\w-]+/g, "-").toLowerCase()}-collectors.csv`,
      r.collectors.map((c) => {
        const spot = r.spots.find((s) => s.id === c.spotId);
        return {
          Collector: c.user.name ?? "",
          Email: c.user.email ?? "",
          Wallet: c.user.wallet ?? "",
          Spot: index.get(c.spotId) ?? "",
          Latitude: spot?.latitude ?? "",
          Longitude: spot?.longitude ?? "",
          "Collected at": new Date(c.createdAt).toISOString(),
          Redeemed: c.isRedeemed ? "yes" : "no",
        };
      }),
    );

  const columns: Column<Collector>[] = [
    {
      id: "who",
      header: "Collector",
      skeleton: "person",
      cell: (c) => (
        <Person
          name={c.user.name}
          image={c.user.image}
          id={c.user.id}
          sub={
            c.user.email ??
            (c.user.wallet ? (
              <span className="font-mono">{abbreviateAddress(c.user.wallet, 5)}</span>
            ) : undefined)
          }
        />
      ),
    },
    {
      id: "where",
      header: "Spot",
      skeleton: "short",
      cell: (c) => (
        <span className="bg-primary text-primary-foreground num flex size-5 items-center justify-center rounded-full text-[10px] font-semibold">
          {index.get(c.spotId) ?? "?"}
        </span>
      ),
    },
    {
      id: "when",
      header: "Collected",
      skeleton: "short",
      cell: (c) => (
        <span
          className="text-fg-muted whitespace-nowrap"
          title={format(new Date(c.createdAt), "PPpp")}
        >
          {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
        </span>
      ),
    },
    {
      id: "redeemed",
      header: "Reward",
      skeleton: "pill",
      cell: (c) =>
        c.isRedeemed ? (
          <StatusPill tone="success" icon={Ticket}>
            Redeemed{c.redeemedAt ? ` ${format(new Date(c.redeemedAt), "MMM d")}` : ""}
          </StatusPill>
        ) : (
          <span className="text-fg-muted">–</span>
        ),
    },
    {
      id: "wallet",
      header: "Wallet",
      skeleton: "mono",
      cell: (c) =>
        c.user.wallet ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              const wallet = c.user.wallet;
              if (wallet)
                void navigator.clipboard
                  .writeText(wallet)
                  .then(() => toast.success("Wallet copied"));
            }}
            className="text-fg-muted hover:text-fg inline-flex items-center gap-1 font-mono text-xs"
          >
            {abbreviateAddress(c.user.wallet, 5)} <Copy className="size-3" />
          </button>
        ) : (
          <span className="text-fg-muted">–</span>
        ),
    },
  ];

  const bounds =
    r.spots.length > 1
      ? ([
          Math.min(...r.spots.map((s) => s.longitude)),
          Math.min(...r.spots.map((s) => s.latitude)),
          Math.max(...r.spots.map((s) => s.longitude)),
          Math.max(...r.spots.map((s) => s.latitude)),
        ] as [number, number, number, number])
      : null;
  const first = r.spots[0];

  return (
    <>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {r.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={r.imageUrl}
            alt=""
            className="aspect-video w-full rounded-xl border object-cover sm:aspect-square sm:size-28"
          />
        ) : (
          <span className="bg-surface-2 text-fg-muted hidden size-28 shrink-0 items-center justify-center rounded-xl sm:flex">
            <MapPin className="size-8" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="display text-3xl sm:text-4xl">{r.title}</h1>
            <StatusPill tone={status.tone}>{status.label}</StatusPill>
          </div>
          <p className="text-fg-muted mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3.5" /> {format(new Date(r.startsAt), "MMM d, yyyy")} →{" "}
              {format(new Date(r.endsAt), "MMM d, yyyy")}
            </span>
            {r.link && (
              <a
                href={r.link}
                target="_blank"
                rel="noreferrer"
                className="text-primary-text inline-flex max-w-xs items-center gap-1 truncate hover:underline"
              >
                <Link2 className="size-3.5 shrink-0" /> <span className="truncate">{r.link}</span>
              </a>
            )}
          </p>
          {r.description && <p className="mt-2 line-clamp-2 max-w-3xl text-sm">{r.description}</p>}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" asChild>
            {admin ? (
              <Link href={`/admin/artists/${r.organizationId}`}>
                <ExternalLink /> View artist
              </Link>
            ) : (
              <Link href={`/pins/${r.id}`}>
                <Pencil /> Edit pin
              </Link>
            )}
          </Button>
          <Button variant="outline" onClick={exportCsv} disabled={r.collectors.length === 0}>
            <Download /> Export CSV
          </Button>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatCard
          label="Collections"
          icon={ScanLine}
          value={total.toLocaleString()}
          hint={
            r.collectors[0]
              ? `Last ${formatDistanceToNow(new Date(r.collectors[0].createdAt), { addSuffix: true })}`
              : "None yet"
          }
        />
        <StatCard
          label="Collectors"
          icon={Users}
          value={collectors.toLocaleString()}
          hint={
            total > collectors
              ? `${(total / Math.max(1, collectors)).toFixed(1)} each on average`
              : undefined
          }
        />
        <StatCard
          label="Collections left"
          icon={MapPin}
          value={
            r.claimLimit > 0
              ? `${r.claimsLeft.toLocaleString()} / ${r.claimLimit.toLocaleString()}`
              : "No limit"
          }
          hint={`${r.spots.length} spot${r.spots.length === 1 ? "" : "s"}`}
        />
        <StatCard
          label="Redeemed"
          icon={Ticket}
          value={redeemed.toLocaleString()}
          hint={total ? `${Math.round((redeemed / total) * 100)}% of collections` : undefined}
        />
      </dl>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="bg-surface overflow-hidden rounded-[1.4rem] border-2">
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            <h2 className="text-fg-muted text-[11px] font-semibold tracking-wider uppercase">
              Spots
            </h2>
            {selectedSpot && (
              <button
                type="button"
                className="text-primary-text text-xs hover:underline"
                onClick={() => setSelectedSpot(null)}
              >
                Show all collectors
              </button>
            )}
          </div>
          {first && MAPBOX_TOKEN ? (
            <div className="h-60">
              <BaseMap
                initialViewState={
                  bounds
                    ? { bounds, fitBoundsOptions: { padding: 48, maxZoom: 16 } }
                    : { latitude: first.latitude, longitude: first.longitude, zoom: 14 }
                }
                controlsPosition="top-right"
              >
                {r.spots.map((spot, i) => (
                  <Marker
                    key={spot.id}
                    latitude={spot.latitude}
                    longitude={spot.longitude}
                    anchor="center"
                    onClick={(event) => (
                      event.originalEvent.stopPropagation(),
                      setSelectedSpot(selectedSpot === spot.id ? null : spot.id)
                    )}
                  >
                    <button
                      type="button"
                      title={`Spot ${i + 1} · ${spot.collected} collected`}
                      className={
                        selectedSpot === spot.id
                          ? "bg-fg text-bg num flex h-7 min-w-7 items-center justify-center rounded-full border-2 border-white px-1.5 text-[11px] font-semibold shadow-md"
                          : "bg-primary text-primary-foreground num flex h-7 min-w-7 items-center justify-center rounded-full border-2 border-white px-1.5 text-[11px] font-semibold shadow-md"
                      }
                    >
                      {i + 1}
                    </button>
                  </Marker>
                ))}
              </BaseMap>
            </div>
          ) : (
            <p className="text-fg-muted mx-4 mb-4 rounded-lg border border-dashed py-16 text-center text-sm">
              {first ? "Add a Mapbox token to see the spots on a map." : "No spots left."}
            </p>
          )}
          {r.spots.length > 1 && (
            <ul className="flex gap-1.5 overflow-x-auto border-t px-4 py-2.5">
              {r.spots.map((spot, i) => (
                <li key={spot.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedSpot(selectedSpot === spot.id ? null : spot.id)}
                    className={
                      selectedSpot === spot.id
                        ? "border-primary bg-primary/10 inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs whitespace-nowrap"
                        : "text-fg-muted hover:text-fg inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs whitespace-nowrap"
                    }
                  >
                    <span className="font-semibold">{i + 1}</span> {spot.collected.toLocaleString()}{" "}
                    collected
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <CollectionsChart
          daily={r.daily}
          from={new Date(r.startsAt).getTime() < now ? new Date(r.startsAt) : undefined}
        />
      </div>

      <section className="mt-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="display text-2xl">Collectors</h2>
            <p className="text-fg-muted text-sm">
              {selectedSpot
                ? `Who collected spot ${index.get(selectedSpot)}.`
                : "Everyone who collected this pin, newest first."}
              {r.collectors.length >= 1000 && " Showing the latest 1,000."}
            </p>
          </div>
          <div className="sm:ml-auto">
            <SearchInput
              onSearch={(value) => setQuery(value.trim().toLowerCase())}
              placeholder="Search name, email or wallet"
            />
          </div>
        </div>
        <DataTable
          className="mt-3"
          label="Collectors"
          columns={columns}
          rows={rows}
          rowKey={(c) => c.id}
          empty={{
            icon: Users,
            title: query || selectedSpot ? "No collectors match" : "Not collected yet",
            description:
              query || selectedSpot
                ? "Try another search or show all spots."
                : "Fans who collect this pin show up here.",
          }}
        />
      </section>
    </>
  );
}

function ReportSkeleton() {
  return (
    <>
      <div className="flex gap-4">
        <Skeleton className="hidden size-28 rounded-xl sm:block" />
        <div className="grid flex-1 gap-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-80" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[98px] rounded-xl" />
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Skeleton className="h-[300px] rounded-xl" />
        <Skeleton className="h-[236px] rounded-xl" />
      </div>
    </>
  );
}
