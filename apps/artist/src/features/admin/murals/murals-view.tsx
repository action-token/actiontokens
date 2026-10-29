"use client";

import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Frame,
  RotateCcw,
  UserPlus,
  X,
  Zap,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import toast, { type Toast } from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@bandcoin/ui/components/tabs";
import { cn } from "@bandcoin/ui/lib/cn";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";
import { ErrorState } from "@bandcoin/ui/patterns/error-state";
import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";
import { Avatar } from "@bandcoin/ui/patterns/person";
import { StatusPill } from "@bandcoin/ui/patterns/status-pill";
import { SearchInput } from "@bandcoin/ui/patterns/toolbar";

import { timeAgo } from "~/lib/format";
import { api } from "~/trpc/react";

import { MuralSheet } from "./mural-sheet";
import {
  REJECT_LABEL,
  VIEW_STATUS,
  messageOf,
  plural,
  type MuralRow,
  type RejectReason,
  type Status,
  type View,
} from "./model";
import { RejectDialog } from "./reject-dialog";
import { SettingsPanel } from "./settings-panel";

const VIEWS: { value: View; label: string }[] = [
  { value: "pending", label: "Waiting for review" },
  { value: "gathering", label: "Gathering finders" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "settings", label: "Settings" },
];
const COUNT_KEY: Record<Exclude<View, "settings">, Status> = VIEW_STATUS;

type Decision = "PENDING" | "APPROVED" | "REJECTED";

/**
 * Admin › Mural review. Murals come from fans scanning street art; one lands
 * here once enough different people have found it. Cards rather than rows
 * because the decision is visual (is that a mural?), so the photo leads and
 * flags call out what deserves a closer look. Decisions apply at once with an
 * Undo; rejecting always asks why because the reason decides what happens to
 * coins.
 */
