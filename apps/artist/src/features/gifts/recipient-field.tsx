"use client";

import { Search, Users, X } from "lucide-react";

import { Input } from "@bandcoin/ui/components/input";
import { Label } from "@bandcoin/ui/components/label";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { Avatar } from "@bandcoin/ui/patterns/person";

import { api } from "~/trpc/react";

export type Picked = { name: string | null; image: string | null };

/**
 * Who gets a gift: pick a follower, or type a username, email or wallet.
 * `typed` is the debounced text the parent quotes with.
 */
export function RecipientField({
  value,
  typed,
  picked,
  onChange,
  hint,
}: {
  value: string;
  typed: string;
  picked: Picked | null;
  onChange: (value: string, picked: Picked | null) => void;
  hint: string;
}) {
  const followers = api.gifts.followers.useQuery({
    search: picked ? undefined : typed || undefined,
  });

  return (
    <div className="grid gap-2">
      <Label htmlFor="gift-to">Who gets it</Label>
      <div className="relative">
        <Search className="text-fg-muted absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          id="gift-to"
          value={value}
          placeholder={hint}
          autoComplete="off"
          className="pl-9"
          onChange={(event) => onChange(event.target.value, null)}
        />
      </div>
      {picked ? (
        <p className="text-fg-muted flex items-center gap-2 text-sm">
          <Avatar src={picked.image} name={picked.name} className="size-6 text-[11px]" />
          Sending to <b className="text-fg">{picked.name ?? "this fan"}</b>
          <button
            type="button"
            aria-label="Choose someone else"
            className="hover:text-fg ml-auto"
            onClick={() => onChange("", null)}
          >
            <X className="size-4" />
          </button>
        </p>
      ) : (
        <div className="rounded-xl border">
          <p className="text-fg-muted flex items-center gap-1.5 border-b px-3 py-2 text-xs font-semibold tracking-wider uppercase">
            <Users className="size-3.5" /> Your followers
          </p>
          {followers.isPending ? (
            <Skeleton className="m-3 h-16" />
          ) : followers.isError ? (
            <p className="text-fg-muted p-3 text-sm">Couldn&apos;t load your followers.</p>
          ) : followers.data.length === 0 ? (
            <p className="text-fg-muted p-3 text-sm">
              {typed
                ? "No follower matches. You can still paste a username, email or wallet."
                : "Nobody follows you yet."}
            </p>
          ) : (
            <ul className="max-h-56 divide-y overflow-y-auto">
              {followers.data.map((follower) => (
                <li key={follower.id}>
                  <button
                    type="button"
                    className="hover:bg-surface-2 flex w-full items-center gap-3 px-3 py-2 text-left"
                    onClick={() =>
                      onChange(follower.wallet, { name: follower.name, image: follower.image })
                    }
                  >
                    <Avatar src={follower.image} name={follower.name} className="size-8 text-xs" />
                    <span className="min-w-0 text-sm">
                      <span className="block truncate font-medium">{follower.name ?? "Fan"}</span>
                      {follower.username && (
                        <span className="text-fg-muted block truncate text-xs">
                          @{follower.username}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
