"use client";
/* eslint-disable @next/next/no-img-element -- community pictures and token icons come from many hosts */

import { Lock, Unlock, Users } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@actiontokens/ui/components/avatar";
import { cn } from "@actiontokens/ui/lib/cn";

import { declare, putToStorage } from "~/lib/upload";
import { api, type RouterOutputs } from "~/trpc/react";

export type CommunityRow = RouterOutputs["community"]["list"]["items"][number];
export type Person = {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
};

export const nameOf = (person: Person | null | undefined) =>
  person?.displayName ?? (person?.username ? `@${person.username}` : "Someone");

export const compact = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);

/** "Hold 10 $NIGHT +1" for a gated community, "Open crew" for an open one. */
export function gateText(community: {
  isTokenGated: boolean;
  gateLogic?: "AND" | "OR";
  requirements: { assetCode: string; requiredBalance: string }[];
}) {
  if (!community.isTokenGated || community.requirements.length === 0) return "Open crew";
  const [first, ...rest] = community.requirements;
  const amount = Number(first!.requiredBalance);
  const head =
    amount > 0
      ? `Hold ${amount.toLocaleString("en-US")} $${first!.assetCode}`
      : `Hold $${first!.assetCode}`;
  return rest.length > 0
    ? `${head} ${community.gateLogic === "OR" ? "or" : "+"} ${rest.length} more`
    : head;
}

export function PersonAvatar({
  person,
  className,
}: {
  person: Person | null | undefined;
  className?: string;
}) {
  const name = nameOf(person);
  return (
    <Avatar className={cn("size-9", className)}>
      {person?.avatarUrl && <AvatarImage src={person.avatarUrl} alt="" />}
      <AvatarFallback className="text-xs font-bold">
        {name.replace("@", "").slice(0, 2).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

/** A community in a list: banner, round picture, name, what it's about, counts and the gate. */
export function CommunityCard({ community }: { community: CommunityRow }) {
  const gated = community.isTokenGated && community.requirements.length > 0;
  return (
    <Link href={`/communities/${community.id}`} className="cm-card">
      <span className="cm-card-cover" aria-hidden>
        {community.coverUrl && <img src={community.coverUrl} alt="" loading="lazy" />}
      </span>
      <span className="cm-card-body">
        <span className="cm-card-pic">
          {community.profileUrl ? (
            <img src={community.profileUrl} alt="" loading="lazy" />
          ) : (
            <Users className="size-6" />
          )}
        </span>
        <span className="cm-card-title">{community.title}</span>
        <span className="cm-card-desc">{community.description}</span>
        <span className="cm-card-foot">
          <span className="cm-card-count">
            <Users className="size-3.5" /> {compact(community._count.members)} ·{" "}
            {compact(community._count.posts)} posts
          </span>
          <span className={cn("cm-gate", !gated && "cm-gate--open")}>
            {gated ? <Lock className="size-3" /> : <Unlock className="size-3" />}
            {gateText(community)}
          </span>
        </span>
      </span>
    </Link>
  );
}

/** Picks a picture, uploads it straight to storage and hands back its address. */
export function useImagePick(onDone: (url: string) => void, onError: (message: string) => void) {
  const sign = api.account.imageUpload.useMutation();
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  async function pick(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const declared = await declare(file);
      const signed = await sign.mutateAsync(declared);
      await putToStorage(file, signed, declared.checksum);
      onDone(signed.fileUrl);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Couldn't upload the picture.");
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  }
  return {
    uploading,
    open: () => input.current?.click(),
    inputProps: {
      ref: input,
      type: "file" as const,
      accept: "image/jpeg,image/png,image/webp,image/gif",
      hidden: true,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => void pick(event.target.files?.[0]),
    },
  };
}
