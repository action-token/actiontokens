"use client";
/* eslint-disable @next/next/no-img-element -- community pictures and token icons come from many hosts */

import { Plus, Search, Users } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

import { Button } from "@actiontokens/ui/components/button";
import { Skeleton } from "@actiontokens/ui/components/skeleton";
import { cn } from "@actiontokens/ui/lib/cn";
import { useConnectWalletDialogStore } from "@actiontokens/wallet";

import { api } from "~/trpc/react";

import { CommunityCard, compact } from "./parts";

type Tab = "all" | "mine";

/**
 * Communities: token-gated crews run by fans and organizations. All of them (newest or biggest
 * first, searchable, loading more as you go) or just the ones you're in; Create opens the form.
 */
export function CommunitiesView() {
  const { status } = useSession();
  const signedIn = status === "authenticated";
  const openWallet = useConnectWalletDialogStore((state) => state.setIsOpen);
  const [tab, setTab] = useState<Tab>("all");
  const [sort, setSort] = useState<"members" | "newest">("members");
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const id = window.setTimeout(() => setSearch(typed.trim()), 300);
    return () => window.clearTimeout(id);
  }, [typed]);

  const all = api.community.list.useInfiniteQuery(
    { search: search || undefined, sort },
    { getNextPageParam: (page) => page.nextCursor ?? undefined, enabled: tab === "all" },
  );
  const mine = api.community.mine.useQuery(undefined, { enabled: signedIn && tab === "mine" });
  const items = all.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="grid gap-6">
      <div className="cm-toolbar">
        <div className="cm-tabs" role="tablist">
          {(["all", "mine"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => (value === "mine" && !signedIn ? openWallet(true) : setTab(value))}
            >
              {value === "all" ? "All crews" : "My crews"}
            </button>
          ))}
        </div>
        {tab === "all" && (
          <>
            <label className="cm-search">
              <Search className="size-4 shrink-0" />
              <input
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                placeholder="Search communities"
                aria-label="Search communities"
              />
            </label>
            <div className="cm-tabs cm-tabs--small" role="group" aria-label="Sort">
              {(["members", "newest"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={sort === value}
                  onClick={() => setSort(value)}
                >
                  {value === "members" ? "Biggest" : "Newest"}
                </button>
              ))}
            </div>
          </>
        )}
        <Button
          className="ml-auto"
          {...(signedIn ? { asChild: true } : { onClick: () => openWallet(true) })}
        >
          {signedIn ? (
            <Link href="/communities/new">
              <Plus /> Create community
            </Link>
          ) : (
            <>
              <Plus /> Create community
            </>
          )}
        </Button>
      </div>

      {tab === "all" ? (
        all.isPending ? (
          <Grid>
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-72 rounded-3xl" />
            ))}
          </Grid>
        ) : items.length === 0 ? (
          <Empty
            title={search ? "Nothing matches that" : "No communities yet"}
            text={
              search
                ? "Try another word."
                : "Start the first one: pick a token, set the gate, invite your people."
            }
          />
        ) : (
          <>
            <Grid>
              {items.map((community) => (
                <CommunityCard key={community.id} community={community} />
              ))}
            </Grid>
            {all.hasNextPage && (
              <Button
                variant="outline"
                className="justify-self-center"
                disabled={all.isFetchingNextPage}
                onClick={() => void all.fetchNextPage()}
              >
                {all.isFetchingNextPage ? "Loading…" : "Load more"}
              </Button>
            )}
          </>
        )
      ) : mine.isPending ? (
        <Grid>
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-24 rounded-3xl" />
          ))}
        </Grid>
      ) : !mine.data?.length ? (
        <Empty
          title="You're not in a crew yet"
          text="Join one from All crews, or start your own."
        />
      ) : (
        <Grid>
          {mine.data.map((community) => (
            <Link key={community.id} href={`/communities/${community.id}`} className="cm-mine">
              <span className="cm-card-pic cm-card-pic--small">
                {community.profileUrl ? (
                  <img src={community.profileUrl} alt="" />
                ) : (
                  <Users className="size-5" />
                )}
              </span>
              <span className="min-w-0">
                <span className="cm-card-title">{community.title}</span>
                <span className="text-fg-muted block text-xs">
                  {compact(community._count.members)} members · {compact(community._count.posts)}{" "}
                  posts
                  {community.hiddenAt && " · hidden by the admins"}
                </span>
              </span>
            </Link>
          ))}
        </Grid>
      )}
    </div>
  );
}

function Grid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("cm-grid", className)}>{children}</div>;
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="cm-empty">
      <span className="cm-empty-icon">
        <Users className="size-7" />
      </span>
      <p className="font-display text-2xl uppercase">{title}</p>
      <p className="text-fg-muted max-w-sm text-sm">{text}</p>
    </div>
  );
}