export function MuralsView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get("view");
  const view: View = VIEWS.some((entry) => entry.value === raw) ? (raw as View) : "pending";
  const setView = (next: View) =>
    router.replace(next === "pending" ? pathname : `${pathname}?view=${next}`, { scroll: false });

  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);

  const counts = api.admin.murals.counts.useQuery(undefined, { refetchOnWindowFocus: false });
  const list = api.admin.murals.list.useQuery(
    { status: VIEW_STATUS[view === "settings" ? "pending" : view] },
    { enabled: view !== "settings", refetchOnWindowFocus: false },
  );

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const all = list.data?.murals ?? [];
    return query
      ? all.filter(
          (mural) =>
            mural.title.toLowerCase().includes(query) ||
            mural.artistName?.toLowerCase().includes(query),
        )
      : all;
  }, [list.data, search]);

  const utils = api.useUtils();
  const refresh = () => {
    void utils.admin.murals.list.invalidate();
    void utils.admin.murals.counts.invalidate();
    void utils.admin.murals.get.invalidate();
    void utils.admin.activity.list.invalidate();
  };
  const decide = api.admin.murals.decide.useMutation({ onSettled: refresh });

  const undoable = (message: string, undo: () => Promise<unknown>) =>
    toast(
      (t: Toast) => (
        <span className="flex items-center gap-3 text-sm">
          <CheckCircle2 className="text-success size-4 shrink-0" />
          {message}
          <button
            type="button"
            className="text-primary-text hover:bg-primary/10 ml-1 rounded px-1.5 py-0.5 font-semibold"
            onClick={() => {
              toast.dismiss(t.id);
              undo().then(
                () => toast.success("Undone"),
                (error: unknown) => toast.error(messageOf(error)),
              );
            }}
          >
            Undo
          </button>
        </span>
      ),
      { duration: 7000 },
    );

  /** Where a mural goes back to when a decision is undone. */
  const previous = (id: string): { status: Decision; reason?: RejectReason } | null => {
    const mural = list.data?.murals.find((entry) => entry.id === id);
    return mural
      ? {
          status: mural.status === "DISCOVERED" ? "PENDING" : mural.status,
          reason: mural.rejectReason ?? undefined,
        }
      : null;
  };

  const apply = (
    id: string,
    status: Decision,
    reason: RejectReason | undefined,
    message: string,
  ) => {
    const before = previous(id);
    decide.mutate(
      { muralId: id, status, reason },
      {
        onSuccess: ({ revoked }) => {
          const extra =
            revoked.coins > 0 ? ` · ${revoked.coins.toLocaleString()} coins taken back` : "";
          undoable(message + extra, async () => {
            if (before)
              await decide.mutateAsync({
                muralId: id,
                status: before.status,
                reason: before.reason,
              });
          });
        },
        onError: (error) => toast.error(messageOf(error)),
      },
    );
  };

  const actions = {
    approve: (id: string) => apply(id, "APPROVED", undefined, "Approved: it's on every map"),
    reject: (id: string) => setRejectId(id),
    moveBack: (id: string) => apply(id, "PENDING", undefined, "Moved back to review"),
  };

  const index = openId ? rows.findIndex((mural) => mural.id === openId) : -1;
  const step = (direction: 1 | -1) => setOpenId(rows[index + direction]?.id ?? null);

  return (
    <PageBody wide className="grid gap-5">
      <PageHeader
        eyebrow="Admin"
        title="Mural review"
        description="Street art fans found with the Murals camera. It lands here once enough different people have scanned it."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Tabs
          value={view}
          onValueChange={(value) => setView(value as View)}
          className="overflow-x-auto"
        >
          <TabsList>
            {VIEWS.map((entry) => (
              <TabsTrigger key={entry.value} value={entry.value}>
                {entry.label}
                {entry.value !== "settings" && counts.data && (
                  <span className="num ml-1.5 opacity-70">
                    {counts.data[COUNT_KEY[entry.value]]}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {view !== "settings" && (
          <SearchInput
            onSearch={setSearch}
            placeholder="Search title or artist"
            className="sm:ml-auto"
          />
        )}
      </div>

      {view === "settings" ? (
        <SettingsPanel />
      ) : list.isPending ? (
        <GridSkeleton />
      ) : list.isError ? (
        <ErrorState message="Couldn't load the murals." onRetry={() => void list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={view === "pending" ? CheckCircle2 : Frame}
          title={
            search
              ? "No murals match"
              : view === "pending"
                ? "All caught up"
                : view === "gathering"
                  ? "Nothing gathering"
                  : `No ${view} murals`
          }
          description={
            search
              ? "Try another title or artist."
              : view === "pending"
                ? "Murals arrive here once enough different people have scanned them."
                : view === "gathering"
                  ? "Fresh finds wait here until enough people confirm them. They can already be collected."
                  : undefined
          }
        />
      ) : (
        <>
          <p className="text-fg-muted text-sm">
            {plural(rows.length, "mural")}
            {view === "gathering" &&
              " · collectable already; approve early if it's clearly a mural"}
          </p>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {rows.map((mural) => (
              <MuralCard
                key={mural.id}
                mural={mural}
                needed={list.data.confirmationsNeeded}
                busy={decide.isPending}
                focused={mural.id === openId}
                onOpen={() => setOpenId(mural.id)}
                actions={actions}
              />
            ))}
          </ul>
        </>
      )}

      <MuralSheet
        id={openId}
        onClose={() => setOpenId(null)}
        busy={decide.isPending}
        actions={actions}
        position={index >= 0 ? { index, total: rows.length } : null}
        onStep={step}
      />

      <RejectDialog
        key={rejectId ?? "closed"}
        muralId={rejectId}
        onOpenChange={(open) => !open && setRejectId(null)}
        busy={decide.isPending}
        onConfirm={(reason) => {
          const id = rejectId;
          setRejectId(null);
          if (id) apply(id, "REJECTED", reason, `Rejected · ${REJECT_LABEL[reason]}`);
        }}
      />
    </PageBody>
  );
}

function Flags({ mural }: { mural: MuralRow }) {
  const { flags } = mural;
  const items: { icon: typeof Zap; label: string; title: string }[] = [];
  if (flags.newAccounts > 0)
    items.push({
      icon: UserPlus,
      label: flags.newAccounts === 1 ? "New account" : `${flags.newAccounts} new accounts`,
      title: "A first finder joined in the last 7 days",
    });
  if (flags.quickConfirm)
    items.push({
      icon: Zap,
      label: "Quick confirm",
      title: "Two first finders scanned within 2 minutes of each other",
    });
  if (flags.borderline)
    items.push({
      icon: AlertTriangle,
      label: "Check photos",
      title: "Vision saw a possible screen, or the art score was low",
    });
  if (flags.duplicates > 0)
    items.push({
      icon: Copy,
      label: "Possible duplicate",
      title: `${plural(flags.duplicates, "other mural")} within 50 m`,
    });
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((flag) => (
        <span key={flag.label} title={flag.title}>
          <StatusPill tone="warning" icon={flag.icon}>
            {flag.label}
          </StatusPill>
        </span>
      ))}
    </div>
  );
}

type Actions = {
  approve: (id: string) => void;
  reject: (id: string) => void;
  moveBack: (id: string) => void;
};

function MuralCard({
  mural,
  needed,
  busy,
  focused,
  onOpen,
  actions,
}: {
  mural: MuralRow;
  needed: number;
  busy: boolean;
  focused: boolean;
  onOpen: () => void;
  actions: Actions;
}) {
  const open = mural.status === "PENDING" || mural.status === "DISCOVERED";
  return (
    <li
      className={cn(
        "bg-surface flex flex-col overflow-hidden rounded-[1.4rem] border-2 transition-shadow",
        focused && "ring-primary ring-2",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="group bg-surface-2 focus-visible:ring-ring relative block aspect-[4/3] w-full overflow-hidden text-left outline-none focus-visible:ring-2"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mural.coverUrl}
          alt=""
          loading="lazy"
          className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
        <span className="absolute top-2 left-2 flex gap-1">
          {mural.status === "REJECTED" && mural.rejectReason && (
            <StatusPill tone="danger">{REJECT_LABEL[mural.rejectReason]}</StatusPill>
          )}
          {mural.status === "APPROVED" && (
            <StatusPill tone="success" dot>
              On maps
            </StatusPill>
          )}
        </span>
        <span className="absolute right-2 bottom-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">
          {Array.from({ length: needed }, (_, i) => (
            <span
              key={i}
              className={cn(
                "size-1.5 rounded-full",
                i < mural.distinctScanners ? "bg-white" : "bg-white/30",
              )}
            />
          ))}
          <span className="num ml-1">{mural.distinctScanners}</span>
        </span>
      </button>

      <div className="flex flex-1 flex-col gap-2.5 p-3">
        <button type="button" onClick={onOpen} className="min-w-0 text-left">
          <span className="block truncate font-semibold">{mural.title}</span>
          <span className="text-fg-muted block truncate text-xs">
            {mural.artistName
              ? `by ${mural.artistName} · `
              : mural.autoTitled
                ? "Not named · "
                : ""}
            {plural(mural.scanCount, "scan")} · found {timeAgo(mural.createdAt)}
          </span>
        </button>

        <div className="flex items-center gap-2">
          <span className="flex -space-x-2">
            {mural.finders.slice(0, 4).map((finder) => (
              <span key={finder.id} title={`#${finder.rank} ${finder.name}`}>
                <Avatar
                  src={finder.image}
                  name={finder.name}
                  className="ring-surface size-6 text-[11px] ring-2"
                />
              </span>
            ))}
          </span>
          <span className="text-fg-muted truncate text-xs">
            {mural.finders[0]?.name ?? "Someone"}
            {mural.finders.length > 1 && ` + ${mural.finders.length - 1}`}
          </span>
        </div>

        <Flags mural={mural} />

        <div className="mt-auto flex gap-2 pt-1">
          {open ? (
            <>
              <Button
                size="sm"
                variant="outline"
                className="text-danger hover:text-danger flex-1"
                disabled={busy}
                onClick={() => actions.reject(mural.id)}
              >
                <X /> Reject
              </Button>
              <Button
                size="sm"
                className="flex-1"
                disabled={busy}
                onClick={() => actions.approve(mural.id)}
              >
                <Check /> Approve
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              disabled={busy}
              onClick={() => actions.moveBack(mural.id)}
            >
              <RotateCcw /> Move back to review
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

function GridSkeleton() {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className="bg-surface overflow-hidden rounded-[1.4rem] border-2">
          <Skeleton className="aspect-[4/3] w-full rounded-none" />
          <div className="grid gap-2 p-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-8 w-full" />
          </div>
        </li>
      ))}
    </ul>
  );
}
