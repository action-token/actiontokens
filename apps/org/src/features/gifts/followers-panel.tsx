"use client";

import { Check, Users } from "lucide-react";

import { Skeleton } from "@actiontokens/ui/components/skeleton";
import { cn } from "@actiontokens/ui/lib/cn";
import { Avatar } from "@actiontokens/ui/patterns/person";

import { api } from "~/trpc/react";

export type Follower = { wallet: string; name: string | null; image: string | null };

/** Your followers matching what's typed in the recipient box; click one to send to them. */
export function FollowerList({
  search,
  selected,
  onPick,
}: {
  search: string;
  selected: string | null;
  onPick: (follower: Follower) => void;
}) {
  const followers = api.gifts.followers.useQuery({ search: search || undefined });

  return (
    <div className="rounded-xl border">
      <p className="text-fg-muted flex items-center gap-1.5 border-b px-3 py-2 text-xs font-semibold tracking-wider uppercase">
        <Users className="size-3.5" /> Your followers
      </p>
      {followers.isPending ? (
        <div className="grid gap-2 p-3">
          <Skeleton className="h-10 rounded-lg" />
          <Skeleton className="h-10 rounded-lg" />
        </div>
      ) : followers.isError ? (
        <p className="text-fg-muted p-3 text-sm">Couldn&apos;t load your followers.</p>
      ) : followers.data.length === 0 ? (
        <p className="text-fg-muted p-3 text-sm">
          {search
            ? "No follower matches. You can still send to a username, email or wallet."
            : "Nobody follows you yet. Type a username, email or wallet above."}
        </p>
      ) : (
        <ul className="max-h-72 divide-y overflow-y-auto">
          {followers.data.map((follower) => (
            <li key={follower.id}>
              <button
                type="button"
                onClick={() =>
                  onPick({ wallet: follower.wallet, name: follower.name, image: follower.image })
                }
                className={cn(
                  "hover:bg-surface-2 flex w-full items-center gap-3 px-3 py-2.5 text-left",
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
  );
}
