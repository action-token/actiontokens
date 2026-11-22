"use client";
/* eslint-disable @next/next/no-img-element -- community pictures and token icons come from many hosts */

import {
  Bell,
  Check,
  Lock,
  LogOut,
  Pencil,
  Trash2,
  Unlock,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@actiontokens/ui/components/button";
import { Skeleton } from "@actiontokens/ui/components/skeleton";
import { cn } from "@actiontokens/ui/lib/cn";
import { useConnectWalletDialogStore } from "@actiontokens/wallet";

import { timeAgo } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

import { InviteDialog, NotifyDialog } from "./community-dialogs";
import { CommunityPosts } from "./community-posts";
import { compact, nameOf, PersonAvatar } from "./parts";

type Community = RouterOutputs["community"]["byId"];
type Tab = "posts" | "members" | "activity";

/**
 * One community: banner, picture, name and owner, what it's about, the gate (each token it asks
 * for and, signed in, what you hold), Join or Leave, then Posts, Members and Activity. The owner
 * gets Edit and Delete; members get Invite and their notification switches.
 */
export function CommunityView({ id }: { id: string }) {
  const community = api.community.byId.useQuery({ communityId: id });
  const [tab, setTab] = useState<Tab>("posts");

  if (community.isPending)
    return (
      <div className="grid gap-4">
        <Skeleton className="h-56 rounded-3xl" />
        <Skeleton className="h-40 rounded-3xl" />
      </div>
    );
  if (!community.data)
    return (
      <div className="cm-empty">
        <p className="font-display text-2xl uppercase">This community doesn&apos;t exist</p>
        <Button asChild variant="outline">
          <Link href="/communities">All communities</Link>
        </Button>
      </div>
    );
  const data = community.data;
  return (
    <div className="grid gap-6">
      <Header community={data} />
      <div className="cm-layout">
        <div className="grid min-w-0 gap-5">
          <div className="cm-tabs" role="tablist">
            {(["posts", "members", "activity"] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
              >
                {value === "posts"
                  ? `Posts · ${compact(data._count.posts)}`
                  : value === "members"
                    ? `Members · ${compact(data._count.members)}`
                    : "Activity"}
              </button>
            ))}
          </div>
          {tab === "posts" && <CommunityPosts community={data} />}
          {tab === "members" && <Members community={data} />}
          {tab === "activity" && <Activity id={data.id} />}
        </div>
        <Gate community={data} />
      </div>
    </div>
  );
}

