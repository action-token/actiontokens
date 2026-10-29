"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { ConfirmDialog } from "@bandcoin/ui/patterns/confirm-dialog";
import { ErrorState } from "@bandcoin/ui/patterns/error-state";
import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";

import { api } from "~/trpc/react";

import { AnnouncementForm } from "./announcement-form";

const BACK = { href: "/announcements", label: "Announcements" };

export function NewAnnouncementView() {
  return (
    <PageBody className="grid gap-6">
      <PageHeader back={BACK} eyebrow="Fans" title="New announcement" description="Short news fans see in the AR app. Pinned ones stay on top." />
      <AnnouncementForm />
    </PageBody>
  );
}

export function EditAnnouncementView({ announcementId }: { announcementId: string }) {
  const router = useRouter();
  const utils = api.useUtils();
  const announcements = api.engage.announcements.useQuery();
  const announcement = announcements.data?.find((row) => row.id === announcementId);
  const [deleting, setDeleting] = useState(false);
  const remove = api.engage.removeAnnouncement.useMutation({
    onSuccess: () => {
      toast.success("Announcement deleted");
      void utils.engage.announcements.invalidate();
      router.push("/announcements");
    },
    onError: (error) => {
      setDeleting(false);
      toast.error(error.message);
    },
  });

  return (
    <PageBody className="grid gap-6">
      <PageHeader
        back={BACK}
        eyebrow="Fans"
        title={announcement?.title ?? "Edit announcement"}
        actions={
          announcement && (
            <Button variant="ghost" size="sm" onClick={() => setDeleting(true)}>
              <Trash2 /> Delete
            </Button>
          )
        }
      />
      {announcements.isPending ? (
        <Skeleton className="h-96 w-full max-w-2xl rounded-xl" />
      ) : announcements.isError ? (
        <ErrorState message="Couldn't load this announcement." onRetry={() => void announcements.refetch()} />
      ) : !announcement ? (
        <ErrorState message="This announcement doesn't exist." />
      ) : (
        <>
          <AnnouncementForm existing={announcement} />
          <ConfirmDialog
            open={deleting}
            onOpenChange={setDeleting}
            title="Delete this announcement?"
            description={`Its ${announcement.comments} comments go with it. This can't be undone.`}
            confirmLabel={remove.isPending ? "Deleting…" : "Delete"}
            busy={remove.isPending}
            onConfirm={() => remove.mutate({ announcementId })}
          />
        </>
      )}
    </PageBody>
  );
}
