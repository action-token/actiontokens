"use client";

import { Check, Loader2, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import toast from "react-hot-toast";

import { abbreviateAddress } from "@bandcoin/utils/address";
import { Badge } from "@bandcoin/ui/components/badge";
import { Button } from "@bandcoin/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@bandcoin/ui/components/dialog";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@bandcoin/ui/components/tabs";
import { Textarea } from "@bandcoin/ui/components/textarea";
import { ConfirmDialog } from "@bandcoin/ui/patterns/confirm-dialog";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";
import { ErrorState } from "@bandcoin/ui/patterns/error-state";
import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";
import { StatusPill, type Tone } from "@bandcoin/ui/patterns/status-pill";

import { timeAgo } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

type Row = RouterOutputs["admin"]["artists"]["list"][number];
type Filter = "PENDING" | "APPROVED" | "REJECTED" | "BANNED" | "ALL";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "PENDING", label: "Waiting" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "BANNED", label: "Banned" },
  { value: "ALL", label: "All" },
];

const STATUS: Record<Row["status"], { tone: Tone; label: string }> = {
  PENDING: { tone: "warning", label: "Waiting for review" },
  APPROVED: { tone: "success", label: "Approved" },
  REJECTED: { tone: "neutral", label: "Rejected" },
  BANNED: { tone: "danger", label: "Banned" },
};

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong.";

/** Who applied, whether they paid, and what the admin can do about it. */
export function ArtistsView() {
  const [filter, setFilter] = useState<Filter>("PENDING");
  const list = api.admin.artists.list.useQuery({ status: filter === "ALL" ? undefined : filter });

  return (
    <PageBody className="grid gap-6">
      <PageHeader
        eyebrow="Admin"
        title="Artists"
        description="Review applications. Approving opens the artist tools; rejecting sends the artist's XLM back."
      />
      <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)}>
        <TabsList>
          {FILTERS.map((entry) => (
            <TabsTrigger key={entry.value} value={entry.value}>
              {entry.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {list.isPending ? (
        <div className="grid gap-3">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
      ) : list.isError ? (
        <ErrorState message="Couldn't load artists." onRetry={() => void list.refetch()} />
      ) : list.data.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nobody here"
          description={
            filter === "PENDING"
              ? "No applications are waiting for review."
              : "No artists match this filter."
          }
        />
      ) : (
        <ul className="grid gap-3">
          {list.data.map((row) => (
            <ArtistCard key={row.id} row={row} />
          ))}
        </ul>
      )}
    </PageBody>
  );
}

function ArtistCard({ row }: { row: Row }) {
  const utils = api.useUtils();
  const [rejecting, setRejecting] = useState(false);
  const [banning, setBanning] = useState(false);
  const done = (message: string) => {
    toast.success(message);
    void utils.admin.artists.list.invalidate();
    void utils.admin.activity.list.invalidate();
  };
  const approve = api.admin.artists.approve.useMutation({
    onSuccess: () => done(`${row.name} is approved`),
    onError: (error) => toast.error(messageOf(error)),
  });
  const ban = api.admin.artists.ban.useMutation({
    onSuccess: () => {
      setBanning(false);
      done(`${row.name} is banned`);
    },
    onError: (error) => toast.error(messageOf(error)),
  });
  const status = STATUS[row.status];

  return (
    <li className="bg-surface grid gap-3 rounded-xl border p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="display text-lg">{row.name}</h2>
          <p className="text-fg-muted text-sm">
            bandcoin.io/{row.slug} · by{" "}
            <Link
              href={`/admin/users/${row.owner.id}`}
              className="underline-offset-4 hover:underline"
            >
              {row.owner.name ?? abbreviateAddress(row.owner.walletAddress ?? undefined)}
            </Link>{" "}
            · applied {timeAgo(row.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={status.tone}>{status.label}</StatusPill>
          {row.paid ? (
            <Badge variant="secondary" className="gap-1">
              <Check className="size-3" /> Paid 1.5 XLM
            </Badge>
          ) : (
            row.status === "PENDING" && <Badge variant="outline">Hasn&apos;t paid yet</Badge>
          )}
        </div>
      </div>

      {row.bio && <p className="text-sm">{row.bio}</p>}
      {row.rejectionReason && (
        <p className="text-fg-muted text-sm">
          <b>Reason given:</b> {row.rejectionReason}
        </p>
      )}
      {row.issuer && (
        <p className="text-fg-faint font-mono text-xs">
          Account {abbreviateAddress(row.issuer, 8)}
        </p>
      )}

      {(row.status === "PENDING" || row.status === "APPROVED") && (
        <div className="flex flex-wrap gap-2 border-t pt-3">
          {row.status === "PENDING" && (
            <>
              <Button
                size="sm"
                disabled={!row.paid || approve.isPending}
                onClick={() => approve.mutate({ artistId: row.id })}
              >
                {approve.isPending && <Loader2 className="animate-spin" />}
                Approve
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setRejecting(true)}>
                Reject
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost" onClick={() => setBanning(true)}>
            Ban
          </Button>
        </div>
      )}

      <RejectDialog
        row={row}
        open={rejecting}
        onOpenChange={setRejecting}
        onDone={() => done(`${row.name} was rejected`)}
      />
      <ConfirmDialog
        open={banning}
        onOpenChange={setBanning}
        title={`Ban ${row.name}?`}
        description="Their artist tools stop working and they won't be shown on Bandcoin. Nothing is refunded."
        confirmLabel="Ban"
        busy={ban.isPending}
        onConfirm={() => ban.mutate({ artistId: row.id })}
      />
    </li>
  );
}

function RejectDialog({
  row,
  open,
  onOpenChange,
  onDone,
}: {
  row: Row;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const reject = api.admin.artists.reject.useMutation({
    onSuccess: () => {
      onOpenChange(false);
      setReason("");
      onDone();
    },
    onError: (error) => toast.error(messageOf(error)),
  });
  return (
    <Dialog open={open} onOpenChange={(next) => !reject.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reject {row.name}?</DialogTitle>
          <DialogDescription>
            {row.paid
              ? "Their 1.5 XLM goes back to their wallet (less the network fee). "
              : "They hadn't paid, so nothing is sent. "}
            They see your reason and can apply again.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={reason}
          maxLength={300}
          rows={3}
          placeholder="Why? For example: use your real artist name"
          onChange={(event) => setReason(event.target.value)}
        />
        <DialogFooter>
          <Button variant="ghost" disabled={reject.isPending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={reason.trim().length < 3 || reject.isPending}
            onClick={() => reject.mutate({ artistId: row.id, reason })}
          >
            {reject.isPending && <Loader2 className="animate-spin" />}
            Reject
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
