"use client";

import { Image as ImageIcon, Lock, Music, PenSquare, Video } from "lucide-react";
import { useSession } from "next-auth/react";

import { useConnectWalletDialogStore } from "@actiontokens/wallet";

import { api } from "~/trpc/react";

import { Avatar } from "../shell/context-panel";
import { composerTarget } from "./composer-target";

const KINDS = [
  { icon: ImageIcon, label: "Photo" },
  { icon: Video, label: "Video" },
  { icon: Music, label: "Music" },
  { icon: Lock, label: "Members-only" },
];

/**
 * "What's on your mind" at the top of the feed. Posts are written in the
 * artist portal, so the box opens it: artists land on a new post, fans on
 * becoming an artist, and visitors sign in first.
 */
export function Composer() {
  const { status } = useSession();
  const signedIn = status === "authenticated";
  const openSignIn = useConnectWalletDialogStore((state) => state.setIsOpen);
  const me = api.account.me.useQuery(undefined, { enabled: signedIn, staleTime: 5 * 60_000 });
  const loading = status === "loading" || (signedIn && !me.data);
  const artist = me.data?.organization ?? null;
  const target = composerTarget(signedIn, artist, me.data?.displayName ?? null);
  const name = artist?.name ?? me.data?.displayName ?? "You";

  return (
    <a
      href={target.href ?? "#"}
      onClick={(event) => {
        if (target.href && !loading) return;
        event.preventDefault();
        if (!signedIn && !loading) openSignIn(true);
      }}
      className="group bg-surface hover:border-border-strong block rounded-[1.2rem] border p-4 transition-colors"
    >
      <div className="flex items-center gap-3">
        <Avatar name={name} url={me.data?.avatarUrl ?? null} />
        <span className="bg-surface-2 text-fg-muted group-hover:ring-primary/40 flex h-11 min-w-0 flex-1 items-center truncate rounded-xl px-4 text-sm ring-1 ring-transparent transition-colors">
          {loading ? "Share something with your fans…" : target.prompt}
        </span>
      </div>
      <div className="text-fg-muted mt-3 flex items-center gap-1 border-t border-dashed pt-3 text-xs font-semibold">
        {KINDS.map((kind) => (
          <span
            key={kind.label}
            className="group-hover:text-fg inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 transition-colors"
          >
            <kind.icon className="text-primary-text size-4" />
            <span className="hidden sm:inline">{kind.label}</span>
          </span>
        ))}
        <span className="bg-primary text-primary-foreground border-fg ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border-2 px-3.5 py-1.5 shadow-[2px_2px_0_0_var(--color-fg)] transition-transform group-hover:-translate-y-0.5">
          <PenSquare className="size-3.5" /> {loading ? "Post" : target.action}
        </span>
      </div>
    </a>
  );
}