function Header({ community }: { community: Community }) {
  const router = useRouter();
  const utils = api.useUtils();
  const { status } = useSession();
  const signedIn = status === "authenticated";
  const openWallet = useConnectWalletDialogStore((state) => state.setIsOpen);
  const [invite, setInvite] = useState(false);
  const [notify, setNotify] = useState(false);
  const refresh = () =>
    Promise.all([
      utils.community.byId.invalidate({ communityId: community.id }),
      utils.community.mine.invalidate(),
      utils.community.members.invalidate({ communityId: community.id }),
    ]);
  const join = api.community.join.useMutation({
    onSuccess: async () => {
      toast.success(`You're in ${community.title}.`);
      await refresh();
    },
    onError: (error) => toast.error(error.message),
  });
  const leave = api.community.leave.useMutation({
    onSuccess: async () => {
      toast.success("You left the community.");
      await refresh();
    },
    onError: (error) => toast.error(error.message),
  });
  const remove = api.community.delete.useMutation({
    onSuccess: async () => {
      toast.success("Community deleted.");
      await utils.community.invalidate();
      router.push("/communities");
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <section className="cm-hero">
      <div className="cm-hero-cover" aria-hidden>
        {community.coverUrl && <img src={community.coverUrl} alt="" />}
      </div>
      <div className="cm-hero-body">
        <span className="cm-hero-pic">
          {community.profileUrl ? (
            <img src={community.profileUrl} alt="" />
          ) : (
            <Users className="size-9" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="cm-eyebrow">{community.isTokenGated ? "Token-gated crew" : "Open crew"}</p>
          <h1 className="cm-hero-title">{community.title}</h1>
          <p className="text-fg-muted mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="inline-flex items-center gap-1.5">
              <PersonAvatar person={community.owner} className="size-5" /> Run by{" "}
              {nameOf(community.owner)}
            </span>
            <span>{compact(community._count.members)} members</span>
            <span>{compact(community._count.posts)} posts</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {community.isOwner ? (
            <>
              <Button variant="outline" asChild>
                <Link href={`/communities/${community.id}/edit`}>
                  <Pencil /> Edit
                </Link>
              </Button>
              <Button variant="outline" onClick={() => setInvite(true)}>
                <UserPlus /> Invite
              </Button>
              <Button
                variant="destructive"
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm(`Delete ${community.title}? Posts and members go with it.`))
                    remove.mutate({ communityId: community.id });
                }}
              >
                <Trash2 /> Delete
              </Button>
            </>
          ) : community.isMember ? (
            <>
              <Button variant="outline" onClick={() => setInvite(true)}>
                <UserPlus /> Invite
              </Button>
              <Button
                variant="ghost"
                disabled={leave.isPending}
                onClick={() => leave.mutate({ communityId: community.id })}
              >
                <LogOut /> Leave
              </Button>
            </>
          ) : (
            <Button
              disabled={join.isPending || Boolean(community.hiddenAt)}
              onClick={() =>
                signedIn ? join.mutate({ communityId: community.id }) : openWallet(true)
              }
            >
              {join.isPending ? "Joining…" : "Join crew"}
            </Button>
          )}
          {community.isMember && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Notifications"
              onClick={() => setNotify(true)}
            >
              <Bell />
            </Button>
          )}
        </div>
      </div>
      {community.hiddenAt && (
        <p className="cm-hidden">
          Hidden by the admins{community.hiddenReason ? `: ${community.hiddenReason}` : "."} Only
          you can see it.
        </p>
      )}
      <p className="cm-hero-desc">{community.description}</p>
      {invite && <InviteDialog communityId={community.id} onClose={() => setInvite(false)} />}
      {notify && <NotifyDialog communityId={community.id} onClose={() => setNotify(false)} />}
    </section>
  );
}

