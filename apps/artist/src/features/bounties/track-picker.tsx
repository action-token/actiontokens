"use client";

import { Loader2, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import { Input } from "@bandcoin/ui/components/input";

import { useDebounced } from "~/lib/use-debounced";
import { api, type RouterOutputs } from "~/trpc/react";

import { usePortal } from "../portal/use-portal";

type Found = RouterOutputs["bounties"]["searchTracks"][number];

/** A track in the form: what Last.fm gave us plus how many plays fans need. */
export type PickedTrack = Omit<Found, "id"> & { id: string; targetPlays: number };

export const MAX_TRACKS = 5;
const DEFAULT_PLAYS = 3;

/**
 * Search Last.fm (or take one of the artist's top tracks), add up to five, and
 * say how many plays each needs. Fans' listening is checked against these.
 */
export function TrackPicker({
  tracks,
  onChange,
}: {
  tracks: PickedTrack[];
  onChange: (tracks: PickedTrack[]) => void;
}) {
  const portal = usePortal();
  const [query, setQuery] = useState("");
  const settled = useDebounced(query, 400);
  const search = api.bounties.searchTracks.useQuery(
    { query: settled },
    { enabled: settled.trim().length > 1, staleTime: 30_000 },
  );
  const artistName = portal.artist?.name ?? "";
  const top = api.bounties.topTracks.useQuery(
    { artist: artistName },
    { enabled: artistName.length > 0, staleTime: 30 * 60_000 },
  );

  function add(found: Found) {
    if (tracks.some((track) => track.id === found.id || track.lastFmUrl === found.lastFmUrl))
      return void toast.error("That track is already added.");
    if (tracks.length >= MAX_TRACKS)
      return void toast.error(`You can add up to ${MAX_TRACKS} tracks.`);
    onChange([...tracks, { ...found, targetPlays: DEFAULT_PLAYS }]);
    setQuery("");
  }

  const change = (id: string, patch: Partial<PickedTrack>) =>
    onChange(tracks.map((track) => (track.id === id ? { ...track, ...patch } : track)));
  const searching = settled !== query || search.isFetching;
  const showResults = query.trim().length > 1;

  return (
    <div className="grid gap-3">
      <div className="relative">
        <Search className="text-fg-muted absolute top-2.5 left-3 size-4" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search a song or artist on Last.fm…"
          aria-label="Search Last.fm"
          className="pl-9"
        />
        {searching && showResults && (
          <Loader2 className="text-fg-muted absolute top-2.5 right-3 size-4 animate-spin" />
        )}
        {showResults && !searching && (
          <ul className="bg-surface absolute inset-x-0 top-11 z-20 max-h-72 divide-y overflow-y-auto rounded-xl border shadow-lg">
            {search.data && search.data.length > 0 ? (
              search.data.map((found) => (
                <li key={found.id}>
                  <button
                    type="button"
                    onClick={() => add(found)}
                    className="hover:bg-surface-2 flex w-full items-center gap-3 px-3 py-2 text-left"
                  >
                    <Art url={found.albumArtUrl} />
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-sm">{found.title}</b>
                      <span className="text-fg-muted block truncate text-xs">
                        {found.artistName}
                      </span>
                    </span>
                    <Plus className="size-4 shrink-0" />
                  </button>
                </li>
              ))
            ) : (
              <li className="text-fg-muted px-4 py-3 text-center text-sm">
                No tracks found for &ldquo;{query}&rdquo;.
              </li>
            )}
          </ul>
        )}
      </div>

      {top.data && top.data.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-fg-muted text-xs font-semibold">Your top tracks:</span>
          {top.data.map((found) => (
            <button
              key={found.id}
              type="button"
              onClick={() => add(found)}
              className="bg-surface text-fg-muted hover:text-fg hover:border-primary/40 rounded-full border px-2.5 py-1 text-xs transition-colors"
            >
              + {found.title}
            </button>
          ))}
        </div>
      )}

      <p className="text-fg-faint text-xs">
        {tracks.length} / {MAX_TRACKS} tracks added
      </p>

      {tracks.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {tracks.map((track) => (
            <li
              key={track.id}
              className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
            >
              <div className="flex min-w-0 items-center gap-3">
                <Art url={track.albumArtUrl} />
                <span className="min-w-0">
                  <b className="block truncate text-sm">{track.title}</b>
                  <span className="text-fg-muted block truncate text-xs">{track.artistName}</span>
                </span>
              </div>
              <label className="flex items-center gap-2 text-xs">
                <span className="text-fg-muted">Plays needed</span>
                <Input
                  inputMode="numeric"
                  aria-label={`Plays needed for ${track.title}`}
                  value={track.targetPlays}
                  onChange={(event) =>
                    change(track.id, {
                      targetPlays: Math.min(
                        1000,
                        Number(event.target.value.replace(/\D/g, "")) || 1,
                      ),
                    })
                  }
                  className="h-8 w-16"
                />
              </label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Remove ${track.title}`}
                onClick={() => onChange(tracks.filter((entry) => entry.id !== track.id))}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Art({ url }: { url: string | null }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="bg-surface-2 size-9 shrink-0 rounded border object-cover" />
  ) : (
    <span className="bg-surface-2 size-9 shrink-0 rounded border" aria-hidden />
  );
}
