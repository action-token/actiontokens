"use client";

import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { ErrorState } from "@bandcoin/ui/patterns/error-state";
import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";

import { api } from "~/trpc/react";

import { AnnouncementForm } from "./announcement-form";

export const NewAnnouncementView = () => <AnnouncementForm />;

export function EditAnnouncementView({ announcementId }: { announcementId: string }) {
  const announcements = api.engage.announcements.useQuery();
  const announcement = announcements.data?.find((row) => row.id === announcementId);
  if (announcement) return <AnnouncementForm existing={announcement} />;
  return (
    <PageBody className="grid gap-6">
      <PageHeader back={{ href: "/announcements", label: "Announcements" }} eyebrow="Fans" title="Edit announcement" />
      {announcements.isPending ? (
        <Skeleton className="h-96 w-full max-w-2xl rounded-xl" />
      ) : announcements.isError ? (
        <ErrorState message="Couldn't load this announcement." onRetry={() => void announcements.refetch()} />
      ) : (
        <ErrorState message="This announcement doesn't exist." />
      )}
    </PageBody>
  );
}
