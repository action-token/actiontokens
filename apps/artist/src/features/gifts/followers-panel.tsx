"use client";

import { Check, Search, Users } from "lucide-react";
import { useState } from "react";

import { Input } from "@bandcoin/ui/components/input";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { cn } from "@bandcoin/ui/lib/cn";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";
import { Avatar } from "@bandcoin/ui/patterns/person";

import { useDebounced } from "~/lib/use-debounced";
import { api } from "~/trpc/react";

export type Follower = { wallet: string; name: string | null; image: string | null };

/** Your followers beside the form (Wadzzo's gift page): click one to send to them. */
export function FollowersPanel({
  selected,
  onPick,
}: {
  selected: string | null;
  onPick: (follower: Follower) => void;
}) {
  const [search, setSearch] = useState("");
  const typed = useDebounced(search.trim());
  const followers = api.gifts.followers.useQuery({ search: typed || undefined });

  return (
    <aside className="bg-surface border-fg/10 rounded-[1.4rem] border-2 lg:sticky lg:top-6 lg:self-start">
      <div className="border-b p-4">
        <h2 className="display flex items-center gap-2 text-base">
          <Users className="text-primary-text size-4" /> Your followers
        </h2>
        <div className="relative mt-3">
          <Search className="text-fg-muted absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search followers"
            aria-label="Search followers"
            className="pl-9"
          />
        </div>
      </div>
      <div className="max-h-[28rem] overflow-y-auto">
        {followers.isPending ? (
          <div className="grid gap-2 p-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-11 rounded-lg" />
            ))}
          </div>
        ) : followers.isError ? (
          <p className="text-fg-muted p-4 text-sm">Couldn&apos;t load your followers.</p>
        ) : followers.data.length === 0 ? (
          <EmptyState
            icon={Users}
            title={typed ? "No follower matches" : "No followers yet"}
            description={
              typed
                ? "You can still type their username, email or wallet in the form."
                : "Fans who follow you show up here."
            }
            className="m-4 py-8"
          />
        ) : (
          <ul className="divide-y">
            {followers.data.map((follower) => (
              <li key={follower.id}>
                <button
                  type="button"
                  onClick={() =>
                    onPick({ wallet: follower.wallet, name: follower.name, image: follower.image })
                  }
                  className={cn(
                    "hover:bg-surface-2 flex w-full items-center gap-3 px-4 py-2.5 text-left",
                    selected === follower.wallet && "bg-primary-soft",
                  )}
                >
                  <Avatar src={follower.image} name={follower.name} className="size-9 text-xs" />
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block truncate font-medium">{follower.name ?? "Fan"}</span>
                    {follower.username && (
                      <span className="text-fg-muted block truncate text-xs">
                        @{follower.username}
                      </span>
                    )}
                  </span>
                  {selected === follower.wallet && (
                    <Check className="text-primary-text size-4 shrink-0" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
