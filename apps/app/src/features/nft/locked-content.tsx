"use client";

import {
  CheckCircle2,
  ExternalLink,
  Image as ImageIcon,
  Link2,
  Lock,
  MapPin,
  Music,
  Video,
} from "lucide-react";
import { useSession } from "next-auth/react";

import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";

import { api, type RouterOutputs } from "~/trpc/react";

import { AR_URL } from "../shell/nav";

type Preview = RouterOutputs["item"]["bySlug"]["lockedContent"][number];
type OwnedPiece = RouterOutputs["item"]["lockedForMe"]["copies"][number]["pieces"][number];

const ICON = { SONG: Music, IMAGE: ImageIcon, VIDEO: Video, OTHER: Link2 } as const;
const KIND = { SONG: "Song", IMAGE: "Image", VIDEO: "Video", OTHER: "Link" } as const;
const mapsLink = (place: { lat: number; lng: number }) =>
  `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`;

/**
 * A contract NFT's locked content on its page. Everyone sees what's locked and
 * where its places are; owners see each copy's progress and, once a piece is
 * unlocked, the piece itself. Links only ever come from the owner query.
 */
export function LockedContent({
  itemId,
  pieces,
  owned,
  network,
}: {
  itemId: string;
  pieces: Preview[];
  owned: boolean;
  /** "mainnet" or "testnet", for the transaction link */
  network: string;
}) {
  const { status } = useSession();
  const mine = api.item.lockedForMe.useQuery(
    { itemId },
    { enabled: owned && status === "authenticated" },
  );
  if (pieces.length === 0) return null;
  const gated = pieces.some((piece) => piece.unlock);

  return (
    <section className="bg-surface grid gap-4 rounded-[1.2rem] border-2 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="display flex items-center gap-2 text-xl">
          <Lock className="text-primary-text size-5" /> Locked content
        </h2>
        {owned && gated && (
          <Button asChild size="sm" variant="outline">
            <a href={AR_URL} target="_blank" rel="noreferrer">
              <MapPin /> Visit places in the AR app
            </a>
          </Button>
        )}
      </div>

      {owned && mine.isPending ? (
        <div className="grid gap-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : owned && mine.data && mine.data.copies.length > 0 ? (
        mine.data.copies.map((copy) => (
          <div key={copy.tokenId} className="grid gap-2">
            {mine.data.copies.length > 1 && (
              <p className="text-fg-muted text-xs font-semibold">Copy #{copy.tokenId}</p>
            )}
            <ul className="divide-y rounded-xl border">
              {copy.pieces.map((piece) => (
                <OwnedRow
                  key={piece.id}
                  piece={piece}
                  network={network}
                  places={pieces.find((entry) => entry.id === piece.id)?.unlock?.places ?? []}
                />
              ))}
            </ul>
          </div>
        ))
      ) : (
        <>
          <p className="text-fg-muted text-sm">
            Owners open these.{" "}
            {gated && "Some unlock only after visiting places, collected in the AR app."}
          </p>
          <ul className="divide-y rounded-xl border">
            {pieces.map((piece) => (
              <PreviewRow key={piece.id} piece={piece} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function Title({ type, label }: { type: Preview["type"]; label: string | null }) {
  const Icon = ICON[type];
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Icon className="text-primary-text size-4 shrink-0" />
      <span className="truncate font-medium">{label || KIND[type]}</span>
      <span className="text-fg-faint text-xs">{KIND[type]}</span>
    </span>
  );
}

function Places({ places }: { places: { lat: number; lng: number; label: string | null }[] }) {
  return (
    <ol className="text-fg-muted grid gap-1 text-xs">
      {places.map((place, index) => (
        <li key={index}>
          <a
            href={mapsLink(place)}
            target="_blank"
            rel="noreferrer"
            className="hover:text-fg inline-flex items-center gap-1 underline-offset-2 hover:underline"
          >
            {index + 1}. {place.label || `${place.lat.toFixed(4)}, ${place.lng.toFixed(4)}`}
            <ExternalLink className="size-3" />
          </a>
        </li>
      ))}
    </ol>
  );
}

function PreviewRow({ piece }: { piece: Preview }) {
  return (
    <li className="grid gap-2 p-3">
      <Title type={piece.type} label={piece.label} />
      {piece.unlock ? (
        <>
          <p className="text-fg-muted text-xs">
            Visit {piece.unlock.places.length}{" "}
            {piece.unlock.places.length === 1 ? "place" : "places"} (within{" "}
            {piece.unlock.radiusMeters} m) to unlock.
          </p>
          <Places places={piece.unlock.places} />
        </>
      ) : (
        <p className="text-fg-muted text-xs">Opens as soon as you own a copy.</p>
      )}
    </li>
  );
}

function OwnedRow({
  piece,
  places,
  network,
}: {
  piece: OwnedPiece;
  places: { lat: number; lng: number; label: string | null }[];
  network: string;
}) {
  const progress = piece.required > 0 ? Math.round((piece.visited / piece.required) * 100) : 100;
  return (
    <li className="grid gap-3 p-3">
      <div className="flex items-center justify-between gap-3">
        <Title type={piece.type} label={piece.label} />
        {piece.unlocked ? (
          <span className="text-success inline-flex shrink-0 items-center gap-1 text-xs font-semibold">
            <CheckCircle2 className="size-3.5" /> Unlocked
          </span>
        ) : (
          <span className="text-fg-muted num shrink-0 text-xs">
            {piece.visited} of {piece.required} places
          </span>
        )}
      </div>
      {piece.unlocked && piece.url ? (
        <>
          <Content type={piece.type} url={piece.url} />
          {piece.onChain?.txHash && (
            <a
              href={`https://stellar.expert/explorer/${network === "mainnet" ? "public" : "testnet"}/tx/${piece.onChain.txHash}`}
              target="_blank"
              rel="noreferrer"
              className="text-fg-muted hover:text-fg inline-flex items-center gap-1 text-xs"
            >
              Recorded on Stellar <ExternalLink className="size-3" />
            </a>
          )}
        </>
      ) : (
        <>
          <div className="bg-surface-2 h-2 overflow-hidden rounded-full" aria-hidden>
            <div className="bg-primary h-full" style={{ width: `${progress}%` }} />
          </div>
          <Places places={places} />
        </>
      )}
    </li>
  );
}

function Content({ type, url }: { type: OwnedPiece["type"]; url: string }) {
  if (type === "SONG") return <audio controls preload="none" src={url} className="w-full" />;
  if (type === "VIDEO")
    return <video controls preload="metadata" src={url} className="w-full rounded-lg" />;
  if (type === "IMAGE")
    return (
      <a href={url} target="_blank" rel="noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" className="max-h-80 rounded-lg object-contain" />
      </a>
    );
  return (
    <Button asChild size="sm" variant="secondary" className="justify-self-start">
      <a href={url} target="_blank" rel="noreferrer">
        Open link <ExternalLink />
      </a>
    </Button>
  );
}
