"use client";

import { Camera, Loader2, Pencil } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@bandcoin/ui/components/avatar";
import { Badge } from "@bandcoin/ui/components/badge";
import { Button } from "@bandcoin/ui/components/button";
import { cn } from "@bandcoin/ui/lib/cn";

import { api, type RouterOutputs } from "~/trpc/react";

import { useUpload } from "../catalog/use-upload";

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

/**
 * The top of Settings, as in Wadzzo's brand settings: the cover and picture
 * (each with its own change button), name, status, bio, followers, and counts
 * that lead to each page.
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
      {/* Full-width hero: cancels the page's own padding so the cover runs edge to edge. */}
      <div className="bg-surface-2 relative -mx-4 -mt-5 h-44 overflow-hidden border-b-2 sm:-mx-6 sm:h-56 lg:mx-[calc(var(--page-pad-x-lg,1.5rem)*-1)] lg:-mt-8 lg:h-64">
        {profile.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- covers come from our storage
          <img src={profile.coverUrl} alt="" className="size-full object-cover" />
        )}
        <ImageButton
          kind="cover"
          label={profile.coverUrl ? "Change cover" : "Add cover"}
          className="absolute right-3 bottom-3"
        />
      </div>

      <div className="flex flex-wrap items-end gap-4 px-2 sm:px-5">
        <div className="relative -mt-14 shrink-0">
          <Avatar className="border-bg size-24 border-4 sm:size-28">
            {profile.avatarUrl && <AvatarImage src={profile.avatarUrl} alt="" />}
            <AvatarFallback className="bg-primary text-primary-foreground text-2xl font-bold">
              {profile.name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <ImageButton
            kind="avatar"
            label="Change picture"
            icon
            className="absolute right-0 bottom-0"
          />
        </div>
        <div className="min-w-0 flex-1 pt-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="display truncate text-2xl sm:text-3xl">{profile.name}</h1>
            <Badge variant={status.tone}>{status.label}</Badge>
          </div>
          <p className="text-fg-muted text-xs">
            {profile.counts.followers.toLocaleString()}{" "}
            {profile.counts.followers === 1 ? "follower" : "followers"} · joined{" "}
            {joined(profile.createdAt)}
          </p>
        </div>
        <Button variant="outline" onClick={onEdit}>
          <Pencil /> Edit profile
        </Button>
      </div>

      <div className="mt-3 grid gap-2 px-2 sm:px-5">
        {profile.bio ? (
          <p className="text-fg-muted max-w-2xl text-sm">{profile.bio}</p>
        ) : (
          <button
            type="button"
            onClick={onEdit}
            className="text-fg-muted justify-self-start text-sm underline-offset-4 hover:underline"
          >
            Add a bio
          </button>
        )}
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {counts.map((count) => (
            <Link key={count.label} href={count.href} className="hover:underline">
              <b className="num">{count.value.toLocaleString()}</b>{" "}
              <span className="text-fg-muted">{count.label}</span>
            </Link>
          ))}
        </p>
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
