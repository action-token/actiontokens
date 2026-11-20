"use client";

import {
  BellRing,
  CheckCircle2,
  Hourglass,
  KeyRound,
  Loader2,
  MapPinned,
  ReceiptText,
  TriangleAlert,
  type LucideIcon,
  Coins,
  Globe,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import toast from "react-hot-toast";

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
import { Textarea } from "@bandcoin/ui/components/textarea";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";
import { ErrorState } from "@bandcoin/ui/patterns/error-state";
import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";
import { Avatar } from "@bandcoin/ui/patterns/person";
import { FilterChips } from "@bandcoin/ui/patterns/toolbar";

import { timeAgo } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

import { messageOf } from "./murals/model";

type Alert = RouterOutputs["admin"]["alerts"]["list"]["alerts"][number];
type Rules = RouterOutputs["admin"]["alerts"]["list"]["rules"];

const KIND: Record<
  Alert["kind"],
  { icon: LucideIcon; tone: string; rule: (rules: Rules) => string }
> = {
  failedPayments: {
    icon: ReceiptText,
    tone: "bg-danger-soft text-danger",
    rule: (rules) => `${rules.failedPayments}+ failed payments by one person in 24 h`,
  },
  signInFailures: {
    icon: KeyRound,
    tone: "bg-danger-soft text-danger",
    rule: (rules) => `${rules.signInFailures}+ failed sign-ins from one IP in 1 h`,
  },
  fastClaims: {
    icon: MapPinned,
    tone: "bg-warning/12 text-warning",
    rule: (rules) => `Claims further apart than ${rules.claimSpeedKmh} km/h allows`,
  },
  largeOrder: {
    icon: TriangleAlert,
    tone: "bg-info/12 text-info",
    rule: (rules) => `One paid order over ${rules.largeOrderUsd.toLocaleString("en")} USD`,
  },
  stuck: {
    icon: Hourglass,
    tone: "bg-warning/12 text-warning",
    rule: (rules) => `Waiting on the network for ${rules.stuckMinutes}+ minutes`,
  },
  brokenDomain: {
    icon: Globe,
    tone: "bg-warning/12 text-warning",
    rule: () => "A custom domain that was live and now fails",
  },
};

/**
 * Admin › Alerts: worked out each time the page opens. Mark one reviewed (with
 * a note if you like) and it leaves the list until it happens again.
 */
export function AlertsView() {
  const [view, setView] = useState<"open" | "reviewed">("open");
  const list = api.admin.alerts.list.useQuery(undefined, { refetchOnWindowFocus: false });
  const reviewed = api.admin.alerts.reviewed.useQuery(undefined, {
    enabled: view === "reviewed",
    refetchOnWindowFocus: false,
  });
  const [reviewing, setReviewing] = useState<Alert | null>(null);

  return (
    <PageBody className="grid gap-6">
      <PageHeader
        eyebrow="Admin"
        title="Alerts"
        description="Things worth a look, checked each time you open this page. Thresholds are in Settings."
        actions={
          <Button variant="outline" disabled={list.isFetching} onClick={() => void list.refetch()}>
            {list.isFetching && <Loader2 className="animate-spin" />} Check again
          </Button>
        }
      />
      <FilterChips
        label="View"
        value={view}
        onChange={setView}
        options={[
          { value: "open", label: "Open", icon: BellRing, count: list.data?.alerts.length },
          { value: "reviewed", label: "Reviewed", icon: CheckCircle2 },
        ]}
      />

      {view === "open" ? (
        list.isPending ? (
          <ListSkeleton />
        ) : list.isError ? (
          <ErrorState message="Couldn't check for alerts." onRetry={() => void list.refetch()} />
        ) : list.data.alerts.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="All clear"
            description="Nothing needs a look right now."
          />
        ) : (
          <ul className="grid gap-3">
            {list.data.alerts.map((alert) => (
              <AlertRow
                key={alert.key}
                alert={alert}
                rules={list.data.rules}
                onReview={() => setReviewing(alert)}
              />
            ))}
          </ul>
        )
      ) : reviewed.isPending ? (
        <ListSkeleton />
      ) : reviewed.isError ? (
        <ErrorState message="Couldn't load reviews." onRetry={() => void reviewed.refetch()} />
      ) : reviewed.data.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="No reviews yet" />
      ) : (
        <ul className="bg-surface border-fg/10 divide-border divide-y overflow-hidden rounded-[1.4rem] border-2">
          {reviewed.data.map((row) => (
            <li key={row.key} className="grid gap-0.5 px-4 py-3 text-sm">
              <span className="font-medium">
                {row.kind in KIND ? labelOf(row.kind) : row.kind} ·{" "}
                <span className="text-fg-muted font-normal">
                  by {row.reviewer?.displayName ?? row.reviewer?.username ?? "an admin"}{" "}
                  {timeAgo(row.createdAt)}
                </span>
              </span>
              {row.note && <span className="text-fg-muted">{row.note}</span>}
            </li>
          ))}
        </ul>
      )}

      <ReviewDialog alert={reviewing} onClose={() => setReviewing(null)} />
    </PageBody>
  );
}

