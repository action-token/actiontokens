"use client";

import { Megaphone, Pin, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";
import { ErrorState } from "@bandcoin/ui/patterns/error-state";
import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";
import { StatusPill } from "@bandcoin/ui/patterns/status-pill";

import { SectionTabs } from "~/components/section-tabs";
import { EVENTS_TABS } from "~/features/shell/nav";
import { formatWhen } from "~/lib/datetime";
import { api, type RouterOutputs } from "~/trpc/react";

type Announcement = RouterOutputs["engage"]["announcements"][number];

/** The news you post to fans. */
export function AnnouncementsView() {
  const announcements = api.engage.announcements.useQuery();

  const add = (
    <Button asChild>
      <Link href="/events/announcements/new">
        <Plus /> New announcement
      </Link>
    </Button>
  );

  return (
    <PageBody className="grid max-w-3xl gap-6">
      <PageHeader
        eyebrow="Drops"
        title="Events & announcements"
        description="Both go live straight away for fans in the app and on the map."
        actions={announcements.data && announcements.data.length > 0 ? add : undefined}
      />
      <SectionTabs tabs={EVENTS_TABS} label="Events and announcements" />
      {announcements.isPending ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : announcements.isError ? (
        <ErrorState
          message="Couldn't load your announcements."
          onRetry={() => void announcements.refetch()}
        />
      ) : announcements.data.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="Nothing posted yet"
          description="Tell fans about a release, a tour date or a drop."
          action={add}
        />
      ) : (
        <ul className="grid gap-3">
          {announcements.data.map((item) => (
            <AnnouncementCard key={item.id} announcement={item} />
          ))}
        </ul>
      )}
    </PageBody>
  );
}

function AnnouncementCard({ announcement }: { announcement: Announcement }) {
  const utils = api.useUtils();
  const [now] = useState(() => Date.now());
  const pin = api.engage.updateAnnouncement.useMutation({
    onSuccess: () => void utils.engage.announcements.invalidate(),
    onError: (error) => toast.error(error.message),
  });
  const expired =
    announcement.expiresAt !== null && new Date(announcement.expiresAt).getTime() <= now;

  return (
    <li className="bg-surface grid gap-3 rounded-xl border p-4 sm:p-5">
      <Link href={`/events/announcements/${announcement.id}`} className="grid gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="display min-w-0 text-lg">{announcement.title}</h3>
          <div className="flex items-center gap-2">
            {announcement.isPinned && (
              <StatusPill tone="info">
                <Pin className="size-3" /> Pinned
              </StatusPill>
            )}
            {expired && <StatusPill tone="neutral">Ended</StatusPill>}
          </div>
        </div>
        <p className="line-clamp-3 text-sm whitespace-pre-line">{announcement.body}</p>
        {announcement.imageUrls.length > 0 && (
          <div className="flex gap-2">
            {announcement.imageUrls.map((url) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={url}
                src={url}
                alt=""
                className="bg-surface-2 size-16 rounded-lg object-cover"
              />
            ))}
          </div>
        )}
        <p className="text-fg-faint text-xs">
          Posted {formatWhen(announcement.createdAt)} · {announcement.comments} comment
          {announcement.comments === 1 ? "" : "s"}
          {announcement.expiresAt && !expired
            ? ` · hides ${formatWhen(announcement.expiresAt)}`
            : ""}
        </p>
      </Link>
      <div className="flex flex-wrap gap-2 border-t pt-3">
        <Button asChild size="sm" variant="secondary">
          <Link href={`/events/announcements/${announcement.id}`}>Edit</Link>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pin.isPending}
          onClick={() =>
            pin.mutate({ announcementId: announcement.id, isPinned: !announcement.isPinned })
          }
        >
          {announcement.isPinned ? "Unpin" : "Pin"}
        </Button>
      </div>
    </li>
  );
}