/** What it takes to get in: each token, how much, and (signed in) what you hold. */
function Gate({ community }: { community: Community }) {
  const { status } = useSession();
  const gated = community.isTokenGated && community.requirements.length > 0;
  const gate = api.community.gate.useQuery(
    { communityId: community.id },
    { enabled: status === "authenticated" && gated, staleTime: 60_000 },
  );
  const checks = new Map(
    (gate.data?.checks ?? []).map((check) => [`${check.assetCode}:${check.assetIssuer}`, check]),
  );
  return (
    <aside className="cm-gatebox">
      <p className="cm-eyebrow">{gated ? "The gate" : "Open door"}</p>
      <p className="font-display text-3xl uppercase">
        {gated
          ? community.gateLogic === "AND"
            ? "Hold all of these"
            : "Hold any of these"
          : "Anyone can join"}
      </p>
      {gated ? (
        <ul className="grid gap-2">
          {community.requirements.map((req) => {
            const check = checks.get(`${req.assetCode}:${req.assetIssuer}`);
            const needed = Number(req.requiredBalance);
            return (
              <li
                key={req.id}
                className={cn("cm-req", check && (check.met ? "cm-req--ok" : "cm-req--no"))}
              >
                <span className="cm-req-icon">
                  {req.assetImageUrl ? (
                    <img src={req.assetImageUrl} alt="" />
                  ) : (
                    req.assetCode.slice(0, 2)
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block">
                    {needed > 0 ? needed.toLocaleString("en-US") : "Any"} ${req.assetCode}
                  </b>
                  <span className="text-fg-faint block truncate font-mono text-[10px]">
                    {req.assetIssuer.slice(0, 6)}…{req.assetIssuer.slice(-6)}
                  </span>
                </span>
                {check && (
                  <span className="cm-req-held">
                    {check.met ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                    {check.held.toLocaleString("en-US")}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-fg-muted text-sm">No tokens needed. Join and say hi.</p>
      )}
      {gated && status === "authenticated" && gate.data && (
        <p className={cn("cm-verdict", gate.data.passes ? "cm-verdict--ok" : "cm-verdict--no")}>
          {gate.data.passes ? <Unlock className="size-4" /> : <Lock className="size-4" />}
          {gate.data.passes ? "You hold enough to get in." : "You don't hold enough yet."}
        </p>
      )}
      {gated && status !== "authenticated" && (
        <p className="text-fg-muted text-sm">Sign in to check your wallet against the gate.</p>
      )}
      <p className="text-fg-faint text-xs">
        Started{" "}
        {new Date(community.createdAt).toLocaleDateString("en-US", {
          month: "short",
          year: "numeric",
        })}
        {" · "}
        {community.postPermission === "OWNER_ONLY"
          ? "only the owner posts"
          : "every member can post"}
      </p>
    </aside>
  );
}

function Members({ community }: { community: Community }) {
  const utils = api.useUtils();
  const members = api.community.members.useInfiniteQuery(
    { communityId: community.id },
    { getNextPageParam: (page) => page.nextCursor ?? undefined, retry: false },
  );
  const remove = api.community.removeMember.useMutation({
    onSuccess: async () => {
      toast.success("Removed.");
      await Promise.all([
        utils.community.members.invalidate({ communityId: community.id }),
        utils.community.byId.invalidate({ communityId: community.id }),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });
  if (members.error) return <p className="cm-note">{members.error.message}</p>;
  const rows = members.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <div className="grid gap-3">
      <ul className="cm-members">
        {rows.map((row) => (
          <li key={row.id}>
            <PersonAvatar person={row.user} />
            <span className="min-w-0 flex-1">
              <b className="block truncate">{nameOf(row.user)}</b>
              <span className="text-fg-faint text-xs">joined {timeAgo(row.joinedAt)}</span>
            </span>
            {row.role === "OWNER" ? (
              <span className="cm-badge">Owner</span>
            ) : (
              community.isOwner && (
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate({ communityId: community.id, userId: row.user.id })}
                >
                  Remove
                </Button>
              )
            )}
          </li>
        ))}
      </ul>
      {members.hasNextPage && (
        <Button
          variant="outline"
          className="justify-self-center"
          onClick={() => void members.fetchNextPage()}
        >
          More members
        </Button>
      )}
    </div>
  );
}

const ACTIVITY: Record<string, string> = {
  JOIN: "joined",
  LEAVE: "left",
  POST_CREATED: "posted",
  POST_LIKED: "liked a post",
  COMMENT_CREATED: "commented",
  MEMBER_INVITED: "invited people",
};

function Activity({ id }: { id: string }) {
  const activity = api.community.activity.useInfiniteQuery(
    { communityId: id },
    { getNextPageParam: (page) => page.nextCursor ?? undefined },
  );
  const rows = activity.data?.pages.flatMap((page) => page.items) ?? [];
  if (activity.isPending) return <Skeleton className="h-40 rounded-3xl" />;
  if (rows.length === 0) return <p className="cm-note">Nothing has happened here yet.</p>;
  return (
    <div className="grid gap-3">
      <ul className="cm-activity">
        {rows.map((row) => (
          <li key={row.id}>
            <PersonAvatar person={row.actor} className="size-7" />
            <span className="min-w-0 flex-1 text-sm">
              <b>{nameOf(row.actor)}</b> {ACTIVITY[row.type] ?? row.type.toLowerCase()}
            </span>
            <span className="text-fg-faint text-xs">{timeAgo(row.createdAt)}</span>
          </li>
        ))}
      </ul>
      {activity.hasNextPage && (
        <Button
          variant="outline"
          className="justify-self-center"
          onClick={() => void activity.fetchNextPage()}
        >
          Older
        </Button>
      )}
    </div>
  );
}
