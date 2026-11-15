"use client";

import { Aperture, BadgeCheck, Eye, Lock, Pencil, Plus, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@bandcoin/ui/components/dialog";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { ConfirmDialog } from "@bandcoin/ui/patterns/confirm-dialog";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";
import { ErrorState } from "@bandcoin/ui/patterns/error-state";
import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";

import { SectionTabs } from "~/components/section-tabs";
import { POSTS_TABS } from "~/features/shell/nav";
import { api, type RouterOutputs } from "~/trpc/react";

import { EditStoryDialog } from "./edit-story-dialog";
import { MAX_LIVE, shareLeft, timeLeft } from "./story-file";

type Story = RouterOutputs["stories"]["stories"][number];

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong.";

const audienceOf = (story: Story) =>
  story.audience === "MEMBERS"
    ? { icon: Lock, label: story.tierName ? `${story.tierName} members` : "Members" }
    : story.audience === "SUBSCRIBERS"
      ? { icon: BadgeCheck, label: "Subscribers" }
      : story.audience === "FOLLOWERS"
        ? { icon: Users, label: "Followers" }
        : { icon: Eye, label: "Everyone" };

const endedOn = (story: Story) =>
  new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(
    new Date(story.expiresAt),
  );

/**
 * Stories: what is live right now and everything that ended before (these show
 * as Highlights on your page), how many people watched each, and a way to edit
 * or take one down. Adding is its own page (/stories/new), like posts.
 */
export function StoriesView() {
  const stories = api.stories.stories.useQuery();
  const utils = api.useUtils();
  const [open, setOpen] = useState<Story | null>(null);
  const [confirm, setConfirm] = useState<Story | null>(null);
  const [editing, setEditing] = useState<Story | null>(null);
  const [now] = useState(() => Date.now());
  const remove = api.stories.removeStory.useMutation({
    onSuccess: () => {
      toast.success("Story removed");
      setConfirm(null);
      setOpen(null);
      void utils.stories.invalidate();
    },
    onError: (error) => toast.error(messageOf(error)),
  });

  const live = stories.data?.filter((story) => story.live) ?? [];
  const ended = stories.data?.filter((story) => !story.live) ?? [];
  const count = live.length;
  const full = count >= MAX_LIVE;
  const add = (
    <Button asChild disabled={full}>
      <Link href="/stories/new" aria-disabled={full}>
        <Plus /> New story
      </Link>
    </Button>
  );

  return (
    <PageBody className="grid gap-6">
      <PageHeader
        eyebrow="Content"
        title="Posts & stories"
        description="Stories are photos and short clips that show as a ring at the top of your fans' feed for 24 hours."
        actions={stories.data && stories.data.length > 0 ? add : undefined}
      />
      <SectionTabs tabs={POSTS_TABS} label="Posts and stories" />

      {stories.isPending ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(10rem,12.5rem))]">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="aspect-[9/16] rounded-[1.4rem]" />
          ))}
        </div>
      ) : stories.isError ? (
        <ErrorState message="Couldn't load your stories." onRetry={() => void stories.refetch()} />
      ) : stories.data.length === 0 ? (
        <EmptyState
          icon={Aperture}
          title="No stories yet"
          description="Share a photo or a short clip. Fans who follow you see it at the top of their feed for 24 hours, then it stays on your page as a highlight."
          action={add}
        />
      ) : (
        <>
          <p className="text-fg-muted text-sm">
            <b className="text-fg">{count}</b> of {MAX_LIVE} live
            {full ? ". Remove one or wait for one to end to add another." : "."}
          </p>
          {live.length > 0 && (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(10rem,12.5rem))]">
              {live.map((story) => (
                <StoryCard
                  key={story.id}
                  story={story}
                  now={now}
                  onOpen={() => setOpen(story)}
                  onEdit={() => setEditing(story)}
                  onRemove={() => setConfirm(story)}
                />
              ))}
            </ul>
          )}
          {ended.length > 0 && (
            <section className="grid gap-3" aria-label="Ended stories">
              <div>
                <h2 className="display text-2xl">Highlights</h2>
                <p className="text-fg-muted text-sm">
                  Ended stories stay on your page for fans to watch, by the audience you chose.
                </p>
              </div>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(10rem,12.5rem))]">
                {ended.map((story) => (
                  <StoryCard
                    key={story.id}
                    story={story}
                    now={now}
                    onOpen={() => setOpen(story)}
                    onEdit={() => setEditing(story)}
                    onRemove={() => setConfirm(story)}
                  />
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <Dialog open={open !== null} onOpenChange={(next) => !next && setOpen(null)}>
        {open && (
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{open.caption ?? "Story"}</DialogTitle>
              <DialogDescription>
                {audienceOf(open).label} · {open.views.toLocaleString()} watched ·{" "}
                {open.live ? timeLeft(open.expiresAt, now) : `ended ${endedOn(open)}`}
              </DialogDescription>
            </DialogHeader>
            <div className="bg-fg mx-auto aspect-[9/16] max-h-[60dvh] overflow-hidden rounded-2xl">
              {open.type === "VIDEO" ? (
                <video src={open.url} controls playsInline className="size-full object-contain" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- uploaded to our own storage
                <img src={open.url} alt="" className="size-full object-contain" />
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setEditing(open);
                  setOpen(null);
                }}
              >
                <Pencil /> Edit
              </Button>
              <Button variant="outline" className="text-danger" onClick={() => setConfirm(open)}>
                <Trash2 /> Remove
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>

      <EditStoryDialog story={editing} onClose={() => setEditing(null)} />

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(next) => !next && !remove.isPending && setConfirm(null)}
        title="Remove this story?"
        description="Fans can't watch it any more, and it leaves your highlights. This can't be undone."
        confirmLabel="Remove"
        busy={remove.isPending}
        onConfirm={() => confirm && remove.mutate({ storyId: confirm.id })}
      />
    </PageBody>
  );
}

function StoryCard({
  story,
  now,
  onOpen,
  onEdit,
  onRemove,
}: {
  story: Story;
  now: number;
  onOpen: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const who = audienceOf(story);
  return (
    <li className="bg-surface-3 group relative aspect-[9/16] overflow-hidden rounded-[1.4rem] border-2">
      {story.type === "VIDEO" ? (
        <video
          src={story.url}
          muted
          playsInline
          preload="metadata"
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- uploaded to our own storage
        <img src={story.url} alt="" className="absolute inset-0 size-full object-cover" />
      )}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-1/4 bg-gradient-to-b from-black/50 to-transparent"
      />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/85 to-transparent"
      />
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open story${story.caption ? `: ${story.caption}` : ""}`}
        className="absolute inset-0"
      />
      <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-[11px] font-semibold text-white">
        <who.icon className="size-3" /> {who.label}
      </span>
      <div className="absolute top-1.5 right-1.5 flex gap-1">
        <Button variant="secondary" size="icon-sm" aria-label="Edit story" onClick={onEdit}>
          <Pencil />
        </Button>
        <Button variant="secondary" size="icon-sm" aria-label="Remove story" onClick={onRemove}>
          <Trash2 />
        </Button>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 grid gap-1.5 p-3 text-white">
        {story.caption && (
          <p className="line-clamp-2 text-sm leading-snug font-semibold">{story.caption}</p>
        )}
        <p className="flex items-center justify-between text-xs text-white/80">
          <span className="inline-flex items-center gap-1">
            <Eye className="size-3.5" /> {story.views.toLocaleString()}
          </span>
          <span>{story.live ? timeLeft(story.expiresAt, now) : endedOn(story)}</span>
        </p>
        {story.live && (
          <span className="h-1 overflow-hidden rounded-full bg-white/25">
            <span
              className="bg-primary block h-full rounded-full"
              style={{ width: `${Math.round(shareLeft(story.expiresAt, now) * 100)}%` }}
            />
          </span>
        )}
      </div>
    </li>
  );
}
