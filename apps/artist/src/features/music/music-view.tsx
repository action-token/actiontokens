"use client";

import { Disc3, Music2, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@bandcoin/ui/components/tabs";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";
import { ErrorState } from "@bandcoin/ui/patterns/error-state";
import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";
import { StatusPill } from "@bandcoin/ui/patterns/status-pill";
import { formatDuration } from "@bandcoin/utils/preview";

import { Money } from "~/components/money";
import { api, type RouterOutputs } from "~/trpc/react";

type Song = RouterOutputs["music"]["songs"][number];
type Album = RouterOutputs["music"]["albums"][number];

export function MusicView() {
  // useSearchParams needs a boundary; the page renders right away and the tab follows
  return (
    <Suspense>
      <MusicTabs />
    </Suspense>
  );
}

function MusicTabs() {
  const router = useRouter();
  const tab = useSearchParams().get("tab") === "albums" ? "albums" : "songs";
  const actions = (
    <>
      <Button asChild variant="secondary">
        <Link href="/music/albums/new">
          <Disc3 /> New album
        </Link>
      </Button>
      <Button asChild>
        <Link href="/music/new">
          <Plus /> New song
        </Link>
      </Button>
    </>
  );

  return (
    <PageBody className="grid gap-6">
      <PageHeader eyebrow="Catalog" title="Music" description="Release songs fans can buy and preview, and group them into albums." actions={actions} />
      <Tabs value={tab} onValueChange={(value) => router.replace(value === "albums" ? "/music?tab=albums" : "/music")}>
        <TabsList>
          <TabsTrigger value="songs">Songs</TabsTrigger>
          <TabsTrigger value="albums">Albums</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === "songs" ? <Songs /> : <Albums />}
    </PageBody>
  );
}

function Songs() {
  const songs = api.music.songs.useQuery();
  if (songs.isPending) return <ListSkeleton />;
  if (songs.isError) return <ErrorState message="Couldn't load your songs." onRetry={() => void songs.refetch()} />;
  if (songs.data.length === 0) {
    return (
      <EmptyState
        icon={Music2}
        title="No songs yet"
        description="Release your first song. Fans can preview 30 seconds and buy it with BANDCOIN or a card."
        action={
          <Button asChild>
            <Link href="/music/new">
              <Plus /> New song
            </Link>
          </Button>
        }
      />
    );
  }
  return (
    <ul className="grid gap-3">
      {songs.data.map((song) => (
        <SongRow key={song.id} song={song} />
      ))}
    </ul>
  );
}

function SongRow({ song }: { song: Song }) {
  const status = song.visibility === "DRAFT" ? { tone: "neutral" as const, label: "Draft" } : song.listingStatus === "SOLD_OUT" ? { tone: "warning" as const, label: "Sold out" } : { tone: "success" as const, label: "Released" };
  const details = [song.albumTitle ?? "Single", song.durationSec ? formatDuration(song.durationSec) : null, `${song.plays.toLocaleString("en-US")} plays`, `${song.sold} sold`, song.stems > 0 ? `${song.stems} stems` : null];
  return (
    <li>
      <Link href={`/music/${song.id}`} className="bg-surface hover:bg-surface-2 flex items-center gap-4 rounded-xl border p-3 transition-colors sm:p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={song.coverUrl} alt="" className="bg-surface-2 size-16 shrink-0 rounded-lg object-cover" />
        <div className="grid min-w-0 flex-1 gap-0.5">
          <b className="truncate">{song.title}</b>
          <span className="text-fg-muted truncate text-sm">{details.filter(Boolean).join(" · ")}</span>
          {song.priceBandcoin && song.priceUsd && (
            <span className="text-fg-muted flex flex-wrap items-center gap-x-3 text-sm">
              <Money amount={song.priceBandcoin} currency="BANDCOIN" /> <Money amount={song.priceUsd} currency="USD" />
            </span>
          )}
        </div>
        <StatusPill tone={status.tone}>{status.label}</StatusPill>
      </Link>
    </li>
  );
}

function Albums() {
  const albums = api.music.albums.useQuery();
  if (albums.isPending) return <ListSkeleton />;
  if (albums.isError) return <ErrorState message="Couldn't load your albums." onRetry={() => void albums.refetch()} />;
  if (albums.data.length === 0) {
    return (
      <EmptyState
        icon={Disc3}
        title="No albums yet"
        description="An album groups songs under one cover. You can also release songs as singles."
        action={
          <Button asChild>
            <Link href="/music/albums/new">
              <Plus /> New album
            </Link>
          </Button>
        }
      />
    );
  }
  return (
    <ul className="grid gap-3">
      {albums.data.map((album) => (
        <AlbumRow key={album.id} album={album} />
      ))}
    </ul>
  );
}

function AlbumRow({ album }: { album: Album }) {
  return (
    <li>
      <Link href={`/music/albums/${album.id}`} className="bg-surface hover:bg-surface-2 flex items-center gap-4 rounded-xl border p-3 transition-colors sm:p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={album.coverUrl} alt="" className="bg-surface-2 size-16 shrink-0 rounded-lg object-cover" />
        <div className="grid min-w-0 flex-1 gap-0.5">
          <b className="truncate">{album.title}</b>
          <span className="text-fg-muted text-sm">{album.songCount === 1 ? "1 song" : `${album.songCount} songs`}</span>
        </div>
      </Link>
    </li>
  );
}

function ListSkeleton() {
  return (
    <div className="grid gap-3">
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
    </div>
  );
}
