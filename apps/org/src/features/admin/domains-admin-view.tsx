"use client";

import { Globe, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@actiontokens/ui/components/button";
import { Skeleton } from "@actiontokens/ui/components/skeleton";
import { EmptyState } from "@actiontokens/ui/patterns/empty-state";
import { ErrorState } from "@actiontokens/ui/patterns/error-state";
import { PageBody, PageHeader } from "@actiontokens/ui/patterns/page-header";
import { StatusPill } from "@actiontokens/ui/patterns/status-pill";

import { timeAgo } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

import { HideDialog } from "./hide-dialog";

type Row = RouterOutputs["admin"]["domains"]["list"][number];

const STATUS = {
  LIVE: { tone: "success", label: "Live" },
  PENDING: { tone: "info", label: "Waiting for DNS" },
  BROKEN: { tone: "danger", label: "Stopped working" },
  NEEDS_SETUP: { tone: "warning", label: "Needs verifying" },
} as const satisfies Record<Row["status"], { tone: string; label: string }>;

/** Every artist's custom domain (plan 32). Removing one detaches it from the host and tells the artist why. */
export function DomainsAdminView() {
  const domains = api.admin.domains.list.useQuery();
  const utils = api.useUtils();
  const [removing, setRemoving] = useState<Row | null>(null);
  const remove = api.admin.domains.remove.useMutation({
    onSuccess: () => {
      toast.success("Domain removed");
      setRemoving(null);
      void utils.admin.domains.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <PageBody className="grid gap-6">
      <PageHeader
        eyebrow="Admin"
        title="Domains"
        description="Organizations' own domains showing their organization page. They're checked every day; one that stops working is told to the artist and shows in Alerts."
      />
      {domains.isPending ? (
        <div className="grid gap-3">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-20 rounded-[1.4rem]" />
          ))}
        </div>
      ) : domains.isError ? (
        <ErrorState message="Couldn't load the domains." onRetry={() => void domains.refetch()} />
      ) : domains.data.length === 0 ? (
        <EmptyState
          icon={Globe}
          title="No custom domains"
          description="Domains organizations connect in Settings › Custom domain show up here."
        />
      ) : (
        <ul className="grid gap-3">
          {domains.data.map((row) => (
            <li
              key={row.id}
              className="bg-surface flex items-center gap-4 rounded-[1.4rem] border-2 p-4"
            >
              <span className="bg-surface-2 grid size-12 shrink-0 place-items-center rounded-xl">
                <Globe className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <a
                  href={`https://${row.domain}`}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-sm font-semibold hover:underline"
                >
                  {row.domain}
                  {row.withWww && <span className="text-fg-muted font-normal"> + www</span>}
                </a>
                <Link
                  href={`/admin/artists/${row.artist.id}`}
                  className="text-fg-muted block truncate text-xs hover:underline"
                >
                  {row.artist.name}
                </Link>
                <p className="text-fg-muted mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <StatusPill tone={STATUS[row.status].tone}>{STATUS[row.status].label}</StatusPill>
                  <span>
                    {row.lastCheckedAt
                      ? `Checked ${timeAgo(row.lastCheckedAt)}`
                      : "Not checked yet"}
                  </span>
                  {row.lastError && row.status !== "LIVE" && (
                    <span className="truncate">{row.lastError}</span>
                  )}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setRemoving(row)}>
                <Trash2 /> Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      <HideDialog
        open={removing !== null}
        title={`Remove ${removing?.domain ?? "this domain"}?`}
        description="It stops showing the organization's page right away and is taken off the host. The organization's bell tells them your reason."
        busy={remove.isPending}
        confirmLabel="Remove"
        onClose={() => setRemoving(null)}
        onConfirm={(reason) => removing && remove.mutate({ id: removing.id, reason })}
      />
    </PageBody>
  );
}