const labelOf = (kind: string) =>
  ({
    failedPayments: "Many failed payments",
    signInFailures: "Many failed sign-ins",
    fastClaims: "Pin claims too far apart",
    largeOrder: "Large payment",
    stuck: "Payment stuck",
  })[kind] ?? kind;

function AlertRow({
  alert,
  rules,
  onReview,
}: {
  alert: Alert;
  rules: Rules;
  onReview: () => void;
}) {
  const kind = KIND[alert.kind];
  return (
    <li className="bg-surface border-fg/10 flex flex-wrap items-start gap-3 rounded-[1.4rem] border-2 p-4">
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${kind.tone}`}>
        <kind.icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">
          {alert.title} <span className="text-fg-muted font-normal">· {timeAgo(alert.at)}</span>
        </p>
        <p className="text-sm">{alert.detail}</p>
        <p className="text-fg-faint mt-0.5 text-xs">{kind.rule(rules)}</p>
        {alert.user && (
          <Link
            href={`/admin/users/${alert.user.id}`}
            className="hover:bg-surface-2 mt-2 inline-flex items-center gap-2 rounded-lg py-1 pr-2 text-sm"
          >
            <Avatar src={alert.user.avatarUrl} name={alert.user.name} className="size-6 text-xs" />
            <span className="font-medium">{alert.user.name ?? "Their account"}</span>
          </Link>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {alert.kind === "signInFailures" && (
          <Button variant="ghost" size="sm" asChild>
            <Link href="/admin/activity">Activity log</Link>
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={onReview}>
          <CheckCircle2 /> Mark reviewed
        </Button>
      </div>
    </li>
  );
}

function ReviewDialog({ alert, onClose }: { alert: Alert | null; onClose: () => void }) {
  const utils = api.useUtils();
  const [note, setNote] = useState("");
  const review = api.admin.alerts.review.useMutation({
    onSuccess: () => {
      toast.success("Marked reviewed");
      setNote("");
      onClose();
      void utils.admin.alerts.list.invalidate();
      void utils.admin.alerts.reviewed.invalidate();
    },
    onError: (error) => toast.error(messageOf(error)),
  });
  return (
    <Dialog open={alert !== null} onOpenChange={(open) => !open && !review.isPending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark reviewed?</DialogTitle>
          <DialogDescription>
            It leaves the list. If it happens again, a new alert shows up.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={note}
          maxLength={300}
          rows={3}
          placeholder="What you found (optional)"
          onChange={(event) => setNote(event.target.value)}
        />
        <DialogFooter>
          <Button variant="ghost" disabled={review.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={review.isPending}
            onClick={() =>
              alert && review.mutate({ key: alert.key, kind: alert.kind, note: note || undefined })
            }
          >
            {review.isPending && <Loader2 className="animate-spin" />}
            Mark reviewed
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ListSkeleton() {
  return (
    <div className="grid gap-3">
      {[0, 1, 2].map((index) => (
        <Skeleton key={index} className="h-24 w-full rounded-[1.4rem]" />
      ))}
    </div>
  );
}
