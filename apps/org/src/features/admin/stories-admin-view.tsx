"use client";

import { Aperture, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@actiontokens/ui/components/button";
import { Skeleton } from "@actiontokens/ui/components/skeleton";
import { EmptyState } from "@actiontokens/ui/patterns/empty-state";
import { ErrorState } from "@actiontokens/ui/patterns/error-state";
import { PageBody, PageHeader } from "@actiontokens/ui/patterns/page-header";
import { StatusPill } from "@actiontokens/ui/patterns/status-pill";

import { timeLeft } from "~/features/stories/story-file";
import { api, type RouterOutputs } from "~/trpc/react";

import { HideDialog } from "./hide-dialog";

type Row = RouterOutputs["admin"]["stories"]["list"][number];

const WHO = {
  EVERYONE: "Everyone",
  FOLLOWERS: "Followers",
  SUBSCRIBERS: "Subscribers",
  MEMBERS: "Members",
} as const;

/** Every live story. Taking one down ends it at once; the artist's reason is kept in the activity log. */
export function StoriesAdminView() {
  const stories = api.admin.stories.list.useQuery();
  const utils = api.useUtils();
  const [taking, setTaking] = useState<Row | null>(null);
  const [now] = useState(() => Date.now());
  const takeDown = api.admin.stories.takeDown.useMutation({
    onSuccess: () => {
      toast.success("Story taken down");
      setTaking(null);
      void utils.admin.stories.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <PageBody className="grid gap-6">
      <PageHeader
        eyebrow="Admin"
        title="Story review"
        description="Stories are live as soon as an organization shares them and end on their own after 24 hours. Take one down if it breaks the rules."
      />
      {stories.isPending ? (
        <div className="grid gap-3">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-24 rounded-[1.4rem]" />
          ))}
        </div>
      ) : stories.isError ? (
        <ErrorState message="Couldn't load the stories." onRetry={() => void stories.refetch()} />
      ) : stories.data.length === 0 ? (
        <EmptyState
          icon={Aperture}
          title="No live stories"
          description="Stories organizations share show up here for their 24 hours."
        />
      ) : (
        <ul className="grid gap-3">
          {stories.data.map((story) => (
            <li
              key={story.id}
              className="bg-surface flex items-center gap-4 rounded-[1.4rem] border-2 p-3"
            >
              <span className="bg-surface-2 block h-20 w-14 shrink-0 overflow-hidden rounded-xl">
                {story.type === "VIDEO" ? (
                  <video
                    src={story.url}
                    muted
                    playsInline
                    preload="metadata"
                    className="size-full object-cover"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- uploaded to our own storage
                  <img src={story.url} alt="" className="size-full object-cover" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{story.organization.name}</p>
                <p className="text-fg-muted truncate text-xs">{story.caption ?? "No caption"}</p>
                <p className="text-fg-muted mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span>{WHO[story.audience]}</span>
                  <span className="inline-flex items-center gap-1">
                    <Eye className="size-3.5" /> {story.views.toLocaleString()}
                  </span>
                  <StatusPill tone="info">{timeLeft(story.expiresAt, now)}</StatusPill>
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setTaking(story)}>
                <EyeOff /> Take down
              </Button>
            </li>
          ))}
        </ul>
      )}
      <HideDialog
        open={taking !== null}
        title={`Take down ${taking?.organization.name ?? "this"}'s story?`}
        description="Fans can't watch it any more. The organization can share a new one."
        busy={takeDown.isPending}
        onClose={() => setTaking(null)}
        onConfirm={(reason) => taking && takeDown.mutate({ storyId: taking.id, reason })}
      />
    </PageBody>
  );
}
