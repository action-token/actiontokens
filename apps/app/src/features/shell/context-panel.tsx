"use client";

import Link from "next/link";

import { currentTrack, usePlayer } from "../player/player-store";

/** The right-hand panel on Home while a song is loaded: what's playing and what's next. */
export function ContextPanel() {
  return (
    <div className="grid content-start gap-7">
      <NowPlaying />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3">
      <h2 className="display text-base">{title}</h2>
      {children}
    </section>
  );
}

function NowPlaying() {
  const { queue, index, playQueue } = usePlayer();
  const track = currentTrack({ queue, index });
  if (!track) return null;
  const upNext = queue.slice(index + 1, index + 5);

  return (
    <>
      <Section title="Now playing">
        <Link href={`/item/${track.slug}`} className="grid gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- covers come from many hosts */}
          <img
            src={track.coverUrl}
            alt=""
            className="aspect-square w-full rounded-md border object-cover"
          />
          <div>
            <h3 className="truncate text-base font-bold">{track.title}</h3>
            <p className="text-fg-muted truncate text-[13px]">{track.artistName}</p>
          </div>
        </Link>
      </Section>
      {upNext.length > 0 && (
        <Section title="Up next">
          <ul className="grid gap-1">
            {upNext.map((entry, offset) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => playQueue(queue, index + 1 + offset)}
                  className="hover:bg-surface-2 grid w-full grid-cols-[36px_minmax(0,1fr)] items-center gap-3 rounded-sm p-1 text-left text-[13px]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- covers come from many hosts */}
                  <img src={entry.coverUrl} alt="" className="size-9 rounded-sm object-cover" />
                  <span className="min-w-0">
                    <b className="block truncate font-semibold">{entry.title}</b>
                    <span className="text-fg-muted block truncate">{entry.artistName}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}

export function Avatar({
  name,
  url,
  className,
}: {
  name: string;
  url: string | null;
  className?: string;
}) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- avatars come from many hosts
    <img src={url} alt="" className={className ?? "size-9 shrink-0 rounded-full object-cover"} />
  ) : (
    <span
      className={
        className ??
        "bg-surface-3 grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold"
      }
    >
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

