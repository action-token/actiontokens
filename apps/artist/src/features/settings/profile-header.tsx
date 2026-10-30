"use client";

import { Camera, ExternalLink, Loader2, Pencil } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@bandcoin/ui/components/avatar";
import { Badge } from "@bandcoin/ui/components/badge";
import { Button } from "@bandcoin/ui/components/button";
import { cn } from "@bandcoin/ui/lib/cn";

import { api, type RouterOutputs } from "~/trpc/react";

import { useUpload } from "../catalog/use-upload";
import { FAN_APP_URL } from "../shell/links";

type Profile = RouterOutputs["profile"]["overview"];

const STATUS: Record<
  Profile["status"],
  { label: string; tone: "default" | "secondary" | "destructive" }
> = {
  APPROVED: { label: "Approved", tone: "default" },
  PENDING: { label: "In review", tone: "secondary" },
  REJECTED: { label: "Not approved", tone: "destructive" },
  BANNED: { label: "Suspended", tone: "destructive" },
};

const joined = (date: Date | string) =>
  new Date(date).toLocaleDateString("en", { month: "long", year: "numeric" });

/** The column everything under the cover lines up in. */
export const SETTINGS_COLUMN = "mx-auto w-full max-w-5xl";

/** Cancels the page's own padding so the cover runs edge to edge. */
export const FULL_BLEED =
  "-mx-4 -mt-5 sm:-mx-6 lg:mx-[calc(var(--page-pad-x-lg,1.5rem)*-1)] lg:-mt-8";

/**
 * The top of Settings, as in Wadzzo's brand settings: a full-width cover and
 * the picture (each with its own change button), then name, status, bio,
 * followers and the counts that lead to each page.
 */
export function ProfileHeader({ profile, onEdit }: { profile: Profile; onEdit: () => void }) {
  const status = STATUS[profile.status];
  const counts = [
    { label: "pins", value: profile.counts.pins, href: "/pins/manage" },
    { label: "posts", value: profile.counts.posts, href: "/posts" },
    { label: "bounties", value: profile.counts.bounties, href: "/bounties" },
    { label: "items", value: profile.counts.items, href: "/items" },
  ];

  return (
    <header>
      <div
        className={cn(
          FULL_BLEED,
          "from-primary/40 via-primary-soft to-surface-2 relative h-40 overflow-hidden border-b-2 bg-gradient-to-br sm:h-52 lg:h-60",
        )}
      >
        {profile.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- covers come from our storage
          <img src={profile.coverUrl} alt="" className="absolute inset-0 size-full object-cover" />
        )}
        <div className={cn(SETTINGS_COLUMN, "relative h-full px-4 sm:px-6")}>
          <ImageButton
            kind="cover"
            label={profile.coverUrl ? "Change cover" : "Add cover"}
            className="absolute right-4 bottom-3 sm:right-6"
          />
        </div>
      </div>

      <div className={cn(SETTINGS_COLUMN, "flex flex-col gap-4 sm:flex-row sm:items-start")}>
        <div className="relative -mt-12 shrink-0 self-start sm:-mt-16">
          <Avatar className="border-bg bg-surface size-24 border-4 shadow-sm sm:size-32">
            {profile.avatarUrl && <AvatarImage src={profile.avatarUrl} alt="" />}
            <AvatarFallback className="bg-primary text-primary-foreground text-3xl font-bold">
              {profile.name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <ImageButton
            kind="avatar"
            label="Change picture"
            icon
            className="absolute right-1 bottom-1"
          />
        </div>

        <div className="grid min-w-0 flex-1 gap-2 sm:pt-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="display truncate text-2xl sm:text-3xl">{profile.name}</h1>
                <Badge variant={status.tone}>{status.label}</Badge>
              </div>
              <p className="text-fg-muted mt-0.5 text-sm">
                {profile.counts.followers.toLocaleString()}{" "}
                {profile.counts.followers === 1 ? "follower" : "followers"} · Joined{" "}
                {joined(profile.createdAt)}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild>
                <a href={`${FAN_APP_URL}/artist/${profile.slug}`} target="_blank" rel="noreferrer">
                  <ExternalLink /> View page
                </a>
              </Button>
              <Button size="sm" onClick={onEdit}>
                <Pencil /> Edit profile
              </Button>
            </div>
          </div>

          {profile.bio ? (
            <p className="max-w-2xl text-sm text-pretty">{profile.bio}</p>
          ) : (
            <button
              type="button"
              onClick={onEdit}
              className="text-fg-muted hover:text-fg justify-self-start text-sm underline underline-offset-4"
            >
              Add a bio so fans know who you are
            </button>
          )}

          <ul className="mt-1 flex flex-wrap gap-2">
            {counts.map((count) => (
              <li key={count.label}>
                <Link
                  href={count.href}
                  className="bg-surface hover:bg-surface-2 inline-flex items-baseline gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors"
                >
                  <b className="num">{count.value.toLocaleString()}</b>
                  <span className="text-fg-muted">{count.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </header>
  );
}

/** Picks a picture, uploads it to storage, then saves it on the profile. */
function ImageButton({
  kind,
  label,
  icon = false,
  className,
}: {
  kind: "avatar" | "cover";
  label: string;
  icon?: boolean;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const utils = api.useUtils();
  const { upload, busy } = useUpload();
  const [error, setError] = useState<string | null>(null);
  const save = api.profile.setImage.useMutation({
    onSuccess: () =>
      Promise.all([utils.profile.overview.invalidate(), utils.account.me.invalidate()]),
  });
  const working = busy || save.isPending;

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      await save.mutateAsync({ kind, url: await upload(file) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't upload that picture.");
    }
  }

  return (
    <div className={cn("grid justify-items-end gap-1", className)}>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(event) => {
          void pick(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <Button
        type="button"
        size={icon ? "icon" : "sm"}
        variant="secondary"
        aria-label={label}
        title={label}
        disabled={working}
        onClick={() => input.current?.click()}
        className={cn("shadow-sm", icon && "size-8 rounded-full")}
      >
        {working ? <Loader2 className="animate-spin" /> : <Camera />}
        {!icon && label}
      </Button>
      {error && (
        <p role="alert" className="bg-surface text-danger rounded px-2 py-1 text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
